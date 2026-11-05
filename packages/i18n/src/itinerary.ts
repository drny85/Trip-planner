import { dayTitle } from "@trip/ui";
import type { I18n } from "./react";

/**
 * A printable itinerary as one self-contained HTML page (no scripts, no remote
 * images), so it prints the same from a browser and from expo-print on a phone,
 * and works offline from the phone's saved copy of the trip.
 */
type PrintActivity = {
  title: string;
  description: string;
  address: string;
  phone?: string;
  bookingUrl?: string;
  websiteUrl?: string;
  category?: string;
  subcategory?: string;
  startTime?: string;
  durationMinutes?: number;
  estimatedCost?: number;
  isCompleted: boolean;
  children: PrintActivity[];
};
type PrintTrip = {
  title: string;
  destination: string;
  description?: string;
  startDate: string;
  endDate: string;
  currency?: string;
  subTrips: { dayNumber: number; title: string; date?: string; location?: string; activities: PrintActivity[] }[];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? esc(url) : "");

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const STYLE = `
  @page { margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, "Hiragino Sans", "Noto Sans JP", sans-serif; color: #1c1917; font-size: 11pt; line-height: 1.45; margin: 0; }
  header { border-bottom: 3px solid #0e7c66; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 22pt; margin: 0 0 2px; }
  .meta { color: #57534e; font-size: 10.5pt; }
  .intro { margin: 8px 0 0; color: #44403c; }
  .day { break-inside: auto; margin-top: 18px; }
  .day h2 { font-size: 14pt; margin: 0; color: #0e7c66; break-after: avoid; }
  .day .when { color: #78716c; font-size: 10pt; margin-bottom: 6px; break-after: avoid; }
  .act { display: flex; gap: 10px; padding: 7px 0; border-top: 1px solid #e7e5e4; break-inside: avoid; }
  .time { width: 72px; flex: none; font-weight: 600; font-variant-numeric: tabular-nums; }
  .time small { display: block; font-weight: 400; color: #78716c; }
  .box { width: 12px; height: 12px; border: 1.5px solid #a8a29e; border-radius: 3px; flex: none; margin-top: 3px; text-align: center; font-size: 9px; line-height: 10px; color: #0e7c66; }
  .body { flex: 1; min-width: 0; }
  .title { font-weight: 600; }
  .done .title { color: #78716c; text-decoration: line-through; }
  .cat { color: #78716c; font-size: 9.5pt; }
  .desc { margin: 2px 0 0; color: #44403c; font-size: 10pt; }
  .info { margin-top: 2px; font-size: 9.5pt; color: #57534e; word-break: break-word; }
  .info span { margin-right: 10px; }
  a { color: #0e7c66; text-decoration: none; }
  .steps { margin-left: 18px; }
  .steps .act { border-top: 1px dashed #e7e5e4; padding: 5px 0; }
  .empty { color: #78716c; font-style: italic; padding: 6px 0; }
  footer { margin-top: 22px; color: #a8a29e; font-size: 9pt; text-align: center; }
`;

export function itineraryHtml(trip: PrintTrip, { t, f, category, locale }: Pick<I18n, "t" | "f" | "category" | "locale">, now = new Date()) {
  const activity = (a: PrintActivity, depth: number): string => {
    const cat = category(a.category, a.subcategory);
    const link = [a.bookingUrl, a.websiteUrl].find((u) => u && safeHref(u));
    const info = [
      a.address && `<span>📍 ${esc(a.address)}</span>`,
      a.phone && `<span>📞 ${esc(a.phone)}</span>`,
      a.estimatedCost != null && a.estimatedCost > 0 && `<span>💰 ${esc(t("print.perPerson", { amount: f.money(a.estimatedCost, trip.currency) }))}</span>`,
      link ? `<span>${link === a.bookingUrl ? "🎟" : "🌐"} <a href="${safeHref(link)}">${esc(host(link))}</a></span>` : "",
    ].filter(Boolean);
    return `
      <div class="act${a.isCompleted ? " done" : ""}">
        <div class="time">${a.startTime ? esc(f.time(a.startTime)) : depth === 0 ? esc(t("print.anytime")) : ""}${a.durationMinutes ? `<small>${esc(f.duration(a.durationMinutes))}</small>` : ""}</div>
        <div class="box">${a.isCompleted ? "✓" : ""}</div>
        <div class="body">
          <div class="title">${esc(a.title)}</div>
          ${depth === 0 ? `<div class="cat">${cat.emoji} ${esc(cat.text)}</div>` : ""}
          ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ""}
          ${info.length ? `<div class="info">${info.join("")}</div>` : ""}
          ${a.children.length ? `<div class="steps">${a.children.map((c) => activity(c, depth + 1)).join("")}</div>` : ""}
        </div>
      </div>`;
  };

  const days = trip.subTrips
    .map((day) => {
      const date = day.date ?? addDays(trip.startDate, day.dayNumber - 1);
      const when = [f.longDay(date), day.location].filter(Boolean).join(" · ");
      return `
      <section class="day">
        <h2>${esc(t("print.dayHeading", { day: day.dayNumber, title: dayTitle(day.title) }))}</h2>
        <div class="when">${esc(when)}</div>
        ${day.activities.length ? day.activities.map((a) => activity(a, 0)).join("") : `<div class="empty">${esc(t("trip.nothingPlanned"))}</div>`}
      </section>`;
    })
    .join("");

  const count = trip.subTrips.reduce((n, d) => n + d.activities.length, 0);
  const meta = [trip.destination, f.dateRange(trip.startDate, trip.endDate), t("time.days", { count: trip.subTrips.length }), t("trip.stops", { count })];

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(trip.title)}</title>
<style>${STYLE}</style>
</head>
<body>
  <header>
    <h1>${esc(trip.title)}</h1>
    <div class="meta">${meta.map(esc).join(" · ")}</div>
    ${trip.description ? `<p class="intro">${esc(trip.description)}</p>` : ""}
  </header>
  ${days}
  <footer>${esc(t("print.footer", { date: f.day(now.toISOString().slice(0, 10)) }))}</footer>
</body>
</html>`;
}

/** "Tokyo Adventure" -> "tokyo-adventure", for file names. */
export const fileSlug = (title: string) => title.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "trip";
