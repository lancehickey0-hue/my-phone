/**
 * Shared PIN policy.
 *
 * Imported by both the Convex backend (convex/pin.ts, convex/pinActions.ts)
 * and the app UI (app/pin-setup.tsx, app/lockout.tsx) so the rules shown to
 * the user can't drift from the rules actually enforced on the server.
 *
 * Pure module — no Convex, React, or React Native imports. It exports no
 * Convex functions, so nothing here is reachable over the wire.
 */

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;

/**
 * Consecutive failures allowed before verification starts getting refused.
 * The Nth failure (N = this value) is the first one that triggers a cooldown.
 */
export const MAX_FAILED_ATTEMPTS = 5;

/**
 * Cooldown applied on the 5th, 6th, 7th, ... consecutive failure. The last
 * entry repeats for every failure beyond the length of the ladder.
 */
export const LOCKOUT_LADDER_MS = [
  30_000, // 5th failure — 30 seconds
  60_000, // 6th — 1 minute
  5 * 60_000, // 7th — 5 minutes
  15 * 60_000, // 8th — 15 minutes
  30 * 60_000, // 9th and beyond — 30 minutes
];

/**
 * Validates a candidate PIN. Returns a human-readable reason it was rejected,
 * or null if it's acceptable.
 */
export function validatePin(pin: string): string | null {
  if (!/^[0-9]+$/.test(pin)) {
    return "PIN must contain digits only.";
  }
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    return `PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.`;
  }
  if (new Set(pin).size === 1) {
    return "PIN can't be the same digit repeated.";
  }
  if (isRunOfConsecutiveDigits(pin)) {
    return "PIN can't be a run of consecutive digits (like 1234 or 4321).";
  }
  return null;
}

/** True for "1234", "4321", "5678" — trivially guessable ascending/descending runs. */
function isRunOfConsecutiveDigits(pin: string): boolean {
  if (pin.length < 2) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < pin.length; i++) {
    const delta = Number(pin[i]) - Number(pin[i - 1]);
    if (delta !== 1) ascending = false;
    if (delta !== -1) descending = false;
  }
  return ascending || descending;
}

/**
 * Cooldown to apply given the running count of consecutive failures
 * (counted *including* the failure being recorded). Returns 0 when the
 * threshold hasn't been reached yet.
 */
export function lockoutDurationMs(failedAttempts: number): number {
  if (failedAttempts < MAX_FAILED_ATTEMPTS) return 0;
  const index = Math.min(
    failedAttempts - MAX_FAILED_ATTEMPTS,
    LOCKOUT_LADDER_MS.length - 1,
  );
  return LOCKOUT_LADDER_MS[index];
}

/** Attempts left before the next cooldown kicks in. */
export function attemptsRemaining(failedAttempts: number): number {
  return Math.max(0, MAX_FAILED_ATTEMPTS - failedAttempts);
}

/** "45 seconds" / "5 minutes" — for countdown copy on the unlock screen. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
  }
  const minutes = Math.ceil(totalSeconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
