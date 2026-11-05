/**
 * Two-level activity taxonomy: a category (Stays, Dining, ...) and an optional
 * subcategory under it (Hotel, Airbnb / Breakfast, Dinner ...). Deeper grouping
 * comes from sub-activities, which can nest to any depth.
 *
 * The stored keys stay stable ("lodging", "food") so older trips keep working;
 * the apps show the labels from @trip/ui.
 */
export const CATEGORY_TREE = {
  lodging: ["hotel", "home", "airbnb", "hostel", "resort", "camping"],
  food: ["breakfast", "brunch", "lunch", "dinner", "cafe", "snack", "drinks"],
  sightseeing: ["landmark", "museum", "temple", "tour", "viewpoint"],
  transport: ["flight", "train", "bus", "car", "ferry", "taxi", "walk"],
  shopping: ["market", "mall", "boutique", "souvenirs"],
  nightlife: ["bar", "club", "live-music", "show"],
  nature: ["park", "beach", "hike", "garden"],
  other: [],
} as const satisfies Record<string, readonly string[]>;

export type Category = keyof typeof CATEGORY_TREE;
export type Subcategory = (typeof CATEGORY_TREE)[Category][number];

export const CATEGORIES = Object.keys(CATEGORY_TREE) as Category[];

export const isCategory = (value: unknown): value is Category =>
  typeof value === "string" && value in CATEGORY_TREE;

/** True when `sub` belongs under `category`. */
export const isSubcategoryOf = (category: Category, sub: unknown): sub is Subcategory =>
  typeof sub === "string" && (CATEGORY_TREE[category] as readonly string[]).includes(sub);

/** Normalizes free text ("Air BnB", "Live music") to a known subcategory key, if any. */
export function toSubcategory(category: Category, value?: string): Subcategory | undefined {
  if (!value) return undefined;
  const key = value.trim().toLowerCase().replace(/[\s_]+/g, "-").replace("air-bnb", "airbnb");
  return isSubcategoryOf(category, key) ? key : undefined;
}
