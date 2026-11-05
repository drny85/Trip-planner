import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** Sends push notifications through Expo's push service (works for iOS and Android). */
export const send = internalAction({
  args: { tokens: v.array(v.string()), title: v.string(), body: v.string(), data: v.any() },
  handler: async (ctx, { tokens, title, body, data }) => {
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100);
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch.map((to) => ({ to, title, body, data, sound: "default" }))),
      });
      if (!res.ok) {
        console.warn("Expo push failed", res.status, await res.text());
        continue;
      }
      // Forget tokens for phones that uninstalled the app or turned notifications off.
      const { data: tickets } = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      const dead = batch.filter((_, j) => tickets?.[j]?.details?.error === "DeviceNotRegistered");
      if (dead.length) await ctx.runMutation(internal.notifications.forgetTokens, { tokens: dead });
    }
  },
});
