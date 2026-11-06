/** Free Unsplash photos (https://unsplash.com/license); SmartImage falls back if one fails. */
export const unsplash = (id: string, w = 900) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
