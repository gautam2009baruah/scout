import { NextRequest, NextResponse } from "next/server";
import { REQUEST_BODY_LIMITS } from "@/lib/validation/request";

// Keep in sync with lib/admin/session.ts
const ADMIN_SESSION_COOKIE = "scout_admin_session";
const LOGIN_PATH = "/control-panel/login";

const PUBLIC_PATHS = new Set([
  LOGIN_PATH,
  "/control-panel/activate",
  "/control-panel/forgot-password",
  "/control-panel/reset-password",
]);

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

function hasSessionCookie(request: NextRequest): boolean {
  const cookieValue = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return Boolean(cookieValue && cookieValue.trim().length > 0);
}

function jsonBodyLimit(pathname: string): number {
  return pathname.startsWith("/chat/") || pathname.startsWith("/api/chatbot/")
    ? REQUEST_BODY_LIMITS.chatbotJson
    : REQUEST_BODY_LIMITS.adminJson;
}

function rejectDeclaredOversizedJson(request: NextRequest, pathname: string): NextResponse | null {
  if (!BODY_METHODS.has(request.method)) return null;
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/json")) return null;

  const contentLength = Number(request.headers.get("content-length"));
  const maxBytes = jsonBodyLimit(pathname);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return NextResponse.json(
      { message: `Request body must be ${maxBytes} bytes or fewer.` },
      { status: 413 },
    );
  }
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const oversizedResponse = rejectDeclaredOversizedJson(request, pathname);
  if (oversizedResponse) return oversizedResponse;

  if (!pathname.startsWith("/control-panel")) {
    return NextResponse.next();
  }

  const isLoginPath = pathname === LOGIN_PATH;
  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const isAuthenticated = hasSessionCookie(request);

  if (!isAuthenticated && !isPublicPath) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isLoginPath) {
    return NextResponse.redirect(new URL("/control-panel", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/control-panel/:path*", "/api/:path*", "/chat/:path*", "/conversations/:path*"],
};
