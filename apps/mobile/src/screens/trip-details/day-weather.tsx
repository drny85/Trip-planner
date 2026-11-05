import { useI18n } from "@trip/i18n/react";
import { forecastUrl, inForecastRange, localToday, parseForecast, type DayWeather } from "@trip/ui";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
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

/** Forecast for the day's first located stop; null until the day is within 16 days. */
export function useDayWeather(date: string | undefined, activities: Located[]) {
  const coords = firstCoords(activities);
  const [weather, setWeather] = useState<DayWeather | null>(null);
  const lat = coords?.latitude;
  const lng = coords?.longitude;

  useEffect(() => {
    if (lat == null || lng == null || !date || !inForecastRange(date, localToday())) return;
    const ctrl = new AbortController();
    fetch(forecastUrl(lat, lng, date), { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setWeather(json ? parseForecast(json) : null))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [lat, lng, date]);
  return weather;
}

export function DayWeatherChip({ weather }: { weather: DayWeather | null }) {
  const { t } = useI18n();
  if (!weather) return null;
  return (
    <Animated.View entering={FadeIn.duration(220).easing(EASE_OUT)} className="flex-row items-center gap-1 rounded-full bg-muted px-3 py-1.5" accessibilityLabel={t("mobileDay.weatherLabel", { label: t(`weather.${weather.kind}`), high: weather.high, low: weather.low })}>
      <Text className="text-xs">{weather.emoji}</Text>
      <Text className="text-xs font-semibold text-foreground">
        {weather.high}°<Text className="font-normal text-muted-foreground"> {weather.low}°</Text>
      </Text>
    </Animated.View>
  );
}
