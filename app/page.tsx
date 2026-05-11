import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">cardIO</h1>
        <p className="text-zinc-700 dark:text-zinc-300">
          Hello, <span className="font-medium">{user.email}</span>
        </p>
        <p className="text-sm text-zinc-500">
          Phase 1 complete — you are signed in. Search, scan, and deck building
          land in upcoming phases.
        </p>
        <form action={signOut}>
          <button className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
