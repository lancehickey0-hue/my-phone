import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const log = mutation({
  args: {
    source: v.string(),
    message: v.string(),
  },
  handler: async (ctx, { source, message }) => {
    await ctx.db.insert("debugLogs", { source, message });
  },
});
