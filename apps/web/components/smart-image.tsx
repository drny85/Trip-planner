"use client";

import { cn, fallbackPhoto } from "@trip/ui";
import { useState } from "react";

type Props = {
  src: string;
  seed: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  emoji?: string;
  tint?: string;
};

/**
 * Photo with a fallback chain: the stored URL, then a seeded picsum photo, then a
 * tinted emoji placeholder. Each photo fades in once loaded.
 */
export function SmartImage({ src, seed, alt = "", className, imgClassName, priority, emoji = "📍", tint = "#0e7c66" }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const source = attempt === 0 ? src : attempt === 1 ? fallbackPhoto(seed, 1200, 800) : null;

  return (
    <div className={cn("relative overflow-hidden", className)} style={{ backgroundColor: `${tint}1f` }}>
      <div className="absolute inset-0 grid place-items-center text-4xl opacity-60" aria-hidden>
        {emoji}
      </div>
      {!loaded && source && <div className="shimmer absolute inset-0" />}
      {source && (
        // eslint-disable-next-line @next/next/no-img-element -- plain img keeps the onError fallback chain simple
        <img
          key={source}
          src={source}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          draggable={false}
          // A server-rendered photo can finish loading before React hydrates, so onLoad never fires.
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setAttempt((a) => a + 1);
          }}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            loaded ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
      )}
    </div>
  );
}
