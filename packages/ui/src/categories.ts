/** Display metadata for activity categories, shared by web and mobile. */
export const categoryMeta = {
  sightseeing: { label: "Sightseeing", emoji: "🏯", color: "#6366f1" },
  food: { label: "Food & drink", emoji: "🍜", color: "#f97316" },
  lodging: { label: "Stay", emoji: "🛏️", color: "#0ea5e9" },
  transport: { label: "Transport", emoji: "🚄", color: "#64748b" },
  shopping: { label: "Shopping", emoji: "🛍️", color: "#ec4899" },
  nightlife: { label: "Nightlife", emoji: "🌙", color: "#8b5cf6" },
  nature: { label: "Nature", emoji: "🌿", color: "#16a34a" },
  other: { label: "Activity", emoji: "📍", color: "#0e7c66" },
} as const;

export type Category = keyof typeof categoryMeta;

export const getCategory = (category?: string) =>
  categoryMeta[(category as Category) ?? "other"] ?? categoryMeta.other;

/** Second link in the image fallback chain: a stable free placeholder photo. */
export const fallbackPhoto = (seed: string, width = 800, height = 600) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed.slice(0, 40))}/${width}/${height}`;
