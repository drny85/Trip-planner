import { tokyoAdventure } from "@trip/backend/sample";
import { useI18n } from "@trip/i18n/react";
import { dayTitle, tripLength } from "@trip/ui";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../button";
import { LinearGradient } from "../gradient";
import { Image } from "../image";

const trip = tokyoAdventure;
type Day = (typeof trip.subTrips)[number];
type Stop = Day["activities"][number];

const allStops = trip.subTrips.flatMap((d) => d.activities);
const highlights = allStops
  .filter((a) =>
    ["sightseeing", "nature", "nightlife"].includes(a.category ?? ""),
  )
  .slice(0, 6);
const totalCost = allStops.reduce((sum, a) => sum + (a.estimatedCost ?? 0), 0);
const cityOf = (a: Stop) =>
  trip.subTrips.find((d) => d.activities.includes(a))?.location ??
  trip.destination;

/**
 * A read-only look at a finished trip (the Tokyo sample), so people can see what
 * they'll get before making an account: a parallax cover, the highlights, then
 * each day as a timeline of real places. Built from static data: no backend.
 */
export function SampleTrip({
  visible,
  onClose,
  onSignIn,
}: {
  visible: boolean;
  onClose: () => void;
  onSignIn: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Mounted only while open, so every visit starts at the top of the cover. */}
      {visible && <SampleTripSheet onClose={onClose} onSignIn={onSignIn} />}
    </Modal>
  );
}

