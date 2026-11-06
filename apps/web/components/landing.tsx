"use client";

import { Hero } from "./marketing/hero";
import { DestinationMarquee, FinalCta, Features, HowItWorks, ParallaxGallery, ScrollProgress } from "./marketing/sections";
import { UpNext } from "./up-next";

export function Landing() {
  return (
    <main className="relative overflow-x-clip pb-24">
      <ScrollProgress />
      {/* Ambient gradient blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
        <div className="animate-blob absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="animate-blob absolute -right-24 top-40 h-[24rem] w-[24rem] rounded-full bg-accent/20 blur-3xl [animation-delay:-5s]" />
        <div className="animate-blob absolute left-1/3 top-[40rem] h-[20rem] w-[20rem] rounded-full bg-sky-400/15 blur-3xl [animation-delay:-9s]" />
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-8 empty:hidden">
        <UpNext />
      </div>

      <Hero />
      <DestinationMarquee />
      <div className="mt-24 flex flex-col gap-28 sm:mt-32 sm:gap-36">
        <HowItWorks />
        <Features />
        <ParallaxGallery />
        <FinalCta />
      </div>
    </main>
  );
}
