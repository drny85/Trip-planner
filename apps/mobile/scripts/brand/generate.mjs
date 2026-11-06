/**
 * Generates the app icon and splash artwork from one set of shapes.
 *
 *   node apps/mobile/scripts/brand/generate.mjs
 *
 * The mark: a map pin holding a rising sun, a dotted flight path that sweeps
 * behind it, and an AI sparkle where the path ends. Everything is drawn on a
 * 1024 x 1024 canvas (the iOS icon grid). It writes:
 *
 * - assets/expo.icon: the iOS 26 Icon Composer bundle (one SVG per layer, so
 *   iOS renders Liquid Glass and the dark, clear and tinted variants itself)
 * - assets/images/icon.png: the flat 1024 icon (older iOS, stores, Expo Go)
 * - assets/images/android-icon-*.png: the Android adaptive and themed icon
 * - assets/images/splash-icon*.png: the native splash mark, light and dark
 * - assets/images/splash/*.png: the layers the animated splash moves
 * - assets/images/favicon.png
 *
 * It renders with the Playwright Chromium that's already on the machine, so
 * there's nothing to install. Re-run it after changing a shape or a color.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brand, pin, sparkle, sun, routeDots } from "./shapes.mjs";

/** How big the mark sits on the iOS icon and on Android's adaptive canvas (inside its 66% safe zone). */
const ICON_SCALE = 0.84;
const ANDROID_SCALE = 0.6;

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "../../assets");
const images = join(assets, "images");

// ---------- SVG pieces ----------

const svg = (body, { size = 1024, viewBox = "0 0 1024 1024", defs = "" } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${
    defs ? `<defs>${defs}</defs>` : ""
  }${body}</svg>`;

const pinPath = (fill) => `<path fill="${fill}" fill-rule="evenodd" d="${pin.d}"/>`;
const sunCircle = (fill) => `<circle cx="${sun.cx}" cy="${sun.cy}" r="${sun.r}" fill="${fill}"/>`;
const sparklePath = (fill) => `<path fill="${fill}" d="${sparkle.d}"/>`;
const route = (fill, opacityScale = 1) =>
  routeDots
    .map((d) => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r.toFixed(1)}" fill="${fill}" opacity="${(d.opacity * opacityScale).toFixed(2)}"/>`)
    .join("");

const backgroundDefs = `
  <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="${brand.tealLight}"/>
    <stop offset="1" stop-color="${brand.tealDeep}"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.8" cy="0.18" r="0.6">
    <stop offset="0" stop-color="${brand.amberSoft}" stop-opacity="0.38"/>
    <stop offset="1" stop-color="${brand.amberSoft}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${brand.amberSoft}"/>
    <stop offset="1" stop-color="${brand.amber}"/>
  </linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#022c22" flood-opacity="0.35"/>
  </filter>`;

const background = `<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#glow)"/>`;
const fullMark = `${route("#ffffff", 0.9)}<g filter="url(#shadow)">${pinPath("#ffffff")}</g>${sunCircle("url(#sun)")}${sparklePath(brand.amberSoft)}`;

/** Scales the mark around the canvas centre (Android keeps it inside the 66% safe zone). */
const scaled = (body, s) => `<g transform="translate(512 512) scale(${s}) translate(-512 -${brand.markCenterY})">${body}</g>`;

// ---------- Icon Composer bundle (iOS 26+) ----------

function writeIconComposer() {
  const dir = join(assets, "expo.icon");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "Assets"), { recursive: true });
  // Plain fills only: Icon Composer adds the glass, shadows and the dark/tinted looks.
  const layers = {
    "sparkle.svg": svg(scaled(sparklePath(brand.amberSoft), ICON_SCALE)),
    "sun.svg": svg(scaled(sunCircle(brand.amber), ICON_SCALE)),
    "pin.svg": svg(scaled(pinPath("#ffffff"), ICON_SCALE)),
    "route.svg": svg(scaled(route("#ffffff"), ICON_SCALE)),
  };
  for (const [name, content] of Object.entries(layers)) writeFileSync(join(dir, "Assets", name), content);

  const layer = (file) => ({ "image-name": file, name: file.replace(".svg", "") });
  const icon = {
    fill: { "automatic-gradient": brand.iconComposerFill },
    groups: [
      // Front to back.
      { layers: [layer("sparkle.svg"), layer("sun.svg")], shadow: { kind: "layer-color", opacity: 0.5 }, translucency: { enabled: true, value: 0.3 } },
      { layers: [layer("pin.svg")], shadow: { kind: "neutral", opacity: 0.5 }, translucency: { enabled: true, value: 0.4 } },
      { layers: [layer("route.svg")], shadow: { kind: "neutral", opacity: 0.3 }, translucency: { enabled: true, value: 0.5 } },
    ],
    "supported-platforms": { circles: ["watchOS"], squares: "shared" },
  };
  writeFileSync(join(dir, "icon.json"), JSON.stringify(icon, null, 2) + "\n");
}