function SampleTripSheet({
  onClose,
  onSignIn,
}: {
  onClose: () => void;
  onSignIn: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Leaves the start of the next section in view, so it's clear the sheet scrolls.
  const HERO = Math.min(520, Math.round(height * 0.62));
  const { t, f } = useI18n();
  const reduced = useReducedMotion();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  // The cover moves at half speed and stretches when pulled down; its text fades as it leaves.
  const coverStyle = useAnimatedStyle(() => {
    if (reduced) return {};
    const y = scrollY.get();
    return {
      transform: [
        {
          translateY: interpolate(
            y,
            [-HERO, 0, HERO],
            [-HERO / 2, 0, HERO * 0.45],
          ),
        },
        { scale: interpolate(y, [-HERO, 0], [2, 1], Extrapolation.CLAMP) },
      ],
    };
  });
  const coverTextStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.get(),
      [0, HERO * 0.45],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));
  // A compact title bar fades in once the cover has scrolled away.
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.get(),
      [HERO - 160, HERO - 90],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const days = tripLength(trip.startDate!, trip.endDate!);

  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 150 }}
      >
        {/* Cover */}
        <View className="overflow-hidden" style={{ height: HERO }}>
          <Animated.View className="absolute inset-0" style={coverStyle}>
            <Image
              source={trip.imageUrl}
              className="absolute inset-0"
              contentFit="cover"
              transition={300}
            />
          </Animated.View>
          <LinearGradient
            colors={[
              "rgba(0,0,0,0.45)",
              "rgba(0,0,0,0)",
              "rgba(0,0,0,0.35)",
              "rgba(0,0,0,0.9)",
            ]}
            locations={[0, 0.25, 0.55, 1]}
            className="absolute inset-0"
          />
          <Animated.View
            className="absolute inset-x-0 bottom-0 gap-3 px-6 pb-10"
            style={coverTextStyle}
          >
            <View className="flex-row flex-wrap gap-2">
              <Pill>{t("welcome.sampleBadge")}</Pill>
              <Pill>✨ {t("welcome.samplePlanned")}</Pill>
            </View>
            <Text className="text-[44px] font-extrabold leading-[46px] tracking-tight text-white">
              {trip.title}
            </Text>
            <Text className="text-base font-medium text-white/85">
              {trip.destination} · {f.dateRange(trip.startDate!, trip.endDate!)}
            </Text>
            <View className="mt-1 flex-row flex-wrap gap-2">
              <Stat>{t("time.days", { count: days })}</Stat>
              <Stat>{t("trip.stops", { count: allStops.length })}</Stat>
              <Stat>
                {t("welcome.sampleCost", {
                  amount: f.money(totalCost, trip.currency),
                })}
              </Stat>
            </View>
          </Animated.View>
        </View>

        {/* Pitch, on a sheet that overlaps the cover */}
        <View className="-mt-6 rounded-t-[28px] bg-background px-6 pt-7">
          <Text className="text-lg leading-7 text-foreground">
            {trip.description}
          </Text>
        </View>

        {/* Highlights carousel */}
        <SectionTitle>{t("welcome.sampleHighlights")}</SectionTitle>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={232}
          contentContainerClassName="gap-3 px-6"
        >
          {highlights.map((a) => (
            <View
              key={a.title}
              className="h-72 w-[220px] overflow-hidden rounded-3xl bg-muted"
            >
              <Image
                source={a.photoUrl}
                className="absolute inset-0"
                contentFit="cover"
                transition={250}
              />
              <LinearGradient
                colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
                locations={[0.45, 1]}
                className="absolute inset-0"
              />
              <View className="absolute inset-x-0 bottom-0 gap-1 p-4">
                <Text
                  className="text-lg font-bold leading-6 text-white"
                  numberOfLines={2}
                >
                  {a.title}
                </Text>
                <Text className="text-xs font-semibold text-white/75">
                  {cityOf(a)}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Day by day */}
        <SectionTitle>{t("welcome.sampleDayByDay")}</SectionTitle>
        <View className="gap-10 px-5">
          {trip.subTrips.map((day) => (
            <DaySection key={day.dayNumber} day={day} />
          ))}
        </View>
      </Animated.ScrollView>

      {/* Title bar after the cover */}
      <Animated.View
        pointerEvents="none"
        className="absolute inset-x-0 top-0 h-[60px] justify-center border-b border-border bg-background px-16"
        style={barStyle}
      >
        <Text
          className="text-center text-base font-bold text-foreground"
          numberOfLines={1}
        >
          {trip.title}
        </Text>
      </Animated.View>

      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        hitSlop={10}
        className="absolute right-4 top-3 h-9 w-9 items-center justify-center rounded-full bg-black/45 active:opacity-70"
      >
        <Text className="text-base font-bold text-white">✕</Text>
      </Pressable>

      {/* Call to action, on a solid footer so nothing shows through behind the text */}
      <View
        className="absolute inset-x-0 bottom-0 gap-2 border-t border-border bg-background px-5 pt-4"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button icon="sparkles" onPress={onSignIn}>
          {t("welcome.planYourOwn")}
        </Button>
        <Text className="text-center text-xs text-muted-foreground">
          {t("welcome.freeNote")}
        </Text>
      </View>
    </View>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <View className="rounded-full border border-white/30 bg-black/35 px-3 py-1">
      <Text className="text-[11px] font-bold uppercase tracking-widest text-white">
        {children}
      </Text>
    </View>
  );
}

function Stat({ children }: { children: string }) {
  return (
    <View className="rounded-2xl bg-white/15 px-3 py-2">
      <Text className="text-sm font-bold text-white">{children}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="px-6 pb-4 pt-9 text-2xl font-extrabold tracking-tight text-foreground">
      {children}
    </Text>
  );
}

/**
 * A leg can span several days ("Kyoto Leg · Days 4–5"). Its stops are in time
 * order per day, so a start time earlier than the one before begins the next day.
 */
function daysWithin(day: Day) {
  const parts: { dayNumber: number; date?: string; stops: Stop[] }[] = [];
  let prev = "";
  for (const stop of day.activities) {
    const time = stop.startTime ?? prev;
    if (!parts.length || (time && prev && time < prev)) {
      const n = parts.length;
      parts.push({
        dayNumber: day.dayNumber + n,
        date: day.date ? addDays(day.date, n) : undefined,
        stops: [],
      });
    }
    parts[parts.length - 1]!.stops.push(stop);
    prev = time;
  }
  return parts;
}

