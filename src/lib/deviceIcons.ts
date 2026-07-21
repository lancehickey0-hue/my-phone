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
  // Only the full, distinctive phrase is used as a valid match -- short
  // variants ("hey my tablet", "tablet where are you") were removed because
  // Vosk's grammar-constrained recognizer forces ambiguous audio (TV/video
  // dialogue, background speech) into the closest available option in its
  // vocabulary, and short generic phrases are far more likely to
  // phonetically resemble random speech than the full phrase is. This is a
  // stopgap harm-reduction fix -- real speaker verification (matching the
  // enrolled user's actual voice, not just the words) is a separate,
  // larger project.
  return [full];
}
