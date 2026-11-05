export { categoryLabel, categoryMeta, fallbackPhoto, getCategory, getSubcategory, subcategoryMeta, type Category } from "./categories";
export { cn } from "./cn";
export { formatDateRange, formatDay, links } from "./format";

/** "90" -> "1 h 30 min". */
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Whole days between two ISO dates, inclusive ("2027-04-02", "2027-04-06" -> 5). */
export function tripLength(start: string, end: string) {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}
