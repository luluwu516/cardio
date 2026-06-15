// CSV + file-download helpers shared by the collection export and the deck
// buylist export. The domain-specific row builders (which columns, what totals)
// stay in their own components; only these mechanical bits are shared.

/** Quote a CSV field when it contains a comma, quote, or newline. */
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Compact YYYYMMDD stamp for export filenames. */
export function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** Slugify a user-supplied name into a filesystem-safe filename fragment. */
export function safeFilename(name: string, fallback = "export"): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  );
}

/** Trigger a browser download of in-memory content. Client-only (uses DOM). */
export function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
