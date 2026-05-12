import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Lightweight ping used by Vercel Cron (see vercel.json) to keep the Supabase
// free-tier project from auto-pausing after 7 days of inactivity. Reads a
// single row from `cards` (public-read RLS) so anon auth is enough.
export async function GET() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("cards").select("id").limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
