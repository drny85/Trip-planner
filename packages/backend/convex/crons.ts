import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/** Flight and hotel prices, once a day (see alerts.ts for the free-tier budget). */
crons.daily("check watched prices", { hourUTC: 13, minuteUTC: 0 }, internal.alerts.checkPrices, {});

/** Fares for travelers who haven't booked yet (fares.ts), right after the booking prices. */
crons.daily("check fare watches", { hourUTC: 13, minuteUTC: 30 }, internal.fares.checkAll, {});

/** Flight status. Most runs find nothing due; checks only get frequent close to departure. */
crons.interval("check flight status", { minutes: 15 }, internal.alerts.checkFlights, {});

export default crons;
