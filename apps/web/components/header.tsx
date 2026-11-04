import Link from "next/link";
import { AccountButton } from "./auth";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 whitespace-nowrap text-lg font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">✈</span>
          Trip Planner
        </Link>
        <nav className="flex items-center gap-3 whitespace-nowrap text-sm font-medium sm:gap-4">
          <Link href="/trips" className="hidden text-muted-foreground hover:text-foreground sm:inline">
            My trips
          </Link>
          <Link href="/trips/new" className="rounded-full bg-primary px-4 py-2 text-primary-foreground hover:opacity-90">
            Plan with AI
          </Link>
          <AccountButton />
        </nav>
      </div>
    </header>
  );
}
