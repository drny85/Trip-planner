"use client";

import { forecastUrl, inForecastRange, localToday, parseForecast, type DayWeather } from "@trip/ui";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE_OUT } from "@/lib/motion";

type Located = { latitude?: number; longitude?: number; children?: Located[] };

const firstCoords = (nodes: Located[]): { latitude: number; longitude: number } | null => {
  for (const n of nodes) {
    if (n.latitude != null && n.longitude != null) return { latitude: n.latitude, longitude: n.longitude };
    const inner = firstCoords(n.children ?? []);
    if (inner) return inner;
  }
  return null;
};

/** The forecast for a day's first located stop, once the day is within 16 days. */
export function DayWeatherChip({ date, activities }: { date?: string; activities: Located[] }) {
  const coords = firstCoords(activities);
  const [weather, setWeather] = useState<DayWeather | null>(null);
  const key = coords && date ? `${coords.latitude},${coords.longitude},${date}` : null;

  useEffect(() => {
    if (!key || !date || !coords || !inForecastRange(date, localToday())) return;
    const ctrl = new AbortController();
    fetch(forecastUrl(coords.latitude, coords.longitude, date), { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setWeather(json ? parseForecast(json) : null))
      .catch(() => undefined);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures coords and date
  }, [key]);

  if (!weather) return null;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-semibold shadow-sm ring-1 ring-border"
      title={`${weather.label}, ${weather.rainChance}% chance of rain`}
    >
      <span aria-hidden>{weather.emoji}</span>
      {weather.high}° <span className="font-normal text-muted-foreground">{weather.low}°</span>
      {weather.rainChance >= 40 && <span className="text-xs font-normal text-sky-600">☂ {weather.rainChance}%</span>}
    </motion.span>
  );
}
