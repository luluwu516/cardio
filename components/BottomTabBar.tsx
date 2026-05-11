"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/search", label: "Search" },
  { href: "/collection", label: "Collection" },
  { href: "/scan", label: "Scan" },
  { href: "/decks", label: "Decks" },
];

const HIDE_ON_PREFIXES = ["/login", "/auth"];

export function BottomTabBar() {
  const pathname = usePathname();
  if (HIDE_ON_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-black/95"
    >
      <ul className="mx-auto flex w-full max-w-3xl">
        {TABS.map((t) => {
          const active =
            pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex items-center justify-center py-3 text-xs font-medium transition-colors " +
                  (active
                    ? "text-zinc-900 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300")
                }
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