// ---------- PNG renders ----------

/** Each entry: output file, pixel size, and the SVG (drawn at 1024 or its own viewBox). */
function pngJobs() {
  // Splash art keeps the full canvas unscaled, so every layer stacks exactly on the native splash image.
  const splashMark = (pinFill) => `${pinPath(pinFill)}${sunCircle("url(#sun)")}`;
  const splash = 720; // 3x the 240pt the splash draws it at
  return [
    ["icon.png", 1024, svg(`${background}${scaled(fullMark, ICON_SCALE)}`, { defs: backgroundDefs })],
    ["favicon.png", 48, svg(`<rect width="1024" height="1024" rx="230" fill="url(#bg)"/>${scaled(`${pinPath("#ffffff")}${sunCircle(brand.amber)}`, 1.15)}`, { defs: backgroundDefs })],
    ["android-icon-background.png", 1024, svg(background, { defs: backgroundDefs })],
    ["android-icon-foreground.png", 1024, svg(scaled(fullMark, ANDROID_SCALE), { defs: backgroundDefs })],
    [
      "android-icon-monochrome.png",
      1024,
      svg(scaled(`${route("#ffffff")}${pinPath("#ffffff")}${sunCircle("#ffffff")}${sparklePath("#ffffff")}`, ANDROID_SCALE)),
    ],
    // The native splash shows the pin and sun; the animated splash starts from exactly this.
    ["splash-icon.png", splash, svg(splashMark("#ffffff"), { defs: backgroundDefs })],
    ["splash-icon-dark.png", splash, svg(splashMark(brand.tealBright), { defs: backgroundDefs })],
    ["splash/pin-light.png", splash, svg(pinPath("#ffffff"))],
    ["splash/pin-dark.png", splash, svg(pinPath(brand.tealBright))],
    ["splash/sun.png", splash, svg(sunCircle("url(#sun)"), { defs: backgroundDefs })],
    ["splash/sparkle.png", splash, svg(sparklePath(brand.amberSoft))],
  ];
}

/** The positions the animated splash needs, in the same 1024 canvas units. */
function writeGeometry() {
  const round = (n) => Math.round(n * 10) / 10;
  const geometry = {
    colors: { light: brand.splashLight, dark: brand.splashDark, dotLight: "#ffffff", dotDark: brand.tealBright },
    sun,
    sparkle: { cx: sparkle.big.cx, cy: sparkle.big.cy },
    pinTipY: 850,
    dots: routeDots.map((d) => ({ x: round(d.x), y: round(d.y), r: round(d.r), opacity: round(d.opacity) })),
  };
  const file = join(here, "../../src/components/animated-splash/geometry.ts");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `// Generated by scripts/brand/generate.mjs. Do not edit; change shapes.mjs and re-run it.\n` +
      `// Units are the 1024 x 1024 canvas the splash images are drawn on.\n` +
      `export const geometry = ${JSON.stringify(geometry, null, 2)} as const;\n`,
  );
}

async function renderPngs() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  mkdirSync(join(images, "splash"), { recursive: true });
  for (const [file, size, content] of pngJobs()) {
    await page.setViewportSize({ width: size, height: size });
    const sized = content.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
    await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
    await page.locator("svg").screenshot({ path: join(images, file), omitBackground: true });
    console.log("wrote", file);
  }
  await browser.close();
}

writeIconComposer();
writeGeometry();
await renderPngs();
