// My-Phone design system — black & gold, refreshed.
//
// Rules of thumb (keep the app easy for anyone):
//   • One gold primary button per screen — the thing you most likely want.
//   • Red only while an alarm is sounding / a phone is locked.
//   • Plain words, big text (body 17), touch targets ≥ 48px.
//   • Line icons (src/components/Icon.tsx), never emoji.
export const colors = {
  // Brand
  gold: '#E2B24A',
  goldBright: '#F0C766',
  goldDim: 'rgba(226, 178, 74, 0.16)',
  goldBorder: 'rgba(226, 178, 74, 0.35)',
  goldText: '#E2B24A',
  onGold: '#0A0A0E',

  // Surfaces
  bgPrimary: '#0A0A0E',
  bgCard: '#15151C',
  bgCardHover: '#1C1C25',
  bgElevated: '#1E1E27',
  bgTabBar: '#0F0F14',
  track: '#2A2A33',

  // Text (all pass 4.5:1 on bgCard)
  textPrimary: '#F5F5F2',
  textSecondary: '#C2C2CA',
  textMuted: '#A3A3AD',

  // Status
  success: '#43D17A',
  successText: '#6FE29A',
  successDim: 'rgba(67, 209, 122, 0.14)',
  danger: '#FF5A4E',
  dangerText: '#FF7A6F',
  dangerDim: 'rgba(255, 90, 78, 0.14)',
  warning: '#EAB308',
  warningDim: 'rgba(234, 179, 8, 0.15)',
  info: '#3B82F6',
  infoDim: 'rgba(59, 130, 246, 0.15)',

  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.14)',
} as const;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  title: 30,
  hero: 34,
} as const;

export const borderRadius = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
} as const;
