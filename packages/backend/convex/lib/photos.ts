/**
 * Free stock photos from Unsplash (https://unsplash.com/license, free to use, no
 * attribution required). The model can't know real photo URLs, so AI trips pick
 * from these pools by activity category. The apps fall back to a seeded
 * picsum.photos image, and then to a colored placeholder, if a URL fails to load.
 */
const unsplash = (id: string, width = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=80`;

const POOLS = {
  hero: [
    "1488646953014-85cb44e25828",
    "1469854523086-cc02fe5d8800",
    "1476514525535-07fb3b4ae5f1",
    "1500835556837-99ac94a94552",
    "1507525428034-b723cf961d3e",
    "1499856871958-5b9627545d1a",
  ],
  sightseeing: [
    "1499856871958-5b9627545d1a",
    "1467269204594-9661b134dd2b",
    "1523906834658-6e24ef2386f9",
    "1529260830199-42c24126f198",
    "1552832230-c0197dd311b5",
  ],
  food: [
    "1504674900247-0877df9cc836",
    "1414235077428-338989a2e8c0",
    "1517248135467-4c7edcad34c4",
    "1540189549336-e6e99c3679fe",
  ],
  nature: [
    "1501785888041-af3ef285b470",
    "1470071459604-3b5ec3a7fe05",
    "1441974231531-c6227db76b6e",
    "1506905925346-21bda4d32df4",
  ],
  nightlife: [
    "1514525253161-7a46d19cd819",
    "1470337458703-46ad1756a187",
    "1566417713940-fe7c737a9ef2",
  ],
  transport: ["1474487548417-781cb71495f3", "1436491865332-7a61a109cc05"],
  shopping: ["1441986300917-64674bd600d8", "1483985988355-763728e1935b"],
  lodging: ["1566073771259-6a8506099945", "1551882547-ff40c63fe5fa"],
  other: ["1488646953014-85cb44e25828", "1469854523086-cc02fe5d8800"],
} as const;

export type PhotoPool = keyof typeof POOLS;

/**
 * Narrower pools for subcategories whose look differs from the rest of their
 * category, so a car transfer doesn't get a train and a fish lunch doesn't get a
 * pizza. Food photos stay generic (tables, rooms, coffee) because the model
 * doesn't tell us the cuisine reliably.
 */
const SUB_POOLS: Partial<Record<`${PhotoPool}:${string}`, readonly string[]>> = {
  "transport:flight": ["1436491865332-7a61a109cc05"],
  "transport:train": ["1474487548417-781cb71495f3"],
  "transport:car": ["1449965408869-eaa3f722e40d", "1502877338535-766e1452684a"],
  "transport:taxi": ["1556122071-e404eaedb77f"],
  "transport:bus": ["1544620347-c4fd4a3d5957", "1570125909232-eb263c188f7e"],
  "transport:ferry": ["1548574505-5e239809ee19", "1567899378494-47b22a2ae96a"],
  "transport:walk": ["1476480862126-209bfaa8edc8"],
  "food:breakfast": ["1525351484163-7529414344d8", "1533089860892-a7c6f0a88666"],
  "food:brunch": ["1525351484163-7529414344d8", "1533089860892-a7c6f0a88666"],
  "food:cafe": ["1495474472287-4d71bcdd2085", "1509042239860-f550ce710b93"],
  "food:drinks": ["1514362545857-3bc16c4c7d1b"],
};

/** The photos to choose from for a category, narrowed by subcategory when there's a pool for it. */
export const poolIds = (pool: PhotoPool, subcategory?: string): readonly string[] =>
  (subcategory && SUB_POOLS[`${pool}:${subcategory}`]) || POOLS[pool];

/** Small stable hash so the same activity always gets the same photo. */
function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function photoFor(pool: PhotoPool, seed: string, width?: number, subcategory?: string) {
  const ids = poolIds(pool, subcategory);
  return unsplash(ids[hash(seed) % ids.length]!, width);
}

export { unsplash };

/**
 * Like `photoFor`, but remembers what it handed out, so one trip doesn't show the
 * same stock photo on two different places until a pool runs out.
 */
export function photoPicker() {
  const used = new Set<string>();
  return (pool: PhotoPool, seed: string, width?: number, subcategory?: string) => {
    const ids = poolIds(pool, subcategory);
    const start = hash(seed) % ids.length;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[(start + i) % ids.length]!;
      if (!used.has(id)) {
        used.add(id);
        return unsplash(id, width);
      }
    }
    return unsplash(ids[start]!, width);
  };
}
