/** The mark's shapes and colors, on a 1024 x 1024 canvas. */

export const brand = {
  tealLight: "#16b892",
  tealDeep: "#075848",
  tealBright: "#2dd4aa", // the app's dark-mode primary
  amber: "#f59e0b", // the app's accent
  amberSoft: "#fde68a",
  splashLight: "#0e7c66", // the app's light-mode primary
  splashDark: "#0b0f14", // the app's dark-mode background
  // #0e9c7e in Icon Composer's extended sRGB.
  iconComposerFill: "extended-srgb:0.05490,0.61176,0.49412,1.00000",
  /** Vertical centre of the whole mark, so it can be centred when scaled. */
  markCenterY: 470,
};

const head = { cx: 512, cy: 430, r: 210 };
const tipY = 850;

/** Map pin with a round window for the sun (even-odd fill). */
export const pin = {
  d: [
    `M512 ${tipY}`,
    `C452 770 ${head.cx - head.r} 620 ${head.cx - head.r} ${head.cy}`,
    `A${head.r} ${head.r} 0 1 1 ${head.cx + head.r} ${head.cy}`,
    `C${head.cx + head.r} 620 572 770 512 ${tipY}Z`,
    `M512 ${head.cy - 118}A118 118 0 1 0 512 ${head.cy + 118}A118 118 0 1 0 512 ${head.cy - 118}Z`,
  ].join(""),
};

export const sun = { cx: head.cx, cy: head.cy, r: 96 };

/** Four-point sparkles: a big one where the flight path lands, a small one beside it. */
const star = (cx, cy, s, w) =>
  `M${cx} ${cy - s}Q${cx + w} ${cy - w} ${cx + s} ${cy}Q${cx + w} ${cy + w} ${cx} ${cy + s}Q${cx - w} ${cy + w} ${cx - s} ${cy}Q${cx - w} ${cy - w} ${cx} ${cy - s}Z`;
export const sparkle = {
  big: { cx: 820, cy: 196, s: 78 },
  small: { cx: 902, cy: 318, s: 34 },
};
sparkle.d = star(sparkle.big.cx, sparkle.big.cy, sparkle.big.s, 14) + star(sparkle.small.cx, sparkle.small.cy, sparkle.small.s, 7);

/** The dotted flight path: a cubic curve that sweeps up around the pin to the sparkle. */
const curve = [
  [150, 800],
  [100, 400],
  [420, 30],
  [728, 168],
];
const at = (t) => {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((i) => curve.reduce((sum, p, j) => sum + p[i] * k[j], 0));
};

/** Dots at equal distances along the curve, growing and brightening toward the end. */
function dotsAlong(count) {
  const samples = Array.from({ length: 401 }, (_, i) => at(i / 400));
  const lengths = [0];
  for (let i = 1; i < samples.length; i++) {
    const [x0, y0] = samples[i - 1];
    const [x1, y1] = samples[i];
    lengths.push(lengths[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = lengths.at(-1);
  return Array.from({ length: count }, (_, n) => {
    const target = (total * n) / (count - 1);
    const i = lengths.findIndex((l) => l >= target);
    const [x, y] = samples[Math.max(i, 0)];
    const f = n / (count - 1);
    return { x, y, r: 15 + 11 * f, opacity: 0.4 + 0.6 * f };
  });
}

export const routeDots = dotsAlong(11);
