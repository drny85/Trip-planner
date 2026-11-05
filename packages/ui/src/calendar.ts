/**
 * iCalendar (.ics) export for a trip: one event per timed activity (steps
 * included), plus an all-day event for days with untimed ones. Times are written
 * as "floating" local times, so they show at the same clock time wherever the
 * traveler's calendar is.
 */
type CalActivity = {
  _id: string;
  title: string;
  description: string;
  address: string;
  startTime?: string;
  durationMinutes?: number;
  children: CalActivity[];
};
type CalTrip = {
  _id: string;
  title: string;
  startDate: string;
  subTrips: { _id: string; date?: string; dayNumber: number; title: string; activities: CalActivity[] }[];
};

const esc = (text: string) => text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
const compact = (iso: string) => iso.replace(/-/g, "");
const pad = (n: number) => String(n).padStart(2, "0");

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "2027-04-02" + "08:30" + 90 -> ["20270402T083000", "20270402T100000"]. */
function span(date: string, time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const start = (h ?? 0) * 60 + (m ?? 0);
  const end = start + Math.max(15, minutes);
  const endDate = addDays(date, Math.floor(end / 1440));
  const e = end % 1440;
  return [`${compact(date)}T${pad(h ?? 0)}${pad(m ?? 0)}00`, `${compact(endDate)}T${pad(Math.floor(e / 60))}${pad(e % 60)}00`] as const;
}

/** Long lines must be folded at 75 octets (RFC 5545); folding at 73 chars keeps it simple. */
const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");

export function toICS(trip: CalTrip, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Trip Planner//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(trip.title)}`];
  const event = (uid: string, title: string, when: string[], description = "", location = "") =>
    lines.push("BEGIN:VEVENT", `UID:${uid}@tripplanner`, `DTSTAMP:${stamp}`, ...when, `SUMMARY:${esc(title)}`, ...(description ? [`DESCRIPTION:${esc(description)}`] : []), ...(location ? [`LOCATION:${esc(location)}`] : []), "END:VEVENT");

  for (const day of trip.subTrips) {
    const date = day.date ?? addDays(trip.startDate, day.dayNumber - 1);
    const walk = (nodes: CalActivity[]) =>
      nodes.forEach((a) => {
        if (a.startTime && /^\d{1,2}:\d{2}$/.test(a.startTime)) {
          const [start, end] = span(date, a.startTime, a.durationMinutes ?? 60);
          event(a._id, a.title, [`DTSTART:${start}`, `DTEND:${end}`], a.description, a.address);
        }
        walk(a.children);
      });
    walk(day.activities);
    event(`${day._id}-day`, `${trip.title}: ${day.title}`, [`DTSTART;VALUE=DATE:${compact(date)}`, `DTEND;VALUE=DATE:${compact(addDays(date, 1))}`]);
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
