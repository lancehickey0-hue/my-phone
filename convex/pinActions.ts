"use node";

/**
 * PIN unlock — crypto side.
 *
 * Runs in the Node runtime because it needs node:crypto for PBKDF2. Every
 * database touch is delegated to the internal mutations in convex/pin.ts, so
 * attempt counting and lockout stay transactional (see the note there).
 *
 * Why server-side verification at all, when the unlock screen is on the same
 * phone that's locked? Because that phone may be in a thief's hands. A PIN
 * checked on-device is a PIN an attacker can brute-force offline against
 * local storage; a PIN checked here is one they get five tries at before the
 * cooldown ladder makes guessing impractical.
 */

import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { validatePin } from "./pinPolicy";

const pbkdf2 = promisify(pbkdf2Callback);

// OWASP's floor for PBKDF2-HMAC-SHA512 at the time of writing. Stored per
// credential so this can be raised later without invalidating existing PINs.
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;
const DIGEST = "sha512";

const pinResult = v.object({
  success: v.boolean(),
  error: v.optional(v.string()),
  /** Tries left before the next cooldown. Only present on a wrong PIN. */
  attemptsLeft: v.optional(v.number()),
  /** Epoch ms. Present whenever a cooldown is in effect. */
  lockedUntil: v.optional(v.number()),
});

type PinResult = {
  success: boolean;
  error?: string;
  attemptsLeft?: number;
  lockedUntil?: number;
};

async function derive(
  pin: string,
  saltHex: string,
  iterations: number,
  digest: string,
): Promise<Buffer> {
  return await pbkdf2(pin, Buffer.from(saltHex, "hex"), iterations, KEY_LENGTH, digest);
}

/** Constant-time compare of a freshly derived key against the stored one. */
function matches(derived: Buffer, storedHex: string): boolean {
  const stored = Buffer.from(storedHex, "hex");
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(derived, stored);
}

/**
 * Runs one guess against the stored credential, charging it to the attempt
 * counter. Callers get back either `{ ok: true }` or a ready-to-return
 * failure result.
 */
async function checkPin(
  ctx: { runMutation: (ref: any, args: any) => Promise<any> },
  pin: string,
): Promise<{ ok: true } | { ok: false; result: PinResult }> {
  const attempt = await ctx.runMutation(internal.pin.beginAttempt, {});

  if (!attempt.ok) {
    if (attempt.reason === "no_pin") {
      return {
        ok: false,
        result: { success: false, error: "No PIN is set up on this account." },
      };
    }
    return {
      ok: false,
      result: {
        success: false,
        error: "Too many incorrect attempts. Try again shortly.",
        lockedUntil: attempt.lockedUntil,
        attemptsLeft: 0,
      },
    };
  }

  const derived = await derive(pin, attempt.salt, attempt.iterations, attempt.digest);
  if (matches(derived, attempt.hash)) {
    return { ok: true };
  }

  const failure: PinResult = {
    success: false,
    error:
      attempt.attemptsLeft > 0
        ? `Incorrect PIN. ${attempt.attemptsLeft} attempt${attempt.attemptsLeft === 1 ? "" : "s"} remaining.`
        : "Too many incorrect attempts. Try again shortly.",
    attemptsLeft: attempt.attemptsLeft,
  };
  if (attempt.lockedUntil !== null) failure.lockedUntil = attempt.lockedUntil;

  return { ok: false, result: failure };
}

async function storePin(
  ctx: { runMutation: (ref: any, args: any) => Promise<any> },
  pin: string,
  proof: { currentPinVerified: boolean; viaBiometric: boolean },
): Promise<PinResult> {
  const invalid = validatePin(pin);
  if (invalid) return { success: false, error: invalid };

  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = await derive(pin, salt, ITERATIONS, DIGEST);

  try {
    await ctx.runMutation(internal.pin.writeCredential, {
      hash: derived.toString("hex"),
      salt,
      iterations: ITERATIONS,
      digest: DIGEST,
      currentPinVerified: proof.currentPinVerified,
      viaBiometric: proof.viaBiometric,
    });
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Could not save PIN." };
  }

  return { success: true };
}

/**
 * Sets the unlock PIN. Changing an existing PIN requires the current one —
 * a session alone isn't enough, so a phone left unlocked on a table can't be
 * quietly re-keyed.
 */
export const setPin = action({
  args: {
    pin: v.string(),
    currentPin: v.optional(v.string()),
  },
  returns: pinResult,
  handler: async (ctx, args): Promise<PinResult> => {
    let currentPinVerified = false;
    if (args.currentPin !== undefined) {
      const check = await checkPin(ctx, args.currentPin);
      if (!check.ok) return check.result;
      await ctx.runMutation(internal.pin.clearAttempts, {});
      currentPinVerified = true;
    }

    return await storePin(ctx, args.pin, { currentPinVerified, viaBiometric: false });
  },
});

/**
 * Verifies the PIN without unlocking anything — used by the setup screen to
 * confirm the current PIN before asking for a new one, so a wrong PIN is
 * caught immediately rather than after typing the replacement twice.
 */
export const verifyPin = action({
  args: { pin: v.string() },
  returns: pinResult,
  handler: async (ctx, args): Promise<PinResult> => {
    const check = await checkPin(ctx, args.pin);
    if (!check.ok) return check.result;

    await ctx.runMutation(internal.pin.clearAttempts, {});
    return { success: true };
  },
});

/** Correct PIN on the lockout screen — clears the alarm and releases the device. */
export const verifyAndUnlock = action({
  args: {
    pin: v.string(),
    deviceId: v.optional(v.id("devices")),
  },
  returns: pinResult,
  handler: async (ctx, args): Promise<PinResult> => {
    const check = await checkPin(ctx, args.pin);
    if (!check.ok) return check.result;

    if (args.deviceId) {
      await ctx.runMutation(internal.pin.completeUnlock, { deviceId: args.deviceId });
    } else {
      // No device context (e.g. the lockout screen opened without params) —
      // the PIN was still correct, so at least release the attempt counter.
      await ctx.runMutation(internal.pin.clearAttempts, {});
    }

    return { success: true };
  },
});

/** Removes the PIN. Requires the current one, same reasoning as `setPin`. */
export const removePin = action({
  args: { currentPin: v.string() },
  returns: pinResult,
  handler: async (ctx, args): Promise<PinResult> => {
    const check = await checkPin(ctx, args.currentPin);
    if (!check.ok) return check.result;

    await ctx.runMutation(internal.pin.deleteCredential, {});
    return { success: true };
  },
});

/**
 * Forgot-PIN path: the caller has just passed an OS biometric prompt, so a
 * new PIN can be set without knowing the old one.
 *
 * The biometric check itself happens on the device — the server can only
 * confirm the account *has* a registered biometric, which `writeCredential`
 * enforces. That's the same trust model the existing `biometric.biometricUnlock`
 * mutation already runs on, so this adds no reach an attacker with the
 * session doesn't already have. Without this path a forgotten PIN would be
 * permanently unfixable, since every other write here demands the old PIN.
 */
export const resetPinWithBiometric = action({
  args: { pin: v.string() },
  returns: pinResult,
  handler: async (ctx, args): Promise<PinResult> => {
    return await storePin(ctx, args.pin, {
      currentPinVerified: false,
      viaBiometric: true,
    });
  },
});
