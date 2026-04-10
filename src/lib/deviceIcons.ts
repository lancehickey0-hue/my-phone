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
