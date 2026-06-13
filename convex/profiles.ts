import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get current user's profile
export const current = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("profiles"),
      _creationTime: v.number(),
      userId: v.id("users"),
      role: v.union(v.literal("owner"), v.literal("admin"), v.literal("user")),
      displayName: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      subscriptionStatus: v.union(
        v.literal("trial"),
        v.literal("active"),
        v.literal("expired"),
        v.literal("cancelled"),
      ),
      trialEndsAt: v.optional(v.number()),
      maxDevices: v.number(),
      biometricSetupComplete: v.optional(v.boolean()),
      stripeCustomerId: v.optional(v.string()),
      stripeSubscriptionId: v.optional(v.string()),
      stripePriceId: v.optional(v.string()),
      currentPeriodEnd: v.optional(v.number()),
      paymentMethod: v.optional(v.union(v.literal("stripe"), v.literal("paypal"))),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
  },
});

// Ensure profile exists — called after signup/login
// First user becomes owner, rest are regular users on trial
export const ensureProfile = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) return null;

    // Check if there are any owners — first user is owner
    const owners = await ctx.db
      .query("profiles")
      .withIndex("by_role", (q) => q.eq("role", "owner"))
      .collect();

    const isFirstUser = owners.length === 0;
    const trialEndsAt = Date.now() + 15 * 24 * 60 * 60 * 1000; // 15 days

    await ctx.db.insert("profiles", {
      userId,
      role: isFirstUser ? "owner" : "user",
      subscriptionStatus: "trial",
      trialEndsAt,
      maxDevices: 10,
    });

    return null;
  },
});

// Admin: list all users with their profiles
export const listAllUsers = query({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id("users"),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      role: v.union(v.literal("owner"), v.literal("admin"), v.literal("user")),
      subscriptionStatus: v.union(
        v.literal("trial"),
        v.literal("active"),
        v.literal("expired"),
        v.literal("cancelled"),
      ),
      deviceCount: v.number(),
      joinedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const myProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!myProfile || (myProfile.role !== "owner" && myProfile.role !== "admin")) {
      return [];
    }

    const profiles = await ctx.db.query("profiles").collect();
    const results = [];

    for (const profile of profiles) {
      const user = await ctx.db.get(profile.userId);
      const devices = await ctx.db
        .query("devices")
        .withIndex("by_userId", (q) => q.eq("userId", profile.userId))
        .collect();

      results.push({
        userId: profile.userId,
        name: user?.name ?? undefined,
        email: user?.email ?? undefined,
        role: profile.role,
        subscriptionStatus: profile.subscriptionStatus,
        deviceCount: devices.length,
        joinedAt: profile._creationTime,
      });
    }

    return results;
  },
});

// Owner: update a user's role
export const updateUserRole = mutation({
  args: {
    targetUserId: v.id("users"),
    newRole: v.union(v.literal("admin"), v.literal("user")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const myProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!myProfile || myProfile.role !== "owner") {
      throw new Error("Only the owner can change user roles");
    }

    const targetProfile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.targetUserId))
      .unique();

    if (!targetProfile) throw new Error("User profile not found");
    if (targetProfile.role === "owner") throw new Error("Cannot change owner role");

    await ctx.db.patch(targetProfile._id, { role: args.newRole });
    return null;
  },
});

// Get activity log for current user
export const getActivityLog = query({
  args: {},
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
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const logs = await ctx.db
      .query("activityLog")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
    return logs;
  },
});

// ONE-TIME: Fix owner account — run once then delete
