import { headers } from "next/headers";

import { TopBarClient } from "./TopBarClient";

// Read the display name from the request header that proxy.ts / updateSession
// sets after validating the session. This deliberately avoids a second
// Supabase auth round-trip on every page render — the middleware already
// did the auth call, we just consume its result.
//
// If the header is absent (anon page request) we render nothing; TopBarClient
// also self-hides on /login and /auth/* paths.
export async function TopBar() {
  const h = await headers();
  const name = h.get("x-cardio-user-name");
  if (!name) return null;
  return <TopBarClient name={name} />;
}
