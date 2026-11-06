/** Packing list sections, in the order the apps show them. Safe to import in the apps. */
export const PACKING_CATEGORIES = ["documents", "clothing", "footwear", "toiletries", "health", "electronics", "gear", "other"] as const;
export type PackingCategory = (typeof PACKING_CATEGORIES)[number];

export const PACKING_EMOJI: Record<PackingCategory, string> = {
  documents: "🛂",
  clothing: "👕",
  footwear: "👟",
  toiletries: "🧴",
  health: "🩹",
  electronics: "🔌",
  gear: "🎒",
  other: "📦",
};

export const isPackingCategory = (value: unknown): value is PackingCategory =>
  typeof value === "string" && (PACKING_CATEGORIES as readonly string[]).includes(value);

/** Groups items into sections: categories in order, then items with none (added by hand). */
export function groupPacking<T extends { category?: PackingCategory; isPacked: boolean }>(items: T[]) {
  const byPacked = (a: T, b: T) => Number(a.isPacked) - Number(b.isPacked);
  const sections: { key: PackingCategory | "none"; items: T[] }[] = [];
  for (const key of PACKING_CATEGORIES) {
    const rows = items.filter((i) => i.category === key).sort(byPacked);
    if (rows.length) sections.push({ key, items: rows });
  }
  const rest = items.filter((i) => !i.category).sort(byPacked);
  if (rest.length) sections.push({ key: "none", items: rest });
  return sections;
}
