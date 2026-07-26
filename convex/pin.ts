/**
 * PIN unlock — database side.
 *
 * All the hashing lives in convex/pinActions.ts (Node runtime, needs
 * node:crypto). This file owns everything transactional: reading the
 * credential, counting failed attempts, applying the lockout ladder, and
 * writing credentials/unlock results.
 *
 * The split matters for correctness, not just tidiness: attempt counting has
 * to happen inside a transaction, otherwise two concurrent guesses could each
 * read "0 failures" and the lockout would never bite.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { attemptsRemaining, lockoutDurationMs } from "./pinPolicy";

async function credentialFor(ctx: MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("pinCredentials")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/**
 * Whether a PIN is set, and whether it's currently in cooldown. Safe to call
 * from anywhere in the UI — it exposes no part of the credential itself.
 */
export const status = query({
  args: {},
  returns: v.object({
    isSet: v.boolean(),
    failedAttempts: v.number(),
    lockedUntil: v.union(v.number(), v.null()),
    updatedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { isSet: false, failedAttempts: 0, lockedUntil: null, updatedAt: null };
    }

    const cred = await ctx.db
      .query("pinCredentials")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!cred) {
      return { isSet: false, failedAttempts: 0, lockedUntil: null, updatedAt: null };
    }

    const now = Date.now();
    return {
      isSet: true,
      failedAttempts: cred.failedAttempts,
      lockedUntil: cred.lockedUntil && cred.lockedUntil > now ? cred.lockedUntil : null,
      updatedAt: cred.updatedAt,
    };
  },
});

/**
 * Opens a verification attempt: checks the cooldown, charges the attempt
 * against the counter *up front*, and hands back the stored derivation
 * parameters so the action can recompute the hash.
 *
 * The attempt is counted before the PIN is even checked, deliberately. If the
 * action crashes, times out, or the caller drops the connection mid-verify,
 * the attempt still counts — the failure mode is "an honest user loses one of
 * five tries", not "an attacker guesses forever by killing the request".
 * A successful verify calls `clearAttempts`/`completeUnlock`, which zeroes
 * the counter again.
 */
export const beginAttempt = internalMutation({
  args: {},
  returns: v.union(
    v.object({ ok: v.literal(false), reason: v.literal("no_pin") }),
    v.object({
      ok: v.literal(false),
      reason: v.literal("locked_out"),
      lockedUntil: v.number(),
    }),
    v.object({
      ok: v.literal(true),
      hash: v.string(),
      salt: v.string(),
      iterations: v.number(),
      digest: v.string(),
      attemptsLeft: v.number(),
      lockedUntil: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const cred = await credentialFor(ctx, userId);
    if (!cred) return { ok: false as const, reason: "no_pin" as const };

    const now = Date.now();
    if (cred.lockedUntil && cred.lockedUntil > now) {
      return {
        ok: false as const,
        reason: "locked_out" as const,
        lockedUntil: cred.lockedUntil,
      };
    }

    const failedAttempts = cred.failedAttempts + 1;
    const cooldown = lockoutDurationMs(failedAttempts);
    const lockedUntil = cooldown > 0 ? now + cooldown : undefined;

    await ctx.db.patch(cred._id, {
      failedAttempts,
      lastFailedAt: now,
      lockedUntil,
    });

    return {
      ok: true as const,
      hash: cred.hash,
      salt: cred.salt,
      iterations: cred.iterations,
      digest: cred.digest,
      attemptsLeft: attemptsRemaining(failedAttempts),
      lockedUntil: lockedUntil ?? null,
    };
  },
});

/** Clears the pessimistic charge from `beginAttempt` after a correct PIN. */
export const clearAttempts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const cred = await credentialFor(ctx, userId);
    if (cred) {
      await ctx.db.patch(cred._id, {
        failedAttempts: 0,
        lockedUntil: undefined,
      });
    }
    return null;
  },
});

/**
 * Correct PIN on the lockout screen: clear the counters and release the
 * device. Mirrors `biometric.biometricUnlock` so both unlock paths leave the
 * device in the same state and both show up in the activity log.
 */
export const completeUnlock = internalMutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const cred = await credentialFor(ctx, userId);
    if (cred) {
      await ctx.db.patch(cred._id, {
        failedAttempts: 0,
        lockedUntil: undefined,
      });
    }

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
      action: "pin_unlock",
      details: `PIN unlock: ${device.name}`,
      timestamp: Date.now(),
    });

    return null;
  },
});

/**
 * Creates or replaces the credential.
 *
 * Replacing an existing PIN needs one of two proofs, checked here rather than
 * in the action so no caller can skip it: `currentPinVerified` (the action
 * just checked the old PIN) or `viaBiometric` (the forgot-PIN path, which
 * additionally requires the account to have a biometric registered).
 */
export const writeCredential = internalMutation({
  args: {
    hash: v.string(),
    salt: v.string(),
    iterations: v.number(),
    digest: v.string(),
    currentPinVerified: v.boolean(),
    viaBiometric: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (args.viaBiometric) {
      const bio = await ctx.db
        .query("biometricCredentials")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      if (!bio) {
        throw new Error("No biometric credential registered on this account");
      }
    }

    const now = Date.now();
    const existing = await credentialFor(ctx, userId);

    if (existing && !args.currentPinVerified && !args.viaBiometric) {
      throw new Error("Current PIN required to change an existing PIN");
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        hash: args.hash,
        salt: args.salt,
        iterations: args.iterations,
        digest: args.digest,
        updatedAt: now,
        failedAttempts: 0,
        lockedUntil: undefined,
      });
    } else {
      await ctx.db.insert("pinCredentials", {
        userId,
        hash: args.hash,
        salt: args.salt,
        iterations: args.iterations,
        digest: args.digest,
        createdAt: now,
        updatedAt: now,
        failedAttempts: 0,
      });
    }

    await ctx.db.insert("activityLog", {
      userId,
      action: existing ? "pin_changed" : "pin_set",
      details: args.viaBiometric
        ? "Unlock PIN reset after biometric verification"
        : existing
          ? "Unlock PIN changed"
          : "Unlock PIN set",
      timestamp: now,
    });

    return null;
  },
});

/** Removes the credential. The action verifies the current PIN first. */
export const deleteCredential = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const cred = await credentialFor(ctx, userId);
    if (!cred) return null;

    await ctx.db.delete(cred._id);

    await ctx.db.insert("activityLog", {
      userId,
      action: "pin_removed",
      details: "Unlock PIN removed",
      timestamp: Date.now(),
    });

    return null;
  },
});
