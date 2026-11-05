import { describe, expect, test } from "vitest";
import { estimateTravel, findTodayDay, fromMinutes, isOutdoor, leaveBy, parseHourly, projectDay, rainSoon, todayAlerts, todayStatus, toMinutes, type TodayStop } from "./today";

const stop = (id: string, startTime: string, extra: Partial<TodayStop> = {}): TodayStop => ({
  _id: id,
  title: id,
  isCompleted: false,
  startTime,
  durationMinutes: 60,
  address: "",
  ...extra,
});

describe("clock helpers", () => {
  test("round-trip and clamp", () => {
    expect(toMinutes("09:05")).toBe(545);
    expect(toMinutes("later")).toBeUndefined();
    expect(fromMinutes(545)).toBe("09:05");
    expect(fromMinutes(-10)).toBe("00:00");
    expect(fromMinutes(2000)).toBe("23:59");
  });
});

describe("findTodayDay", () => {
  const trip = {
    startDate: "2027-04-02",
    endDate: "2027-04-04",
    subTrips: [
      { _id: "a", dayNumber: 1, date: "2027-04-02", activities: [] },
      { _id: "b", dayNumber: 2, activities: [] },
      { _id: "c", dayNumber: 3, date: "2027-04-04", activities: [] },
    ],
  };
  test("by date, by day number, and outside the trip", () => {
    expect(findTodayDay(trip, "2027-04-02")?._id).toBe("a");
    expect(findTodayDay(trip, "2027-04-03")?._id).toBe("b");
    expect(findTodayDay(trip, "2027-04-05")).toBeUndefined();
  });
});

describe("todayStatus", () => {
  const day = [stop("breakfast", "08:00", { isCompleted: true }), stop("temple", "09:30"), stop("lunch", "12:00")];
  test("on time before the next stop", () => {
    const s = todayStatus(day, toMinutes("09:00")!);
    expect(s.next?._id).toBe("temple");
    expect(s.current).toBeUndefined();
    expect(s.behindBy).toBe(0);
    expect(s.lastDone?._id).toBe("breakfast");
    expect([s.done, s.total]).toEqual([1, 3]);
  });
  test("a stop under way isn't late until it should be over", () => {
    const s = todayStatus(day, toMinutes("10:00")!);
    expect(s.current?._id).toBe("temple");
    expect(s.behindBy).toBe(0);
  });
  test("still open after its end means behind", () => {
    const s = todayStatus(day, toMinutes("11:00")!);
    expect(s.current).toBeUndefined();
    expect(s.behindBy).toBe(90);
  });
});

describe("travel", () => {
  test("short hops walk, longer ones take transit", () => {
    const a = { latitude: 35.7148, longitude: 139.7967 };
    const near = estimateTravel(a, { latitude: 35.7101, longitude: 139.8107 });
    expect(near.mode).toBe("walk");
    expect(near.minutes).toBeGreaterThan(10);
    const far = estimateTravel(a, { latitude: 35.6595, longitude: 139.7005 });
    expect(far.mode).toBe("transit");
    expect(far.minutes).toBeGreaterThan(30);
  });
  test("leave-by subtracts travel from the start time", () => {
    expect(leaveBy(stop("x", "10:00"), 25)).toBe("09:35");
  });
});

const forecast = (chances: number[], codes = chances.map(() => 61)) =>
  parseHourly({
    current: { temperature_2m: 18.4, weather_code: 3 },
    hourly: {
      time: chances.map((_, i) => `2027-04-02T${String(9 + i).padStart(2, "0")}:00`),
      temperature_2m: chances.map(() => 17),
      weather_code: codes,
      precipitation_probability: chances,
    },
  });

describe("weather and alerts", () => {
  test("parses Open-Meteo hourly data", () => {
    const w = forecast([10, 70]);
    expect(w?.now).toMatchObject({ temp: 18, label: "Cloudy" });
    expect(w?.hours[1]).toMatchObject({ time: "10:00", rainChance: 70, label: "Rain" });
    expect(parseHourly({})).toBeNull();
  });
  test("rain soon only inside the window", () => {
    expect(rainSoon(forecast([0, 0, 80]))?.time).toBe("11:00");
    expect(rainSoon(forecast([0, 0, 0, 0, 0, 90]))).toBeUndefined();
  });
  test("outdoor detection", () => {
    expect(isOutdoor({ category: "nature" })).toBe(true);
    expect(isOutdoor({ category: "sightseeing", subcategory: "museum" })).toBe(false);
    expect(isOutdoor({ category: "food" })).toBe(false);
  });
  test("rain alert needs an outdoor stop ahead; late alert after 20 minutes", () => {
    const stops = [stop("garden", "10:00", { category: "nature" }), stop("ramen", "12:00", { category: "food" })];
    const rainy = forecast([20, 80]);
    const early = todayAlerts(todayStatus(stops, toMinutes("09:30")!), rainy, toMinutes("09:30")!);
    expect(early.map((a) => a.kind)).toEqual(["rain"]);
    expect(early[0]!.reason).toContain("garden");

    const indoorOnly = todayAlerts(todayStatus([stops[1]!], toMinutes("09:30")!), rainy, toMinutes("09:30")!);
    expect(indoorOnly).toEqual([]);

    const late = todayAlerts(todayStatus(stops, toMinutes("11:30")!), null, toMinutes("11:30")!);
    expect(late).toMatchObject([{ kind: "late", minutes: 90 }]);
  });
});

describe("projectDay", () => {
  const stops = [stop("a", "09:00"), stop("b", "11:00", { durationMinutes: 90 }), stop("c", "14:00")];
  const view = (steps: ReturnType<typeof projectDay>) => steps.map((s) => [fromMinutes(s.at), s.status.current?._id ?? "-", s.status.next?._id ?? "-", s.status.done]);

  test("steps through the day as planned", () => {
    expect(view(projectDay(stops, 8 * 60))).toEqual([
      ["08:00", "-", "a", 0],
      ["09:00", "a", "a", 0],
      ["10:00", "-", "b", 1],
      ["11:00", "b", "b", 1],
      ["12:30", "-", "c", 2],
      ["14:00", "c", "c", 2],
      ["15:00", "-", "-", 3],
    ]);
  });

  test("starts mid-stop and skips what's done", () => {
    const done = stops.map((s) => (s._id === "a" ? { ...s, isCompleted: true } : s));
    expect(view(projectDay(done, 11 * 60 + 30))[0]).toEqual(["11:30", "b", "b", 1]);
    expect(view(projectDay(done, 11 * 60 + 30)).at(-1)).toEqual(["15:00", "-", "-", 3]);
  });

  test("waits on an overdue or untimed stop", () => {
    expect(projectDay(stops, 10 * 60 + 30)).toHaveLength(1);
    expect(projectDay([stop("x", "")], 8 * 60)).toHaveLength(1);
  });
});
