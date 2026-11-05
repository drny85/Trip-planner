import type { Locale } from "../locales";
import type { MessageKey as Key, Shape } from "../translate";
import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { ja } from "./ja";
import { pt } from "./pt";

export type Messages = typeof en;
export type MessageKey<T = Messages> = Key<T>;
export { en };

export const messages: Record<Locale, Shape<Messages>> = { en, es, fr, pt, de, ja };
