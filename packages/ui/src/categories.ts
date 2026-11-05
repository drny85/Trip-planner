/** Display metadata for activity categories, shared by web and mobile. */
export const categoryMeta = {
  sightseeing: { label: "Sightseeing", emoji: "🏯", color: "#6366f1" },
  food: { label: "Dining", emoji: "🍜", color: "#f97316" },
  lodging: { label: "Stays", emoji: "🛏️", color: "#0ea5e9" },
  transport: { label: "Transport", emoji: "🚄", color: "#64748b" },
  shopping: { label: "Shopping", emoji: "🛍️", color: "#ec4899" },
  nightlife: { label: "Nightlife", emoji: "🌙", color: "#8b5cf6" },
  nature: { label: "Nature", emoji: "🌿", color: "#16a34a" },
  other: { label: "Activity", emoji: "📍", color: "#0e7c66" },
} as const;

export type Category = keyof typeof categoryMeta;

export const getCategory = (category?: string) =>
  categoryMeta[(category as Category) ?? "other"] ?? categoryMeta.other;

/**
 * Labels for subcategory keys. Which keys belong under which category lives in
 * the backend (`@trip/backend/categories`), which validates them.
 */
export const subcategoryMeta: Record<string, { label: string; emoji: string }> = {
  hotel: { label: "Hotel", emoji: "🏨" },
  home: { label: "Home", emoji: "🏡" },
  airbnb: { label: "Airbnb", emoji: "🔑" },
  hostel: { label: "Hostel", emoji: "🛌" },
  resort: { label: "Resort", emoji: "🏝️" },
  camping: { label: "Camping", emoji: "⛺" },
  breakfast: { label: "Breakfast", emoji: "🍳" },
  brunch: { label: "Brunch", emoji: "🥞" },
  lunch: { label: "Lunch", emoji: "🥪" },
  dinner: { label: "Dinner", emoji: "🍽️" },
  cafe: { label: "Cafe", emoji: "☕" },
  snack: { label: "Snack", emoji: "🍡" },
  drinks: { label: "Drinks", emoji: "🍹" },
  landmark: { label: "Landmark", emoji: "🗼" },
  museum: { label: "Museum", emoji: "🏛️" },
  temple: { label: "Temple", emoji: "⛩️" },
  tour: { label: "Tour", emoji: "🧭" },
  viewpoint: { label: "Viewpoint", emoji: "🌇" },
  flight: { label: "Flight", emoji: "✈️" },
  train: { label: "Train", emoji: "🚄" },
  bus: { label: "Bus", emoji: "🚌" },
  car: { label: "Car", emoji: "🚗" },
  ferry: { label: "Ferry", emoji: "⛴️" },
  taxi: { label: "Taxi", emoji: "🚕" },
  walk: { label: "Walk", emoji: "🚶" },
  market: { label: "Market", emoji: "🧺" },
  mall: { label: "Mall", emoji: "🏬" },
  boutique: { label: "Boutique", emoji: "👗" },
  souvenirs: { label: "Souvenirs", emoji: "🎁" },
  bar: { label: "Bar", emoji: "🍸" },
  club: { label: "Club", emoji: "🪩" },
  "live-music": { label: "Live music", emoji: "🎷" },
  show: { label: "Show", emoji: "🎭" },
  park: { label: "Park", emoji: "🌳" },
  beach: { label: "Beach", emoji: "🏖️" },
  hike: { label: "Hike", emoji: "🥾" },
  garden: { label: "Garden", emoji: "🌸" },
};

export const getSubcategory = (sub?: string) => (sub ? subcategoryMeta[sub] : undefined);

/** "Stays · Airbnb", or just "Dining" when there is no subcategory. */
export function categoryLabel(category?: string, sub?: string) {
  const c = getCategory(category);
  const s = getSubcategory(sub);
  return { emoji: s?.emoji ?? c.emoji, text: s ? `${c.label} · ${s.label}` : c.label, color: c.color };
}

/** Second link in the image fallback chain: a stable free placeholder photo. */
export const fallbackPhoto = (seed: string, width = 800, height = 600) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed.slice(0, 40))}/${width}/${height}`;
