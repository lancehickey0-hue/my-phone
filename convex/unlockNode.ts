"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { pinProblem } from "./pinRules";
import { createPublicKey, pbkdf2Sync, randomBytes, timingSafeEqual, verify } from "node:crypto";

// Crypto side of secure unlock (Node.js runtime, node:crypto).
//
// Stopping an alarm needs ONE of:
//   • a signature over a fresh server challenge from the device's
//     hardware-backed key (only usable after the owner's strong biometric), or
//   • the account's My-Phone PIN, checked here with PBKDF2 and an attempt
//     limit enforced by convex/unlock.ts.

const PIN_ITERATIONS = 210_000;
const PIN_REGEX = /^\d{4,8}$/;

function hashPin(pin: string, saltHex: string, iterations: number): Buffer {
  return pbkdf2Sync(pin, Buffer.from(saltHex, "hex"), iterations, 32, "sha256");
}

function pinMatches(pin: string, record: { salt: string; hash: string; iterations: number }): boolean {
  const actual = hashPin(pin, record.salt, record.iterations);
  const expected = Buffer.from(record.hash, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

type PinResult =
  | { ok: true }
  | { ok: false; reason: "wrong_pin"; attemptsLeft: number }
  | { ok: false; reason: "locked"; lockedUntil: number }
  | { ok: false; reason: "no_pin" };

type PinAttempt =
  | { kind: "check"; salt: string; hash: string; iterations: number; attemptsLeft: number }
  | { kind: "locked"; lockedUntil: number }
  | { kind: "no_pin" };

const pinResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), reason: v.literal("wrong_pin"), attemptsLeft: v.number() }),
  v.object({ ok: v.literal(false), reason: v.literal("locked"), lockedUntil: v.number() }),
  v.object({ ok: v.literal(false), reason: v.literal("no_pin") }),
);

// ── Fingerprint / face key ─────────────────────────────────────────────────
export const registerKey = action({
  args: { deviceId: v.id("devices"), publicKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    // Reject anything that isn't a usable RSA public key up front.
    const key = createPublicKey({ key: Buffer.from(args.publicKey, "base64"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "rsa") throw new Error("Unsupported key type");
    await ctx.runMutation(internal.unlock.storeKey, {
      userId,
      deviceId: args.deviceId,
      publicKey: args.publicKey,
    });
    return null;
  },
});

export const createChallenge = action({
  args: { deviceId: v.id("devices") },
  returns: v.object({ challengeId: v.id("unlockChallenges"), challenge: v.string() }),
  handler: async (ctx, args): Promise<{ challengeId: Id<"unlockChallenges">; challenge: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const challenge = randomBytes(32).toString("base64");
    const challengeId: Id<"unlockChallenges"> = await ctx.runMutation(internal.unlock.storeChallenge, {
      userId,
      deviceId: args.deviceId,
      challenge,
    });
    return { challengeId, challenge };
  },
});

export const unlockWithSignature = action({
  args: {
    deviceId: v.id("devices"),
    challengeId: v.id("unlockChallenges"),
    signature: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const pending: { challenge: string; publicKey: string } | null = await ctx.runMutation(internal.unlock.consumeChallenge, {
      userId,
      deviceId: args.deviceId,
      challengeId: args.challengeId,
    });
    if (!pending) return false;

    let valid = false;
    try {
      valid = verify(
        "sha256",
        Buffer.from(pending.challenge, "base64"),
        { key: Buffer.from(pending.publicKey, "base64"), format: "der", type: "spki" },
        Buffer.from(args.signature, "base64"),
      );
    } catch {
      valid = false;
    }
    if (!valid) return false;

    await ctx.runMutation(internal.unlock.completeKeyUnlock, { userId, deviceId: args.deviceId });
    return true;
  },
});

// ── PIN ────────────────────────────────────────────────────────────────────
// Changing an existing PIN requires the current one (same attempt limit),
// so a signed-in thief can't just overwrite it.
export const setPin = action({
  args: { pin: v.string(), currentPin: v.optional(v.string()) },
  returns: pinResult,
  handler: async (ctx, args): Promise<PinResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const problem = pinProblem(args.pin);
    if (problem) throw new Error(problem);

    const existing: { salt: string; hash: string; iterations: number } | null = await ctx.runQuery(internal.unlock.getPinRecord, { userId });
    if (existing) {
      const attempt: PinAttempt = await ctx.runMutation(internal.unlock.beginPinAttempt, { userId });
      if (attempt.kind === "locked") return { ok: false as const, reason: "locked" as const, lockedUntil: attempt.lockedUntil };
      if (attempt.kind === "check") {
        if (!args.currentPin || !pinMatches(args.currentPin, attempt)) {
          return { ok: false as const, reason: "wrong_pin" as const, attemptsLeft: attempt.attemptsLeft };
        }
        await ctx.runMutation(internal.unlock.pinAttemptSucceeded, { userId });
      }
    }

    const salt = randomBytes(16).toString("hex");
    const hash = hashPin(args.pin, salt, PIN_ITERATIONS).toString("hex");
    await ctx.runMutation(internal.unlock.storePin, { userId, salt, hash, iterations: PIN_ITERATIONS });
    return { ok: true as const };
  },
});

export const unlockWithPin = action({
  args: { deviceId: v.id("devices"), pin: v.string() },
  returns: pinResult,
  handler: async (ctx, args): Promise<PinResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const attempt: PinAttempt = await ctx.runMutation(internal.unlock.beginPinAttempt, { userId });
    if (attempt.kind === "no_pin") return { ok: false as const, reason: "no_pin" as const };
    if (attempt.kind === "locked") return { ok: false as const, reason: "locked" as const, lockedUntil: attempt.lockedUntil };

    if (!PIN_REGEX.test(args.pin) || !pinMatches(args.pin, attempt)) {
      return { ok: false as const, reason: "wrong_pin" as const, attemptsLeft: attempt.attemptsLeft };
    }

    await ctx.runMutation(internal.unlock.pinAttemptSucceeded, { userId });
    await ctx.runMutation(internal.unlock.completePinUnlock, { userId, deviceId: args.deviceId });
    return { ok: true as const };
  },
});
