// Shown while the collection page's server data (all owned cards) loads, so
// navigation gives instant feedback instead of a blank screen.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="mb-4 h-8 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-3 h-9 w-full animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      <ul className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="h-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
          />
        ))}
      </ul>
    </main>
  );
}
