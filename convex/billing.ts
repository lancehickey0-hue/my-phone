import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Billing & Subscription Management
 *
 * Pricing tiers:
 *   - 15-day free trial (all features)
 *   - $2.99/mo for first 3 months
 *   - $5.99/mo after that
 *
 * Payment methods: Stripe (primary) + PayPal (secondary)
 *
 * In production:
 *   - Stripe handles subscription lifecycle via webhooks
 *   - PayPal uses recurring payments API
 *   - This backend stores subscription state synced from payment providers
 */

// ─── Pricing Constants ──────────────────────────────────────────────────────

// These map to Stripe Price IDs created during setup
export const PRICING = {
  trialDays: 15,
  introPrice: 299, // $2.99 in cents
  introPeriodMonths: 3,
  regularPrice: 599, // $5.99 in cents
  currency: "usd",
} as const;

// ─── Queries ────────────────────────────────────────────────────────────────

// Get current subscription info for the logged-in user
export const getSubscription = query({
  args: {},
  returns: v.union(
    v.object({
      status: v.union(
        v.literal("trial"),
        v.literal("active"),
        v.literal("expired"),
        v.literal("cancelled"),
      ),
      trialEndsAt: v.optional(v.number()),
      trialDaysRemaining: v.number(),
      currentPeriodEnd: v.optional(v.number()),
      paymentMethod: v.optional(v.union(v.literal("stripe"), v.literal("paypal"))),
      stripeCustomerId: v.optional(v.string()),
      isInIntro: v.boolean(), // Still in the $2.99/mo intro period
      currentPrice: v.number(), // Current price in cents
      nextPrice: v.number(), // Price after current period
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!profile) return null;

    const now = Date.now();
    const trialEnd = profile.trialEndsAt ?? 0;
    const trialDaysRemaining = Math.max(0, Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000)));

    // Determine if user is in the intro pricing period
    // Intro = first 3 months after trial ends
    const trialEndDate = new Date(trialEnd);
    const introEndDate = new Date(trialEndDate);
    introEndDate.setMonth(introEndDate.getMonth() + PRICING.introPeriodMonths);
    const isInIntro = now < introEndDate.getTime();

    const currentPrice = isInIntro ? PRICING.introPrice : PRICING.regularPrice;
    const nextPrice = isInIntro ? PRICING.regularPrice : PRICING.regularPrice;

    return {
      status: profile.subscriptionStatus,
      trialEndsAt: profile.trialEndsAt,
      trialDaysRemaining,
      currentPeriodEnd: profile.currentPeriodEnd,
      paymentMethod: profile.paymentMethod,
      stripeCustomerId: profile.stripeCustomerId,
      isInIntro,
      currentPrice,
      nextPrice,
    };
  },
});

// ─── Mutations ──────────────────────────────────────────────────────────────

// Start a subscription (called after Stripe checkout session completes)
export const activateSubscription = mutation({
  args: {
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.string(),
    currentPeriodEnd: v.number(),
    paymentMethod: v.union(v.literal("stripe"), v.literal("paypal")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!profile) throw new Error("Profile not found");

    await ctx.db.patch(profile._id, {
      subscriptionStatus: "active",
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripePriceId: args.stripePriceId,
      currentPeriodEnd: args.currentPeriodEnd,
      paymentMethod: args.paymentMethod,
    });

    await ctx.db.insert("activityLog", {
      userId,
      action: "subscription_activated",
      details: `Subscription started via ${args.paymentMethod}`,
      timestamp: Date.now(),
    });

    return null;
  },
});

// Handle subscription renewal (called by Stripe webhook)
export const renewSubscription = mutation({
  args: {
    stripeCustomerId: v.string(),
    currentPeriodEnd: v.number(),
    stripePriceId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .unique();

    if (!profile) throw new Error("Customer not found");

    const updates: Record<string, unknown> = {
      subscriptionStatus: "active" as const,
      currentPeriodEnd: args.currentPeriodEnd,
    };

    if (args.stripePriceId) {
      updates.stripePriceId = args.stripePriceId;
    }

    await ctx.db.patch(profile._id, updates);
    return null;
  },
});

// Cancel subscription
export const cancelSubscription = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!profile) throw new Error("Profile not found");

    // Mark as cancelled — they keep access until currentPeriodEnd
    await ctx.db.patch(profile._id, {
      subscriptionStatus: "cancelled",
    });

    await ctx.db.insert("activityLog", {
      userId,
      action: "subscription_cancelled",
      details: "User cancelled subscription",
      timestamp: Date.now(),
    });

    return null;
  },
});

// Expire subscription (called by cron or webhook when period ends)
export const expireSubscription = mutation({
  args: { stripeCustomerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .unique();

    if (!profile) return null;

    await ctx.db.patch(profile._id, {
      subscriptionStatus: "expired",
    });

    return null;
  },
});

// Owner bypass — Lance gets full access regardless of subscription
export const checkOwnerAccess = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    // Owner always has full access
    return profile?.role === "owner";
  },
});
