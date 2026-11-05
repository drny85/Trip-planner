import type { Locale } from "./locales";

/** A message that changes with a count. `other` is required; the rest follow CLDR plural categories. */
export type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
type Leaf = string | Plural;
export type Dictionary = { [key: string]: Leaf | Dictionary };

/** An object is a plural message when it has `other` and only plural-category keys. */
type IsPlural<V> = V extends { other: string } ? (Exclude<keyof V, keyof Plural> extends never ? true : false) : false;

/** Widens a literal dictionary so other languages can be checked against its shape. */
export type Shape<T> = { [K in keyof T]: T[K] extends string ? string : IsPlural<T[K]> extends true ? Plural : Shape<T[K]> };

/** Every dotted path to a message, e.g. "trip.addActivity". */
export type MessageKey<T> = {
  [K in keyof T & string]: T[K] extends string ? K : IsPlural<T[K]> extends true ? K : `${K}.${MessageKey<T[K]>}`;
}[keyof T & string];

export type Vars = Record<string, string | number>;

const PLURAL_KEYS = new Set(["zero", "one", "two", "few", "many", "other"]);
const isPlural = (leaf: unknown): leaf is Plural =>
  typeof leaf === "object" && leaf !== null && typeof (leaf as Plural).other === "string" && Object.keys(leaf).every((k) => PLURAL_KEYS.has(k));

/** CLDR plural rules for the shipped languages, for runtimes without Intl.PluralRules. */
function pluralCategory(locale: Locale, n: number): keyof Plural {
  try {
    if (typeof Intl.PluralRules === "function") return new Intl.PluralRules(locale).select(n) as keyof Plural;
  } catch {
    // Fall through to the built-in rules.
  }
  if (locale === "ja") return "other";
  if (locale === "fr" || locale === "pt") return n === 0 || n === 1 ? "one" : "other";
  return n === 1 ? "one" : "other";
}

function lookup(dict: Dictionary, key: string): Leaf | undefined {
  let node: Leaf | Dictionary | undefined = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || isPlural(node)) return undefined;
    node = (node as Dictionary)[part];
  }
  return typeof node === "string" || isPlural(node) ? node : undefined;
}

/**
 * Builds `t(key, vars)`. `{name}` placeholders are filled from vars, numbers are
 * formatted for the locale, and a plural message picks its form from `vars.count`.
 * A key missing from this language falls back to the fallback dictionary, then to the key.
 */
export function createTranslator<T extends Dictionary>(locale: Locale, messages: Shape<T>, fallback: T, formatTag: string = locale) {
  const numbers = new Intl.NumberFormat(formatTag);
  return function t(key: MessageKey<T>, vars?: Vars): string {
    let leaf = lookup(messages as Dictionary, key) ?? lookup(fallback, key);
    if (leaf === undefined) return key;
    if (isPlural(leaf)) {
      const count = Number(vars?.count ?? 0);
      leaf = (count === 0 && leaf.zero) || leaf[pluralCategory(locale, count)] || leaf.other;
    }
    if (!vars) return leaf;
    return leaf.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = vars[name];
      if (value === undefined) return match;
      return typeof value === "number" ? numbers.format(value) : value;
    });
  };
}
