import { calendarEvents, zonedTimeToUtc, type TripCalendarEvent } from "@trip/ui";
import * as Calendar from "expo-calendar";
import { File, Paths } from "expo-file-system";
import { Linking, Platform } from "react-native";

/**
 * Puts a trip straight into the phone's own calendar and keeps it in step:
 * syncing again updates the events it added, adds new ones and deletes the ones
 * whose activity is gone. What was added is remembered per trip on the device.
 */
type Synced = { calendarId: string; calendarTitle: string; events: Record<string, string> };
type Trip = Parameters<typeof calendarEvents>[0];

const store = new File(Paths.document, "calendar-sync.json");

function readAll(): Record<string, Synced> {
  try {
    return store.exists ? (JSON.parse(store.textSync()) as Record<string, Synced>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Synced>) {
  if (!store.exists) store.create();
  store.write(JSON.stringify(all));
}

/** The calendar this trip was added to, if it was. */
export function syncedCalendar(tripId: string): Synced | undefined {
  return readAll()[tripId];
}

export class CalendarAccessError extends Error {}
export class NoCalendarError extends Error {}

/** The native calendar apps can't sync the browser build. */
export const canUseDeviceCalendar = Platform.OS === "ios" || Platform.OS === "android";

async function ensureAccess() {
  const current = await Calendar.getCalendarPermissions();
  if (current.granted) return;
  const asked = current.canAskAgain ? await Calendar.requestCalendarPermissions() : current;
  if (!asked.granted) throw new CalendarAccessError();
}

async function pickCalendar(previous?: string): Promise<Calendar.ExpoCalendar> {
  if (previous) {
    try {
      const cal = await Calendar.ExpoCalendar.get(previous);
      if (cal.allowsModifications) return cal;
    } catch {
      // It was deleted; pick another below.
    }
  }
  if (Platform.OS === "ios") {
    try {
      const cal = Calendar.getDefaultCalendarSync();
      if (cal?.allowsModifications) return cal;
    } catch {
      // No default calendar set: use any writable one below.
    }
  }
  // Android has no single default: the primary writable calendar of an account, else any writable one.
  // On iOS, asking for event calendars only avoids needing the Reminders permission.
  const all = await Calendar.getCalendars(Platform.OS === "ios" ? Calendar.EntityTypes.EVENT : undefined);
  const writable = all.filter((c) => c.allowsModifications);
  const cal = writable.find((c) => c.isPrimary) ?? writable[0];
  if (cal) return cal;
  // An Android phone with no accounts has no calendar at all: make a local one.
  if (Platform.OS === "android") {
    return Calendar.createCalendar({
      title: "Trip Planner",
      name: "trip-planner",
      color: "#0e7c66",
      entityType: Calendar.EntityTypes.EVENT,
      source: { isLocalAccount: true, name: "Trip Planner", type: Calendar.SourceType.LOCAL },
      ownerAccount: "Trip Planner",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }
  throw new NoCalendarError();
}

const local = (p: { date: string; time?: string }) => {
  const [y, m, d] = p.date.split("-").map(Number);
  const [h, min] = (p.time ?? "00:00").split(":").map(Number);
  return new Date(y!, m! - 1, d!, h, min);
};

/** All-day events: iOS wants local midnight with an inclusive end; Android wants UTC midnights. */
function details(e: TripCalendarEvent) {
  const base = { title: e.title, notes: e.notes, location: e.location, allDay: e.allDay };
  if (!e.allDay) {
    // In the trip's zone when known, so a 2 PM check-in shows at 2 PM local time there, wherever the phone is set.
    const zoned = (p: { date: string; time?: string }) => (e.timeZone ? zonedTimeToUtc(p.date, p.time ?? "00:00", e.timeZone) : null);
    const [start, end] = [zoned(e.start), zoned(e.end)];
    if (start != null && end != null) return { ...base, startDate: new Date(start), endDate: new Date(end), timeZone: e.timeZone };
    return { ...base, startDate: local(e.start), endDate: local(e.end) };
  }
  if (Platform.OS === "android") {
    const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
    return { ...base, startDate: utc(e.start.date), endDate: utc(e.end.date), timeZone: "UTC" };
  }
  return { ...base, startDate: local(e.start), endDate: local(e.start) };
}

/** One sync at a time, so quick edits can't add an event twice. */
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

/** Adds or updates the trip's events. Returns the calendar's name, how many events it has, and whether it was a first add. */
export const syncTripToCalendar = (trip: Trip) => serial(() => sync(trip));

async function sync(trip: Trip) {
  await ensureAccess();
  const all = readAll();
  const before = all[trip._id];
  const calendar = await pickCalendar(before?.calendarId);
  // Moved to another calendar (the old one is gone): start fresh there.
  const known = before?.calendarId === calendar.id ? before.events : {};
  const events: Record<string, string> = {};

  for (const e of calendarEvents(trip)) {
    const id = known[e.key];
    if (id) {
      try {
        const existing = await Calendar.ExpoCalendarEvent.get(id);
        await existing.update(details(e));
        events[e.key] = id;
        continue;
      } catch {
        // Deleted in the Calendar app; add it again.
      }
    }
    events[e.key] = (await calendar.createEvent(details(e))).id;
  }
  // Activities removed from the trip since the last sync.
  for (const [key, id] of Object.entries(known)) {
    if (!(key in events)) await deleteEvent(id);
  }

  all[trip._id] = { calendarId: calendar.id, calendarTitle: calendar.title, events };
  writeAll(all);
  return { calendar: calendar.title, count: Object.keys(events).length, firstTime: !before };
}

async function deleteEvent(id: string) {
  try {
    await (await Calendar.ExpoCalendarEvent.get(id)).delete();
  } catch {
    // Already gone.
  }
}

/** Deletes every event this trip added and forgets the sync. */
export const removeTripFromCalendar = (tripId: string) => serial(() => remove(tripId));

async function remove(tripId: string) {
  const all = readAll();
  const synced = all[tripId];
  if (!synced) return;
  await ensureAccess();
  for (const id of Object.values(synced.events)) await deleteEvent(id);
  delete all[tripId];
  writeAll(all);
}

export const openSettings = () => void Linking.openSettings();

/** Quietly re-syncs a trip that's already in the calendar, when access is still granted. */
export async function refreshSyncedCalendar(trip: Trip) {
  if (!canUseDeviceCalendar || !syncedCalendar(trip._id)) return;
  if (!(await Calendar.getCalendarPermissions()).granted) return;
  await syncTripToCalendar(trip);
}
