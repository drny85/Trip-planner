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

/** Long lines must be folded at 75 octets (RFC 5545); folding at 73 chars keeps it simple. */
const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");

/**
 * One calendar event. Timed ones carry local wall-clock parts (no time zone);
 * all-day ones carry just the date and the day after it.
 */
export type TripCalendarEvent = {
  /** Stable across syncs: the activity id, or "<day id>-day". */
  key: string;
  title: string;
  notes: string;
  location: string;
  allDay: boolean;
  /** "YYYY-MM-DD" and, for timed events, "HH:MM". End is exclusive. */
  start: { date: string; time?: string };
  end: { date: string; time?: string };
};

/** Every event the trip puts on a calendar: timed activities and steps, and one all-day event per day. */
export function calendarEvents(trip: CalTrip): TripCalendarEvent[] {
  const out: TripCalendarEvent[] = [];
  for (const day of trip.subTrips) {
    const date = day.date ?? addDays(trip.startDate, day.dayNumber - 1);
    const walk = (nodes: CalActivity[]) =>
      nodes.forEach((a) => {
        const m = a.startTime ? /^(\d{1,2}):(\d{2})$/.exec(a.startTime) : null;
        if (m) {
          const startMin = Number(m[1]) * 60 + Number(m[2]);
          const endMin = startMin + Math.max(15, a.durationMinutes ?? 60);
          const e = endMin % 1440;
          out.push({
            key: a._id,
            title: a.title,
            notes: a.description,
            location: a.address,
            allDay: false,
            start: { date, time: `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}` },
            end: { date: addDays(date, Math.floor(endMin / 1440)), time: `${pad(Math.floor(e / 60))}:${pad(e % 60)}` },
          });
        }
        walk(a.children);
      });
    walk(day.activities);
    out.push({ key: `${day._id}-day`, title: `${trip.title}: ${day.title}`, notes: "", location: "", allDay: true, start: { date }, end: { date: addDays(date, 1) } });
  }
  return out;
}

const stampOf = (p: { date: string; time?: string }) => (p.time ? `${compact(p.date)}T${p.time.replace(":", "")}00` : compact(p.date));

export function toICS(trip: CalTrip, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Trip Planner//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(trip.title)}`];
  for (const e of calendarEvents(trip)) {
    const when = e.allDay
      ? [`DTSTART;VALUE=DATE:${stampOf(e.start)}`, `DTEND;VALUE=DATE:${stampOf(e.end)}`]
      : [`DTSTART:${stampOf(e.start)}`, `DTEND:${stampOf(e.end)}`];
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.key}@tripplanner`,
      `DTSTAMP:${stamp}`,
      ...when,
      `SUMMARY:${esc(e.title)}`,
      ...(e.notes ? [`DESCRIPTION:${esc(e.notes)}`] : []),
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
