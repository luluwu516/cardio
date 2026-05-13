import type { User } from "@supabase/supabase-js";

// Prefer the OAuth provider's display name (Google fills `full_name` and
// `name`; we also accept `given_name` as a softer fallback). Email/password
// signups have an empty user_metadata, so we fall back to the email local
// part, then to a generic "user" label.
//
// Shared between middleware (which injects the result into the forwarded
// request as a header) and TopBar (which reads that header). Keeping the
// logic in one place means TopBar can never disagree with what the
// middleware just decided.
export function pickDisplayName(user: User): string {
  const meta = user.user_metadata ?? {};
  const candidates = [meta.full_name, meta.name, meta.given_name];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  const email = user.email;
  if (email) return email.split("@")[0] || email;
  return "user";
}
