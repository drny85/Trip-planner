"use client";

import { api } from "@trip/backend/api";
import { useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const IDEAS = [
  "5 days in Tokyo on a moderate budget, love food and temples",
  "A relaxed long weekend in Lisbon with great seafood",
  "4 days in Mexico City for art lovers",
  "A week road-tripping the Amalfi Coast",
];

export function GenerateTripForm() {
  const generate = useAction(api.ai.generateTrip);
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tripId = await generate({ prompt });
      router.push(`/trips/${tripId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(message.match(/Uncaught Error: (.*?)(\n|$)/)?.[1] ?? "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Where to?</h1>
        <p className="mt-1 text-muted-foreground">
          Say where, how long, your budget and what you enjoy. You can edit everything afterwards.
        </p>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={loading}
        autoFocus
        rows={4}
        maxLength={2000}
        placeholder="e.g. 5 days in Tokyo on a moderate budget"
        className="rounded-2xl border border-border bg-card p-4 text-base outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="flex flex-wrap gap-2">
        {IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            disabled={loading}
            onClick={() => setPrompt(idea)}
            className="rounded-full bg-muted px-3 py-1.5 text-sm hover:bg-border"
          >
            {idea}
          </button>
        ))}
      </div>
      <button
        type="submit"
        disabled={loading || prompt.trim().length < 3}
        className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Planning your trip… (usually under a minute)" : "✨ Generate itinerary"}
      </button>
      {error && <p className="text-center text-danger">{error}</p>}
    </form>
  );
}
