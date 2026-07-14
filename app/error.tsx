"use client";

import { useEffect } from "react";
import Link from "next/link";

// Route-segment error boundary. Renders inside the root layout (TopBar /
// BottomTabBar stay visible) whenever a page or Server Action in a segment
// throws. `console.error` surfaces the error to Vercel's function/runtime logs
// — our lightweight monitoring path for a personal-scale app.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-zinc-500">
        An unexpected error occurred. You can try again, or head back to your
        collection.
      </p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Try again
        </button>
        <Link
          href="/collection"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Go to collection
        </Link>
      </div>
    </main>
  );
}