const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** One day: a numbered header, then its stops on a timeline (the first one large). */
function DaySection({ day }: { day: Day }) {
  const { t, f } = useI18n();
  return (
    <Animated.View entering={FadeInDown.duration(400)} className="gap-4">
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary">
          <Text className="text-xl font-extrabold text-primary-foreground">
            {day.dayNumber}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest text-primary">
            {t("time.dayN", { day: day.dayNumber })}
            {day.date ? ` · ${f.weekday(day.date)}` : ""}
            {day.location ? ` · ${day.location}` : ""}
          </Text>
          <Text
            className="text-xl font-extrabold tracking-tight text-foreground"
            numberOfLines={2}
          >
            {dayTitle(day.title)}
          </Text>
        </View>
      </View>

      {daysWithin(day).map((part, p) => (
        <View key={part.dayNumber} className="gap-4">
          {p > 0 && (
            <Text className="pl-8 text-xs font-bold uppercase tracking-widest text-primary">
              {t("time.dayN", { day: part.dayNumber })}
              {part.date ? ` · ${f.weekday(part.date)}` : ""}
            </Text>
          )}
          <View>
            {part.stops.map((a, i) => (
              <TimelineStop
                key={a.title}
                stop={a}
                featured={i === 0}
                last={i === part.stops.length - 1}
              />
            ))}
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

function TimelineStop({
  stop,
  featured,
  last,
}: {
  stop: Stop;
  featured: boolean;
  last: boolean;
}) {
  const { f, category } = useI18n();
  const { width } = useWindowDimensions();
  const badge = category(stop.category, stop.subcategory);
  const meta = [
    stop.startTime ? f.time(stop.startTime) : null,
    stop.durationMinutes ? f.duration(stop.durationMinutes) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View className="flex-row gap-3">
      {/* Rail: a dot in the category's color, joined to the next stop */}
      <View className="w-5 items-center">
        <View
          className="mt-4 h-3.5 w-3.5 rounded-full"
          style={{ backgroundColor: badge.color }}
        />
        {!last && <View className="mt-1 w-0.5 flex-1 rounded-full bg-border" />}
      </View>

      <View className="flex-1 pb-4">
        {featured ? (
          <View className="overflow-hidden rounded-3xl bg-card">
            <Image
              source={stop.photoUrl}
              style={{ height: Math.round((width - 72) * 0.62) }}
              contentFit="cover"
              transition={250}
            />
            <View className="gap-1.5 p-4">
              <Badge
                emoji={badge.emoji}
                text={badge.text}
                color={badge.color}
                meta={meta}
              />
              <Text className="text-lg font-bold leading-6 text-foreground">
                {stop.title}
              </Text>
              <Text
                className="text-sm leading-5 text-muted-foreground"
                numberOfLines={3}
              >
                {stop.description}
              </Text>
            </View>
          </View>
        ) : (
          <View className="flex-row gap-3 overflow-hidden rounded-3xl bg-card p-2.5">
            <Image
              source={stop.photoUrl}
              className="h-[88px] w-[88px] rounded-2xl"
              contentFit="cover"
              transition={250}
            />
            <View className="flex-1 justify-center gap-1 py-1 pr-1">
              <Badge
                emoji={badge.emoji}
                text={badge.text}
                color={badge.color}
                meta={meta}
              />
              <Text
                className="text-base font-bold leading-5 text-foreground"
                numberOfLines={2}
              >
                {stop.title}
              </Text>
              <Text
                className="text-[13px] leading-[18px] text-muted-foreground"
                numberOfLines={2}
              >
                {stop.description}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function Badge({
  emoji,
  text,
  color,
  meta,
}: {
  emoji: string;
  text: string;
  color: string;
  meta: string;
}) {
  return (
    <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
      <View
        className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
        style={{ backgroundColor: `${color}22` }}
      >
        <Text className="text-[11px]">{emoji}</Text>
        <Text className="text-[11px] font-bold" style={{ color }}>
          {text}
        </Text>
      </View>
      {meta ? (
        <Text className="text-xs font-semibold text-muted-foreground">
          {meta}
        </Text>
      ) : null}
    </View>
  );
}
