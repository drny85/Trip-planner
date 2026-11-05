/** One color per day of a story (map lines, pins and chapter labels), cycling for long trips. */
export const DAY_COLORS = ["#0e7c66", "#e07a2f", "#3b6fd8", "#c2417a", "#7a52c7", "#2f9e9e", "#b8860b"];
export const dayColor = (dayNumber: number) => DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length]!;

export type RouteDay = { dayNumber: number; stops: { _id: string; title: string; address: string; latitude: number; longitude: number }[] };
