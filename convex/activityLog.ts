import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { v } from "convex/values";

// Get recent activity for the current user (across all devices)
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("activityLog"),
      _creationTime: v.number(),
      userId: v.id("users"),
      deviceId: v.optional(v.id("devices")),
      action: v.string(),
      details: v.optional(v.string()),
      timestamp: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const logs = await ctx.db
      .query("activityLog")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit ?? 50);

    return logs;
  },
});

// Get activity for a specific device
export const listByDevice = query({
  args: {
    deviceId: v.id("devices"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("activityLog"),
      _creationTime: v.number(),
      userId: v.id("users"),
      deviceId: v.optional(v.id("devices")),
      action: v.string(),
      details: v.optional(v.string()),
      timestamp: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) return [];

    const logs = await ctx.db
      .query("activityLog")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .order("desc")
      .take(args.limit ?? 25);

    return logs;
  },
});
