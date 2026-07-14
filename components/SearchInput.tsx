"use client";

import type { InputHTMLAttributes } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  className?: string;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "className"
>;

export function SearchInput({ value, onChange, className, ...rest }: Props) {
  return (
    <div className={"relative " + (className ?? "")}>
      <input
        // Card names ("Exodia", "Blue-Eyes") shouldn't be auto-capitalised or
        // "corrected" on mobile; enterKeyHint makes the on-screen return key
        // read "Search". Placed before {...rest} so callers can still override.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 pr-9 text-base outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-200 text-xs leading-none text-zinc-600 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
