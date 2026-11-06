/**
 * Timing and geometry for the "planning your trip" screen, shared by web and mobile.
 * The AI call doesn't report progress, so the stages move on a schedule that matches
 * how long a plan usually takes, and the last stage waits until the trip is ready.
 */

/** The five stages, in order (keys under `generate.` in @trip/i18n), and when each starts, in ms. */
export const PLANNING_STAGES = [
  { key: "status1", at: 0 },
  { key: "status2", at: 4_000 },
  { key: "status3", at: 12_000 },
  { key: "status4", at: 22_000 },
  { key: "status5", at: 34_000 },
] as const;

/** After this long the screen says big trips take a little longer. */
export const PLANNING_SLOW_AFTER = 55_000;

/** How often the "while you wait" card shows the next travel fact, in ms. */
export const PLANNING_FACT_EVERY = 6_500;

/** Index of the stage that is running after `elapsed` ms. */
export function planningStage(elapsed: number) {
  let index = 0;
  PLANNING_STAGES.forEach((s, i) => {
    if (elapsed >= s.at) index = i;
  });
  return index;
}

/**
 * Progress from 0 to 1 for the bar. It moves quickly at first, then slows and never
 * quite arrives (at most 0.96), so it never claims the trip is done before it is.
 */
export function planningProgress(elapsed: number) {
  const t = Math.max(0, elapsed) / 1000;
  return Math.min(0.96, 1 - Math.exp(-t / 22));
}

/** Seconds as "0:07" / "1:12" for the elapsed timer. */
export function formatElapsed(elapsed: number) {
  const s = Math.max(0, Math.floor(elapsed / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The flight path across the planning scene: a quadratic curve in a 0..100 box
 * (x to the right, y down). `t` runs 0..1; the result has the point and the
 * heading in degrees, so the plane can point along the path.
 */
export const FLIGHT = { from: { x: 8, y: 64 }, control: { x: 50, y: -14 }, to: { x: 92, y: 52 } } as const;

export function flightPoint(t: number, aspect = 1) {
  const { from: a, control: c, to: b } = FLIGHT;
  const u = 1 - t;
  const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
  const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
  const dx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x);
  const dy = 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y);
  // `aspect` is the scene's height / width, so the heading matches what's drawn on screen.
  return { x, y, angle: (Math.atan2(dy * aspect, dx) * 180) / Math.PI };
}

/**
 * Where each stage's stop sits along the route (0..1). The plane flies at the progress
 * bar's pace, so it reaches each stop just as that stage starts.
 */
export const PLANNING_STOPS = PLANNING_STAGES.map((s) => planningProgress(s.at));

/** The SVG path for the flight in the same 0..100 box. */
export const FLIGHT_PATH = `M${FLIGHT.from.x} ${FLIGHT.from.y} Q${FLIGHT.control.x} ${FLIGHT.control.y} ${FLIGHT.to.x} ${FLIGHT.to.y}`;
