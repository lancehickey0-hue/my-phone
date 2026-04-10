import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Get all biometric credentials for current user
export const listCredentials = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("biometricCredentials"),
      _creationTime: v.number(),
      userId: v.id("users"),
      credentialId: v.string(),
      credentialLabel: v.string(),
      registeredAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("biometricCredentials")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

// Register a new biometric credential
export const registerCredential = mutation({
  args: {
    credentialId: v.string(),
    credentialLabel: v.string(),
  },
  returns: v.id("biometricCredentials"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const id = await ctx.db.insert("biometricCredentials", {
      userId,
      credentialId: args.credentialId,
      credentialLabel: args.credentialLabel,
      registeredAt: Date.now(),
    });

    // Update profile
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (profile) {
      await ctx.db.patch(profile._id, { biometricSetupComplete: true });
    }

    await ctx.db.insert("activityLog", {
      userId,
      action: "biometric_registered",
      details: `Registered biometric: ${args.credentialLabel}`,
      timestamp: Date.now(),
    });

    return id;
  },
});

// Remove a biometric credential
export const removeCredential = mutation({
  args: { credentialId: v.id("biometricCredentials") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const cred = await ctx.db.get(args.credentialId);
    if (!cred || cred.userId !== userId) throw new Error("Credential not found");

    await ctx.db.delete(args.credentialId);

    // Check if any creds remain
    const remaining = await ctx.db
      .query("biometricCredentials")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    if (remaining.length === 0) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (profile) {
        await ctx.db.patch(profile._id, { biometricSetupComplete: false });
      }
    }

    return null;
  },
});

// Biometric-verified unlock — after client-side WebAuthn verification succeeds
export const biometricUnlock = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    await ctx.db.patch(args.deviceId, {
      isAlarmActive: false,
      isLocked: false,
      status: "connected",
    });

    await ctx.db.insert("activityLog", {
      userId,
      deviceId: args.deviceId,
      action: "biometric_unlock",
      details: `Biometric unlock: ${device.name}`,
      timestamp: Date.now(),
    });

    return null;
  },
});
