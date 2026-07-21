import { NextRequest, NextResponse } from "next/server";

// Keep in sync with lib/admin/session.ts
const ADMIN_SESSION_COOKIE = "scout_admin_session";
const LOGIN_PATH = "/control-panel/login";

// Paths within control-panel that unauthenticated users may reach (login,
// account activation, and password recovery).
const PUBLIC_PATHS = new Set([
  LOGIN_PATH,
  "/control-panel/activate",
  "/control-panel/forgot-password",
  "/control-panel/reset-password"
]);

function hasSessionCookie(request: NextRequest): boolean {
  const cookieValue = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return Boolean(cookieValue && cookieValue.trim().length > 0);
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLoginPath = pathname === LOGIN_PATH;
  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const isAuthenticated = hasSessionCookie(request);

  // Unauthenticated users can only access public control-panel pages.
  if (!isAuthenticated && !isPublicPath) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    const next = `${pathname}${search}`;
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated users should not stay on the login page.
  if (isAuthenticated && isLoginPath) {
    return NextResponse.redirect(new URL("/control-panel", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/control-panel/:path*"]
};
