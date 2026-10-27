import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

// Database side of secure unlock. All crypto (random challenges, RSA
// signature verification, PBKDF2) runs in convex/unlockNode.ts on the
// Node.js runtime, which calls these internal functions.

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const PIN_ATTEMPTS_PER_WINDOW = 3;
const PIN_BASE_LOCKOUT_MS = 5 * 60 * 1000;
const PIN_MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000;

async function requireOwnedDevice(
  ctx: MutationCtx,
  userId: Id<"users">,
  deviceId: Id<"devices">,
): Promise<Doc<"devices">> {
  const device = await ctx.db.get(deviceId);
  if (!device || device.userId !== userId) throw new Error("Device not found");
  return device;
}

async function anyDeviceAlarming(ctx: MutationCtx, userId: Id<"users">): Promise<boolean> {
  const devices = await ctx.db
    .query("devices")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(100);
  return devices.some((d) => d.isAlarmActive || d.isLocked);
}

// Shared "alarm off" — the only path that clears an alarm once secure
// unlock is configured.
export async function clearAlarm(
  ctx: MutationCtx,
  device: Doc<"devices">,
  method: string,
): Promise<void> {
  await ctx.db.patch(device._id, {
    isAlarmActive: false,
    isLocked: false,
    status: "connected",
  });
  await ctx.db.insert("activityLog", {
    userId: device.userId,
    deviceId: device._id,
    action: "biometric_unlock",
    details: `Unlocked ${device.name} (${method})`,
    timestamp: Date.now(),
  });
}

// True when this user has secure unlock set up for this device, i.e. the
// old trust-the-app unlock paths must be refused.
export async function secureUnlockConfigured(
  ctx: MutationCtx,
  userId: Id<"users">,
  deviceId: Id<"devices">,
): Promise<boolean> {
  const key = await ctx.db
    .query("unlockKeys")
    .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
    .first();
  if (key) return true;
  const pin = await ctx.db
    .query("unlockPins")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return !!pin;
}

