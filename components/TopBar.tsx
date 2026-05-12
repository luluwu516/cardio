import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { TopBarClient } from "./TopBarClient";

// Prefer the OAuth provider's display name (Google fills `full_name` and
// `name`; we also accept `given_name` as a softer fallback). Email/password
// signups have an empty user_metadata, so we fall back to the email local
// part, then to a generic "user" label.
function pickDisplayName(user: User): string {
  const meta = user.user_metadata ?? {};
  const candidates = [meta.full_name, meta.name, meta.given_name];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const email = user.email;
  if (email) return email.split("@")[0] || email;
  return "user";
}

// Async server component: looks up the current user once per page render and
// hands the display name down to the client component that handles the
// path-aware visibility and the sign-out form. Returns null on the unauth
// side so the /login page renders without a stray "Hello, undefined".
export async function TopBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return <TopBarClient name={pickDisplayName(user)} />;
}
