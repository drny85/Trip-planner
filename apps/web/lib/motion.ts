/** Shared motion tokens: strong ease-out for UI, a soft spring for layout moves. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const layoutSpring = { type: "spring", duration: 0.4, bounce: 0.15 } as const;

/** Fade-and-rise entrance; stagger by index, capped so long lists don't wait. */
export const rise = (index = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: EASE_OUT, delay: Math.min(index, 8) * 0.05 },
});
