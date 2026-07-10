import { NextRequest, NextResponse } from "next/server";

// Keep in sync with lib/admin/session.ts
const ADMIN_SESSION_COOKIE = "scout_admin_session";
const LOGIN_PATH = "/control-panel/login";

function hasSessionCookie(request: NextRequest): boolean {
  const cookieValue = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return Boolean(cookieValue && cookieValue.trim().length > 0);
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLoginPath = pathname === LOGIN_PATH;
  const isAuthenticated = hasSessionCookie(request);

  // Unauthenticated users can only access the login page in control-panel.
  if (!isAuthenticated && !isLoginPath) {
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
