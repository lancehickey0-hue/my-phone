// Shared PIN rules for the My-Phone PIN. Imported by the server
// (convex/unlockNode.ts) and by the app screens, so both reject the same
// PINs. Pure code only — no Convex or Node imports.
//
// The My-Phone PIN is deliberately separate from the phone's own screen
// lock. Android gives apps no way to read or compare against the screen
// lock code, so we can't technically block reuse; the setup screen tells
// the owner to pick a different one, and we reject the guessable PINs a
// thief would try first.

export const PIN_MIN = 4;
export const PIN_MAX = 8;
export const PIN_FORMAT = /^\d{4,8}$/;

const COMMON_PINS = new Set([
  "1004", "2000", "1122", "6969", "2580", "0852", "1313", "4444",
  "1010", "2001", "1111", "0000", "1234", "12345", "123456", "654321",
  "112233", "121212", "123123", "111111", "000000", "159753", "147258",
]);

function isSequential(pin: string): boolean {
  let up = true;
  let down = true;
  for (let i = 1; i < pin.length; i++) {
    const diff = Number(pin[i]) - Number(pin[i - 1]);
    if (diff !== 1 && diff !== -9) up = false;
    if (diff !== -1 && diff !== 9) down = false;
  }
  return up || down;
}

function isRepeatingPattern(pin: string): boolean {
  // "1111", "1212", "123123", "4545" — a short chunk repeated.
  for (let size = 1; size <= pin.length / 2; size++) {
    if (pin.length % size !== 0) continue;
    const chunk = pin.slice(0, size);
    if (chunk.repeat(pin.length / size) === pin) return true;
  }
  return false;
}

// Returns a plain-English problem with the PIN, or null if it's OK.
export function pinProblem(pin: string): string | null {
  if (!PIN_FORMAT.test(pin)) return `Use ${PIN_MIN} to ${PIN_MAX} numbers.`;
  if (COMMON_PINS.has(pin) || isSequential(pin) || isRepeatingPattern(pin)) {
    return "That PIN is too easy to guess. Try a different one.";
  }
  return null;
}
