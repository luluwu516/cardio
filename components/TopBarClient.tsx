"use client";

import { usePathname } from "next/navigation";

import { signOut } from "@/app/login/actions";

const HIDE_ON_PREFIXES = ["/login", "/auth"];

export function TopBarClient({ name }: { name: string }) {
  const pathname = usePathname();
  if (HIDE_ON_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-black/95">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-3 px-4 py-2">
        <span className="min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-400">
          Hello,{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {name}
          </span>
        </span>
        <form action={signOut} className="shrink-0">
          <button className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
