import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

export const add = internalMutation({
  args: {
    source: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("debugLogs", {
      source: args.source,
      message: args.message,
      timestamp: Date.now(),
    });
    return null;
  },
});

export const recent = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("debugLogs"),
      _creationTime: v.number(),
      source: v.string(),
      message: v.string(),
      timestamp: v.number(),
    })
  ),
  handler: async (ctx) => {
    const logs = await ctx.db.query("debugLogs").order("desc").take(200);
    return logs;
  },
});