// ── Public: what the setup/lockout screens need to know ───────────────────
export const status = query({
  args: { deviceId: v.optional(v.id("devices")) },
  returns: v.object({
    hasKey: v.boolean(),
    hasPin: v.boolean(),
    pinLockedUntil: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { hasKey: false, hasPin: false, pinLockedUntil: null };
    let hasKey = false;
    if (args.deviceId) {
      const device = await ctx.db.get(args.deviceId);
      if (device && device.userId === userId) {
        const key = await ctx.db
          .query("unlockKeys")
          .withIndex("by_deviceId", (q) => q.eq("deviceId", device._id))
          .first();
        hasKey = !!key;
      }
    }
    const pin = await ctx.db
      .query("unlockPins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return {
      hasKey,
      hasPin: !!pin,
      pinLockedUntil: pin?.lockedUntil && pin.lockedUntil > Date.now() ? pin.lockedUntil : null,
    };
  },
});

// ── Unlock key ─────────────────────────────────────────────────────────────
export const storeKey = internalMutation({
  args: { userId: v.id("users"), deviceId: v.id("devices"), publicKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await requireOwnedDevice(ctx, args.userId, args.deviceId);
    // Someone holding a stolen, signed-in phone must not be able to swap in
    // their own fingerprint key while it's alarming.
    if (device.isAlarmActive || device.isLocked) {
      throw new Error("Can't change unlock settings while this device is alarming or locked");
    }
    const existing = await ctx.db
      .query("unlockKeys")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .take(10);
    for (const row of existing) await ctx.db.delete(row._id);
    await ctx.db.insert("unlockKeys", {
      deviceId: args.deviceId,
      userId: args.userId,
      publicKey: args.publicKey,
      createdAt: Date.now(),
    });

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (profile) await ctx.db.patch(profile._id, { biometricSetupComplete: true });

    await ctx.db.insert("activityLog", {
      userId: args.userId,
      deviceId: args.deviceId,
      action: "biometric_registered",
      details: `Set up fingerprint/face unlock on ${device.name}`,
      timestamp: Date.now(),
    });
    return null;
  },
});

export const storeChallenge = internalMutation({
  args: { userId: v.id("users"), deviceId: v.id("devices"), challenge: v.string() },
  returns: v.id("unlockChallenges"),
  handler: async (ctx, args) => {
    await requireOwnedDevice(ctx, args.userId, args.deviceId);
    const old = await ctx.db
      .query("unlockChallenges")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .take(20);
    for (const row of old) await ctx.db.delete(row._id);
    return await ctx.db.insert("unlockChallenges", {
      deviceId: args.deviceId,
      userId: args.userId,
      challenge: args.challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
  },
});

// Single use: the challenge is deleted whether or not the signature
// later verifies.
export const consumeChallenge = internalMutation({
  args: {
    userId: v.id("users"),
    deviceId: v.id("devices"),
    challengeId: v.id("unlockChallenges"),
  },
  returns: v.union(v.object({ challenge: v.string(), publicKey: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.challengeId);
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.userId !== args.userId || row.deviceId !== args.deviceId) return null;
    if (row.expiresAt < Date.now()) return null;
    const key = await ctx.db
      .query("unlockKeys")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .first();
    if (!key) return null;
    return { challenge: row.challenge, publicKey: key.publicKey };
  },
});

export const completeKeyUnlock = internalMutation({
  args: { userId: v.id("users"), deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await requireOwnedDevice(ctx, args.userId, args.deviceId);
    await clearAlarm(ctx, device, "fingerprint/face");
    return null;
  },
});

// ── PIN ────────────────────────────────────────────────────────────────────
export const getPinRecord = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({ salt: v.string(), hash: v.string(), iterations: v.number() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const pin = await ctx.db
      .query("unlockPins")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    return pin ? { salt: pin.salt, hash: pin.hash, iterations: pin.iterations } : null;
  },
});

// Charges one attempt up front (so concurrent guesses can't bypass the
// limit) and returns what's needed to check the PIN, or the lockout time.
export const beginPinAttempt = internalMutation({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      kind: v.literal("check"),
      salt: v.string(),
      hash: v.string(),
      iterations: v.number(),
      attemptsLeft: v.number(),
    }),
    v.object({ kind: v.literal("locked"), lockedUntil: v.number() }),
    v.object({ kind: v.literal("no_pin") }),
  ),
  handler: async (ctx, args) => {
    const pin = await ctx.db
      .query("unlockPins")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (!pin) return { kind: "no_pin" as const };

    const now = Date.now();
    if (pin.lockedUntil && pin.lockedUntil > now) {
      return { kind: "locked" as const, lockedUntil: pin.lockedUntil };
    }

    const failedAttempts = pin.failedAttempts + 1;
    let lockedUntil: number | undefined = pin.lockedUntil;
    if (failedAttempts % PIN_ATTEMPTS_PER_WINDOW === 0) {
      const windows = failedAttempts / PIN_ATTEMPTS_PER_WINDOW;
      lockedUntil = now + Math.min(PIN_BASE_LOCKOUT_MS * 2 ** (windows - 1), PIN_MAX_LOCKOUT_MS);
    }
    await ctx.db.patch(pin._id, { failedAttempts, lockedUntil });

    return {
      kind: "check" as const,
      salt: pin.salt,
      hash: pin.hash,
      iterations: pin.iterations,
      attemptsLeft:
        PIN_ATTEMPTS_PER_WINDOW - (failedAttempts % PIN_ATTEMPTS_PER_WINDOW || PIN_ATTEMPTS_PER_WINDOW),
    };
  },
});

// Correct PIN: refund the charged attempt and clear any lockout.
export const pinAttemptSucceeded = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pin = await ctx.db
      .query("unlockPins")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (pin) await ctx.db.patch(pin._id, { failedAttempts: 0, lockedUntil: undefined });
    return null;
  },
});

export const completePinUnlock = internalMutation({
  args: { userId: v.id("users"), deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await requireOwnedDevice(ctx, args.userId, args.deviceId);
    await clearAlarm(ctx, device, "PIN");
    return null;
  },
});

export const storePin = internalMutation({
  args: {
    userId: v.id("users"),
    salt: v.string(),
    hash: v.string(),
    iterations: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await anyDeviceAlarming(ctx, args.userId)) {
      throw new Error("Can't change your PIN while one of your devices is alarming or locked");
    }
    const existing = await ctx.db
      .query("unlockPins")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        salt: args.salt,
        hash: args.hash,
        iterations: args.iterations,
        failedAttempts: 0,
        lockedUntil: undefined,
      });
    } else {
      await ctx.db.insert("unlockPins", {
        userId: args.userId,
        salt: args.salt,
        hash: args.hash,
        iterations: args.iterations,
        failedAttempts: 0,
      });
    }
    await ctx.db.insert("activityLog", {
      userId: args.userId,
      action: existing ? "pin_changed" : "pin_set",
      details: existing ? "Changed My-Phone PIN" : "Set My-Phone PIN",
      timestamp: Date.now(),
    });
    return null;
  },
});
