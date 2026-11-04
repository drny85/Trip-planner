import Link from "next/link";

const FEATURES = [
  { title: "AI itineraries", body: "Describe a trip in a sentence and get every day planned, with addresses, times and booking links." },
  { title: "Edit on the fly", body: "Reword, reorder or move activities between days. Changes sync instantly to your phone." },
  { title: "Check it off", body: "Tick off places as you go, call ahead, get directions or reserve in one tap." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-20">
      <section className="flex flex-col items-start gap-6">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">✨ Powered by Claude</span>
        <h1 className="max-w-3xl text-5xl font-extrabold tracking-tight sm:text-6xl">
          Your whole trip, planned in under a minute.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Tell Trip Planner where you&apos;re going and what you love. It builds a day-by-day itinerary you can edit, reorder
          and check off on the web or on your phone.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/trips/new" className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90">
            Plan a trip with AI
          </Link>
          <Link href="/trips" className="rounded-full bg-muted px-6 py-3 font-semibold hover:bg-border">
            View my trips
          </Link>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold">{f.title}</h2>
            <p className="mt-2 text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
