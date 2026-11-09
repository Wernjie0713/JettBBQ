// Admin session upkeep: refreshes Supabase auth cookies on every /admin request (Server Components
// can't write cookies) and does an optimistic redirect to the login page when there is no session.
// This is NOT the authorization check: every admin page and action calls requireAdmin() itself.

import { NextResponse, type NextRequest } from "next/server";
import { cookieSessionClient } from "@/lib/supabase/session";

const LOGIN_PATH = "/admin/login";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Same client setup as the app (including the request timeout), over the request's cookies.
  const supabase = cookieSessionClient({
    getAll: () => request.cookies.getAll(),
    setAll: (toSet) => {
      for (const { name, value } of toSet) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
    },
  });

  // Validates the JWT and refreshes it if expired (writes new cookies through setAll).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const onLogin = request.nextUrl.pathname === LOGIN_PATH;

  if (!signedIn && !onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
