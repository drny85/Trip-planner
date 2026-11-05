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
      high: 19, low: 11, rainChance: 70, emoji: "🌧️", label: "Rain",
    });
    expect(parseForecast({})).toBeNull();
    expect(inForecastRange("2026-11-10", "2026-11-05")).toBe(true);
    expect(inForecastRange("2026-12-10", "2026-11-05")).toBe(false);
  });
});
