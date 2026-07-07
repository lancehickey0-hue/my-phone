// Device type to icon mapping for React Native
export type DeviceType = 'phone' | 'tablet' | 'laptop' | 'earbuds' | 'watch';

export const deviceEmojis: Record<DeviceType, string> = {
  phone: '📱',
  tablet: '📱',
  laptop: '💻',
  earbuds: '🎧',
  watch: '⌚',
};

// Helper that handles unknown types gracefully
export function deviceEmoji(type: string): string {
  return deviceEmojis[type as DeviceType] ?? '📱';
}

export const deviceLabels: Record<DeviceType, string> = {
  phone: 'Phone',
  tablet: 'Tablet',
  laptop: 'Laptop',
  earbuds: 'Earbuds',
  watch: 'Watch',
};

// Wake phrases come from the device's own `wakePhrase` / `customWakePhrase`
// field in Convex (set at device creation, editable later) — NOT derived
// from type here. Vosk transcribes plain lowercase speech with no
// punctuation, so the stored phrase ("Hey, My-Phone, where are you?") needs
// normalizing before it can be matched against what Vosk actually hears.
export function normalizeWakePhrase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[,.?!]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Generates the match variants VoskHandler checks against, from a single
// canonical phrase — mirrors the previous hardcoded 3-phrase pattern
// ("hey my phone where are you" / "hey my phone" / "my phone where are
// you") but works for any device type or user-customized phrase.
export function getPhraseVariants(rawPhrase: string): string[] {
  const full = normalizeWakePhrase(rawPhrase);
  const variants = new Set<string>([full]);

  const shortMatch = full.match(/^(hey my [a-z]+)\b/);
  if (shortMatch) variants.add(shortMatch[1]);

  if (full.startsWith('hey ')) variants.add(full.slice(4));

  return Array.from(variants);
}
