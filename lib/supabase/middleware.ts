import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { pickDisplayName } from "@/lib/auth/displayName";

// Page paths that should NOT be redirected to /login when there's no session.
// `/api/*` is also treated as public (handled inline) so API routes return
// their own JSON instead of a 307 to a login page.
const PUBLIC_PATHS = ["/login", "/auth"];

// Request header set on the forwarded request after getUser succeeds.
// components/TopBar.tsx reads it instead of doing a second auth round-trip.
const USER_NAME_HEADER = "x-cardio-user-name";

export async function updateSession(request: NextRequest) {
  // Strip any inbound copy of our user-name header so a client can't forge
  // it on a public route where middleware doesn't otherwise set it.
  const fwdHeaders = new Headers(request.headers);
  fwdHeaders.delete(USER_NAME_HEADER);

  // Cookies Supabase wants to write during getUser are collected and applied
  // to the final response at the bottom.
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const c of toSet) request.cookies.set(c.name, c.value);
          pendingCookies.push(...toSet);
        },
      },
    },
  );

  // Required: refreshes the auth token if needed. Calling anything else
  // first risks shipping stale cookies to the browser.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) fwdHeaders.set(USER_NAME_HEADER, pickDisplayName(user));

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/api/") || PUBLIC_PATHS.some((p) => path.startsWith(p));

  let response: NextResponse;
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next({ request: { headers: fwdHeaders } });
  }

  // Apply Supabase's pending cookie writes (e.g. a session-clearing hint)
  // to whichever response we return — including the redirect — so they
  // aren't lost on the way to /login.
  for (const c of pendingCookies) {
    response.cookies.set(c.name, c.value, c.options);
  }
  return response;
}
