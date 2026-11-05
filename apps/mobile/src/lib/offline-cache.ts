import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

/**
 * A tiny on-device cache of query results, so trips stay readable with no
 * signal. Native stores one JSON file per query in the app's documents folder;
 * web uses localStorage. Reads are synchronous so a cached screen renders on the
 * first frame.
 */
const PREFIX = "offline:";
const dir = Platform.OS === "web" ? null : new Directory(Paths.document, "offline");
const fileFor = (key: string) => new File(dir!, `${encodeURIComponent(key).slice(0, 180)}.json`);

export function readCache<T>(key: string): T | undefined {
  try {
    if (!dir) {
      const raw = globalThis.localStorage?.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    }
    const file = fileFor(key);
    return file.exists ? (JSON.parse(file.textSync()) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache(key: string, value: unknown) {
  try {
    const json = JSON.stringify(value);
    if (!dir) return globalThis.localStorage?.setItem(PREFIX + key, json);
    if (!dir.exists) dir.create({ intermediates: true });
    const file = fileFor(key);
    if (!file.exists) file.create();
    file.write(json);
  } catch {
    // A full disk or private mode just means no offline copy.
  }
}

/** Forgets everything cached, e.g. on sign-out, so the next person can't read it. */
export function clearCache() {
  try {
    if (!dir) {
      for (const k of Object.keys(globalThis.localStorage ?? {})) if (k.startsWith(PREFIX)) globalThis.localStorage.removeItem(k);
    } else if (dir.exists) dir.delete();
  } catch {
    // Nothing to clear.
  }
}
