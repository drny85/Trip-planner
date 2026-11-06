"use client";

import type { Activity } from "@trip/backend/types";
import { useI18n } from "@trip/i18n/react";
import { betterTime, cn, CROWD_META, crowdBar, TIP_EMOJI, type Crowd, type CrowdLevel } from "@trip/ui";

/** Four rising bars, filled up to the crowd level. */
export function CrowdBars({ level, className }: { level: CrowdLevel; className?: string }) {
  const meta = CROWD_META[level];
  return (
    <span aria-hidden className={cn("inline-flex h-3 items-end gap-[2px]", className)}>
      {[1, 2, 3, 4].map((bar) => (
        <span key={bar} className={cn("w-[3px] rounded-sm", bar <= meta.bars ? meta.className : "bg-border")} style={{ height: `${25 + bar * 18.75}%` }} />
      ))}
    </span>
  );
}

/** The day from 6 AM to midnight, with the busiest stretch, your plan and the best time on it. */
function CrowdTimeline({ crowd, startTime }: { crowd: Crowd; startTime?: string }) {
  const { t, f } = useI18n();
  const bar = crowdBar(crowd, startTime);
  if (!bar.peak && bar.best === null) return null;
  return (
    <div className="mt-2">
      <div className="relative h-2 rounded-full bg-border/70">
        {bar.peak && <span className={cn("absolute inset-y-0 rounded-full opacity-80", CROWD_META[crowd.level].className)} style={{ left: `${bar.peak.left}%`, width: `${bar.peak.width}%` }} />}
        {bar.best !== null && (
          <span title={t("local.legendBest")} className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-emerald-500 shadow" style={{ left: `${bar.best}%` }} />
        )}
        {bar.planned !== null && (
          <span title={t("local.legendPlanned")} className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow" style={{ left: `${bar.planned}%` }} />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        {["06:00", "12:00", "18:00", "00:00"].map((time) => (
          <span key={time}>{f.time(time)}</span>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-1 rounded-full bg-foreground" /> {t("local.legendPlanned")}
        </span>
        {bar.best !== null && (
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t("local.legendBest")} {f.time(crowd.bestTime)}
          </span>
        )}
        {crowd.peakFrom && crowd.peakTo && <span>{t("local.peak", { from: f.time(crowd.peakFrom), to: f.time(crowd.peakTo) })}</span>}
      </div>
    </div>
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
    <div className="mt-2 rounded-2xl bg-muted/60 p-3 text-sm">
      {crowd && (
        <div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
            <span className="sr-only">{t("local.crowdTitle")}: </span>
            <CrowdBars level={crowd.level} />
            <span>
              {activity.startTime
                ? t("local.crowdAt", { level: t(`local.crowdLevels.${crowd.level}`), time: f.time(activity.startTime) })
                : t(`local.crowdLevels.${crowd.level}`)}
            </span>
            {better && <span className="text-emerald-600 dark:text-emerald-400">· {t("local.goAt", { time: f.time(better) })}</span>}
          </p>
          <CrowdTimeline crowd={crowd} startTime={activity.startTime} />
        </div>
      )}
      {tips.length > 0 && (
        <ul className={cn("flex flex-col gap-1.5", crowd && "mt-3 border-t border-border/70 pt-3")} aria-label={t("local.tipsHeading")}>
          {tips.map((tip, i) => (
            <li key={i} className="flex gap-2 leading-snug">
              <span aria-hidden>{TIP_EMOJI[tip.kind]}</span>
              <span>
                <span className="font-semibold">{t(`local.tipKinds.${tip.kind}`)}: </span>
                <span className="text-muted-foreground">{tip.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
