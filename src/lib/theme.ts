// My-Phone Design System — Gold & Black
export const colors = {
  gold: '#D4A843',
  goldDim: 'rgba(212, 168, 67, 0.15)',
  goldBorder: 'rgba(212, 168, 67, 0.25)',
  goldText: '#D4A843',

  bgPrimary: '#06060A',
  bgCard: '#0D0D12',
  bgCardHover: '#13131A',
  bgElevated: '#1A1A24',

  textPrimary: '#FAFAFA',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',

  success: '#22C55E',
  successDim: 'rgba(34, 197, 94, 0.15)',
  danger: '#EF4444',
  dangerDim: 'rgba(239, 68, 68, 0.15)',
  warning: '#EAB308',
  warningDim: 'rgba(234, 179, 8, 0.15)',
  info: '#3B82F6',
  infoDim: 'rgba(59, 130, 246, 0.15)',

  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.12)',
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
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  title: 28,
  hero: 34,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;
