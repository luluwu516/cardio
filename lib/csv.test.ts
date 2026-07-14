import { describe, it, expect } from "vitest";

import { csvEscape, parseCsv, safeFilename } from "./csv";

describe("csvEscape", () => {
  it("leaves plain values unquoted", () => {
    expect(csvEscape("Blue-Eyes")).toBe("Blue-Eyes");
    expect(csvEscape(42)).toBe("42");
  });

  it("returns empty string for null / undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("quotes and doubles quotes when the value has commas / quotes / newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("parseCsv ↔ csvEscape round-trip", () => {
  // The backup embeds each card's `raw` JSON in a single field, so the parser
  // must survive commas, escaped quotes and newlines inside one cell. This is
  // the property that guards restore integrity.
  it("round-trips a row containing embedded JSON with commas, quotes, newlines", () => {
    const raw = JSON.stringify({
      name: 'Card "X"',
      desc: "line1\nline2",
      sets: ["A", "B,C"],
    });
    const fields = ["YGO", "12345", "Some, Name", raw, "2"];
    const line = fields.map(csvEscape).join(",");
    const parsed = parseCsv(line);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(fields);
    // And the embedded JSON is still valid after the trip.
    expect(JSON.parse(parsed[0][3])).toEqual(JSON.parse(raw));
  });

  it("parses multiple rows and tolerates CRLF", () => {
    const csv = "a,b\r\nc,d\r\n";
    expect(parseCsv(csv)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps a trailing row with no final newline", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("preserves empty fields", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});

describe("safeFilename", () => {
  it("slugifies and trims to a filesystem-safe fragment", () => {
    expect(safeFilename("My Deck! (YGO)")).toBe("My-Deck-YGO");
  });

  it("falls back when nothing usable remains", () => {
    expect(safeFilename("！！！", "deck")).toBe("deck");
  });
});
