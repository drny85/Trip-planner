import { v } from "convex/values";
import { action } from "./_generated/server";
import { fetchRate } from "./lib/fx";

/**
 * Today's exchange rate, for the expense form: how many `to` one `from` buys.
 * Returns null when no source has it; the form then asks for the rate.
 */
export const rate = action({
  args: { from: v.string(), to: v.string() },
  handler: async (_ctx, { from, to }) => fetchRate(from, to),
});
