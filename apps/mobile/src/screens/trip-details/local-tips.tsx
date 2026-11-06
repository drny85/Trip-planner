import type { Activity } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { betterTime, cn, CROWD_META, crowdBar, TIP_EMOJI, type Crowd, type CrowdLevel } from "@trip/ui";
import { Text, View } from "react-native";

/** Four rising bars, filled up to the crowd level. */
export function CrowdBars({ level }: { level: CrowdLevel }) {
  const meta = CROWD_META[level];
  return (
    <View className="h-3 flex-row items-end gap-[2px]" accessible={false}>
      {[1, 2, 3, 4].map((bar) => (
        <View key={bar} className={cn("w-[3px] rounded-sm", bar <= meta.bars ? meta.className : "bg-border")} style={{ height: `${25 + bar * 18.75}%` }} />
      ))}
    </View>
  );
}

/** The day from 6 AM to midnight, with the busiest stretch, your plan and the best time on it. */
function CrowdTimeline({ crowd, startTime }: { crowd: Crowd; startTime?: string }) {
  const { t, f } = useI18n();
  const bar = crowdBar(crowd, startTime);
  if (!bar.peak && bar.best === null) return null;
  return (
    <View className="mt-2" accessible accessibilityLabel={crowd.peakFrom && crowd.peakTo ? t("local.peak", { from: f.time(crowd.peakFrom), to: f.time(crowd.peakTo) }) : undefined}>
      <View className="h-2 justify-center rounded-full bg-border">
        {bar.peak && <View className={cn("absolute inset-y-0 rounded-full opacity-80", CROWD_META[crowd.level].className)} style={{ left: `${bar.peak.left}%`, width: `${bar.peak.width}%` }} />}
        {bar.best !== null && <View className="absolute h-3.5 w-3.5 rounded-full border-2 border-card bg-emerald-500" style={{ left: `${bar.best}%`, marginLeft: -7 }} />}
        {bar.planned !== null && <View className="absolute h-4 w-1.5 rounded-full bg-foreground" style={{ left: `${bar.planned}%`, marginLeft: -3 }} />}
      </View>
      <View className="mt-1 flex-row justify-between">
        {["06:00", "12:00", "18:00", "00:00"].map((time) => (
          <Text key={time} className="text-[10px] text-muted-foreground">
            {f.time(time)}
          </Text>
        ))}
      </View>
      <View className="mt-1 flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <View className="flex-row items-center gap-1">
          <View className="h-3 w-1 rounded-full bg-foreground" />
          <Text className="text-[11px] text-muted-foreground">{t("local.legendPlanned")}</Text>
        </View>
        {bar.best !== null && (
          <View className="flex-row items-center gap-1">
            <View className="h-2 w-2 rounded-full bg-emerald-500" />
            <Text className="text-[11px] text-muted-foreground">{`${t("local.legendBest")} ${f.time(crowd.bestTime)}`}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/** Local tips and the crowd forecast on an activity card. Renders nothing when there are none. */
export function LocalTips({ activity }: { activity: Activity }) {
  const { t, f } = useI18n();
  const tips = activity.localTips ?? [];
  const crowd = activity.crowd;
  if (!tips.length && !crowd) return null;
  const better = crowd ? betterTime(crowd, activity.startTime) : null;
  return (
    <View className="mt-2 rounded-2xl bg-muted p-3">
      {crowd && (
        <View>
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <CrowdBars level={crowd.level} />
            <Text className="text-xs font-semibold text-foreground" accessibilityLabel={`${t("local.crowdTitle")}: ${t(`local.crowdLevels.${crowd.level}`)}`}>
              {activity.startTime
                ? t("local.crowdAt", { level: t(`local.crowdLevels.${crowd.level}`), time: f.time(activity.startTime) })
                : t(`local.crowdLevels.${crowd.level}`)}
            </Text>
            {better && <Text className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{`· ${t("local.goAt", { time: f.time(better) })}`}</Text>}
          </View>
          <CrowdTimeline crowd={crowd} startTime={activity.startTime} />
        </View>
      )}
      {tips.length > 0 && (
        <View className={cn("gap-1.5", crowd && "mt-3 border-t border-border pt-3")} accessibilityLabel={t("local.tipsHeading")}>
          {tips.map((tip, i) => (
            <View key={i} className="flex-row gap-2">
              <Text className="text-sm">{TIP_EMOJI[tip.kind]}</Text>
              <Text className="flex-1 text-sm leading-5 text-muted-foreground">
                <Text className="font-semibold text-foreground">{`${t(`local.tipKinds.${tip.kind}`)}: `}</Text>
                {tip.text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
