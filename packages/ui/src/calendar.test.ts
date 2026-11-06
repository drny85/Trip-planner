import { describe, expect, test } from "vitest";
import { toICS } from "./calendar";
import { parseForecast, inForecastRange } from "./weather";

describe("toICS", () => {
  test("writes timed activities and steps as events, plus an all-day event per day", () => {
    const ics = toICS(
      {
        _id: "t",
        title: "Tokyo, Japan",
        startDate: "2027-04-02",
        subTrips: [
          {
            _id: "d1",
            dayNumber: 1,
            title: "Asakusa",
            activities: [
              { _id: "a", title: "Senso-ji; temple", description: "Line 1\nLine 2", address: "2-3-1 Asakusa", startTime: "23:30", durationMinutes: 90, children: [
                { _id: "b", title: "Step", description: "", address: "", children: [] },
              ] },
            ],
          },
        ],
      },
      new Date("2026-11-05T00:00:00Z"),
    );
    expect(ics).toContain("DTSTART:20270402T233000\r\nDTEND:20270403T010000");
    expect(ics).toContain("SUMMARY:Senso-ji\\; temple");
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270402");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("weather", () => {
  test("parses a forecast and knows its range", () => {
    expect(parseForecast({ daily: { weather_code: [61], temperature_2m_max: [18.6], temperature_2m_min: [11.2], precipitation_probability_max: [70] } })).toEqual({
      high: 19, low: 11, rainChance: 70, emoji: "🌧️", label: "Rain", kind: "rain",
    });
    expect(parseForecast({})).toBeNull();
    expect(inForecastRange("2026-11-10", "2026-11-05")).toBe(true);
    expect(inForecastRange("2026-12-10", "2026-11-05")).toBe(false);
  });
});

describe("12-hour times", async () => {
  const { formatTime, parseTime } = await import("./format");
  test("formats stored times as 12-hour", () => {
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("09:30")).toBe("9:30 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("23:45")).toBe("11:45 PM");
    expect(formatTime("Morning")).toBe("Morning");
    expect(formatTime(undefined)).toBe("");
  });
  test("reads typed times into HH:MM", () => {
    expect(parseTime("7:30 pm")).toBe("19:30");
    expect(parseTime("7pm")).toBe("19:00");
    expect(parseTime("12 AM")).toBe("00:00");
    expect(parseTime("12:15p.m.")).toBe("12:15");
    expect(parseTime("19:30")).toBe("19:30");
    expect(parseTime("9")).toBe("09:00");
    expect(parseTime("13pm")).toBeNull();
    expect(parseTime("soon")).toBeNull();
  });
});

describe("calendarEvents", () => {
  test("keeps stable keys and wraps past midnight", async () => {
    const { calendarEvents } = await import("./calendar");
    const events = calendarEvents({
      _id: "t",
      title: "Trip",
      startDate: "2027-04-02",
      subTrips: [
        { _id: "d2", dayNumber: 2, title: "Day two", activities: [{ _id: "a", title: "Late show", description: "", address: "Club", startTime: "23:30", durationMinutes: 90, children: [] }] },
      ],
    });
    expect(events).toEqual([
      { key: "a", title: "Late show", notes: "", location: "Club", allDay: false, start: { date: "2027-04-03", time: "23:30" }, end: { date: "2027-04-04", time: "01:00" } },
      { key: "d2-day", title: "Trip: Day two", notes: "", location: "", allDay: true, start: { date: "2027-04-03" }, end: { date: "2027-04-04" } },
    ]);
  });
});

describe("trip time zones", () => {
  test("turns the trip's wall clock into the right moment, across DST", async () => {
    const { zonedTimeToUtc } = await import("./calendar");
    expect(new Date(zonedTimeToUtc("2027-04-02", "14:30", "Asia/Tokyo")!).toISOString()).toBe("2027-04-02T05:30:00.000Z");
    expect(new Date(zonedTimeToUtc("2027-01-10", "09:00", "America/New_York")!).toISOString()).toBe("2027-01-10T14:00:00.000Z");
    expect(new Date(zonedTimeToUtc("2027-07-10", "09:00", "America/New_York")!).toISOString()).toBe("2027-07-10T13:00:00.000Z");
    expect(new Date(zonedTimeToUtc("2027-03-15", "14:00", "America/Santo_Domingo")!).toISOString()).toBe("2027-03-15T18:00:00.000Z");
    expect(zonedTimeToUtc("2027-01-10", "09:00", "Not/AZone")).toBeNull();
  });

  test("the .ics writes UTC times when the trip has a zone", () => {
    const ics = toICS({
      _id: "t",
      title: "Tokyo",
      startDate: "2027-04-02",
      timeZone: "Asia/Tokyo",
      subTrips: [{ _id: "d1", dayNumber: 1, title: "Day", activities: [{ _id: "a", title: "Lunch", description: "", address: "", startTime: "12:00", durationMinutes: 60, children: [] }] }],
    });
    expect(ics).toContain("DTSTART:20270402T030000Z\r\nDTEND:20270402T040000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270402");
  });
});
