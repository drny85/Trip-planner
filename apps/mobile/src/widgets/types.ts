/**
 * What the iOS widget and the Live Activity show. They run in a separate,
 * isolated runtime with no translations or app state, so the app sends every
 * label already translated and every time already formatted.
 */
export type NextStopProps = {
  /** "stop": a stop to show. "done": the day is wrapped. "idle": no trip today. */
  state: "stop" | "done" | "idle";
  /** Small caps line: "Up next", "Happening now", "Today". */
  eyebrow: string;
  /** The stop's name, or the headline for "done" and "idle". */
  title: string;
  /** "2:30 PM", empty when the stop has no time. */
  time: string;
  /** "Leave by 2:10 PM", the address, or the body text for "done" and "idle". */
  detail: string;
  /** "Tokyo Adventure · Day 2". */
  trip: string;
  /** "3/6 done". */
  progress: string;
  done: number;
  total: number;
  /** "Then: Dinner at Ichiran · 7:00 PM", empty when it's the last stop. */
  then: string;
  /** Opens the trip's today mode in the app. */
  url: string;
  /** Opens directions to the stop (through the app). Empty when there's no stop. */
  directionsUrl: string;
  directionsLabel: string;
  /** SF Symbol for the stop's category. */
  symbol: string;
};

/** The Live Activity adds a live countdown to the next change. */
export type NextStopActivityProps = NextStopProps & {
  /** Epoch ms the countdown runs to (the stop's start, or its end while it's under way). 0 for none. */
  untilMs: number;
  /** When the countdown started, epoch ms (for the progress bar). */
  sinceMs: number;
  /** "Starts in" / "Ends in". */
  untilLabel: string;
};
