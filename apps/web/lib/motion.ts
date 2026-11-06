"use client";

import { useEffect } from "react";
import { useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";

/** Shared motion tokens: strong ease-out for UI, a soft spring for layout moves. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const layoutSpring = { type: "spring", duration: 0.4, bounce: 0.15 } as const;

/** Fade-and-rise entrance; stagger by index, capped so long lists don't wait. */
export const rise = (index = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: EASE_OUT, delay: Math.min(index, 8) * 0.05 },
});

/** A soft spring for pointer and scroll follow, so parallax never jitters. */
export const followSpring = { stiffness: 120, damping: 20, mass: 0.4 } as const;

/**
 * Maps a 0..1 scroll progress to a parallax offset. Returns a still value when the
 * visitor asked for reduced motion, since scroll-linked styles bypass MotionConfig.
 */
export function useParallax(progress: MotionValue<number>, from: number, to: number) {
  const reduce = useReducedMotion();
  return useTransform(progress, [0, 1], reduce ? [0, 0] : [from, to]);
}

/**
 * The pointer's position over the window, from -1 to 1 on each axis, smoothed by a
 * spring. Stays at 0 on touch screens and with reduced motion.
 */
export function usePointerParallax() {
  const reduce = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, followSpring);
  const y = useSpring(rawY, followSpring);
  useEffect(() => {
    if (reduce || !window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth) * 2 - 1);
      rawY.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, rawX, rawY]);
  return { x, y };
}

/**
 * Pointer tilt for a card: spread the returned props onto a motion element. It
 * also sets --mx/--my (pointer position in %) for CSS spotlights. Mouse only.
 */
export function useTilt<T extends HTMLElement>(maxDeg = 10) {
  const reduce = useReducedMotion();
  const rotateX = useSpring(0, followSpring);
  const rotateY = useSpring(0, followSpring);
  return {
    style: { rotateX, rotateY, transformPerspective: 900 },
    onPointerMove: (e: React.PointerEvent<T>) => {
      if (reduce || e.pointerType !== "mouse") return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
      rotateY.set((px - 0.5) * maxDeg);
      rotateX.set((0.5 - py) * maxDeg);
    },
    onPointerLeave: () => {
      rotateX.set(0);
      rotateY.set(0);
    },
  };
}
