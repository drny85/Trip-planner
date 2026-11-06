import { describe, expect, it } from "vitest";
import { fileSlug, itineraryHtml } from "./itinerary";
import { buildI18n } from "./react";

const step = { title: "Buy omamori", description: "", address: "", isCompleted: true, children: [] };
const trip = {
  title: "Tokyo <Adventure>",
  destination: "Tokyo",
  startDate: "2027-04-02",
  endDate: "2027-04-03",
  currency: "JPY",
  subTrips: [
    {
      dayNumber: 1,
      title: "Day 1 · Asakusa",
      activities: [
        {
          title: "Senso-ji",
          description: "Oldest temple",
          address: "2-3-1 Asakusa",
          phone: "+81 3-3842-0181",
          bookingUrl: "javascript:alert(1)",
          websiteUrl: "https://www.senso-ji.jp/about",
          category: "sightseeing",
          startTime: "14:30",
          durationMinutes: 90,
          estimatedCost: 3000,
          isCompleted: false,
          children: [step],
        },
      ],
    },
    { dayNumber: 2, title: "Day 2 · Shibuya", date: "2027-04-03", activities: [] },
  ],
};

describe("itineraryHtml", () => {
  it("renders days, times and steps in the person's language", () => {
    const html = itineraryHtml(trip, buildI18n("en"), new Date("2027-01-01T12:00:00Z"));
    expect(html).toContain("Tokyo &lt;Adventure&gt;");
    expect(html).toContain("Day 1 · Asakusa");
    expect(html).toContain("Friday, April 2");
    expect(html).toContain("2:30 PM");
    expect(html).toContain("1 h 30 min");
    expect(html).toContain("Buy omamori");
    expect(html).toContain("Nothing planned for this day yet.");
    expect(html).toContain("¥3,000 per person");
    const de = itineraryHtml(trip, buildI18n("de"));
    expect(de).toContain("Tag 2 · Shibuya");
    expect(de).toContain("14:30");
  });

  it("only links http(s) URLs", () => {
    const html = itineraryHtml(trip, buildI18n("en"));
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://www.senso-ji.jp/about"');
    expect(html).toContain(">senso-ji.jp<");
  });

  it("makes file names from titles", () => {
    expect(fileSlug("Tokyo Adventure!")).toBe("tokyo-adventure");
    expect(fileSlug("東京の旅")).toBe("東京の旅");
    expect(fileSlug("!!!")).toBe("trip");
    expect(fileSlug("Río San Juan Sun, Surf & Whales")).toBe("río-san-juan-sun-surf-whales");
  });
});
