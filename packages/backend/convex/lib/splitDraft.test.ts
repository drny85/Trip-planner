import { describe, expect, test } from "vitest";
import { draftFrom, prefill, readDraft } from "./splitDraft";

describe("expense form", () => {
  test("equal split previews each share and is ready to send", () => {
    const r = readDraft(1000, { mode: "equal", people: ["a", "b", "c"], inputs: {} });
    expect(r.error).toBeNull();
    expect(r.preview).toEqual({ a: 334, b: 333, c: 333 });
    expect(r.split).toEqual({ mode: "equal", people: ["a", "b", "c"], values: undefined });
  });
  test("exact amounts show what's left to assign", () => {
    const draft = { mode: "exact" as const, people: ["a", "b"], inputs: { a: "30", b: "15,50" } };
    expect(readDraft(5000, draft)).toMatchObject({ remaining: 450, error: "exactMismatch", split: null });
    expect(readDraft(4550, draft)).toMatchObject({ remaining: 0, error: null, split: { values: [3000, 1550] } });
  });
  test("percentages and shares", () => {
    expect(readDraft(10000, { mode: "percent", people: ["a", "b"], inputs: { a: "60", b: "40" } })).toMatchObject({ remaining: 0, error: null, preview: { a: 6000, b: 4000 }, split: { values: [6000, 4000] } });
    expect(readDraft(10000, { mode: "percent", people: ["a", "b"], inputs: { a: "60", b: "" } })).toMatchObject({ remaining: 4000, error: "percentMismatch" });
    expect(readDraft(9000, { mode: "shares", people: ["a", "b"], inputs: { a: "2", b: "1" } })).toMatchObject({ error: null, preview: { a: 6000, b: 3000 } });
    expect(readDraft(9000, { mode: "shares", people: ["a"], inputs: { a: "1.5" } }).error).toBe("badValue");
    expect(readDraft(null, { mode: "equal", people: ["a"], inputs: {} }).error).toBe("badAmount");
  });
  test("prefill starts from an even split, and edits round-trip", () => {
    expect(prefill("percent", ["a", "b", "c"], 100)).toEqual({ a: "33.34", b: "33.33", c: "33.33" });
    expect(prefill("exact", ["a", "b"], 1001)).toEqual({ a: "5.01", b: "5" });
    expect(prefill("shares", ["a", "b"], 1)).toEqual({ a: "1", b: "1" });
    const draft = draftFrom({ mode: "exact", shares: [{ userId: "a", value: 3000 }, { userId: "b", value: 1550 }] });
    expect(draft).toEqual({ mode: "exact", people: ["a", "b"], inputs: { a: "30", b: "15.50" } });
    expect(readDraft(4550, draft).split?.values).toEqual([3000, 1550]);
  });
});
