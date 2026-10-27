import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { borderRadius, colors, fonts } from '../lib/theme';
import { Icon, type IconName } from './Icon';

// Shared building blocks so every screen looks and behaves the same.

export const logo = require('../../assets/images/infinity-logo.png');

export function Logo({ width = 56 }: { width?: number }) {
  return (
    <Image
      source={logo}
      style={{ width, height: width / 2 }}
      resizeMode="contain"
      accessibilityLabel="My-Phone"
    />
  );
}

// Big screen title with the infinity logo beside it.
export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Logo />
        <Text style={styles.headerTitle} accessibilityRole="header">{title}</Text>
      </View>
      {right}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

// The one gold "do the main thing" button.
export function PrimaryButton({ label, onPress, icon, disabled, loading, style, tone = 'gold', size = 'lg' }: ButtonProps & { tone?: 'gold' | 'light' | 'danger'; size?: 'lg' | 'md' }) {
  const bg = tone === 'gold' ? colors.gold : tone === 'danger' ? colors.danger : colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: bg, height: size === 'lg' ? 64 : 52, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onGold} />
      ) : (
        <>
          {icon && <Icon name={icon} color={colors.onGold} size={size === 'lg' ? 24 : 20} strokeWidth={2.2} />}
          <Text style={[styles.primaryText, { fontSize: size === 'lg' ? 20 : 17 }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, icon, disabled, loading, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.secondary, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} />}
          <Text style={styles.secondaryText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function TextButton({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.textButton} hitSlop={8}>
      <Text style={[styles.textButtonText, muted && { color: colors.textMuted, fontFamily: fonts.semibold }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, highlight }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; highlight?: boolean }) {
  return <View style={[styles.card, highlight && styles.cardHighlight, style]}>{children}</View>;
}

export function StatusPill({ tone, label }: { tone: 'online' | 'offline' | 'alarm'; label: string }) {
  const c =
    tone === 'online'
      ? { bg: colors.successDim, fg: colors.successText, dot: colors.success }
      : tone === 'alarm'
        ? { bg: colors.dangerDim, fg: colors.dangerText, dot: colors.danger }
        : { bg: 'rgba(255,255,255,0.06)', fg: colors.textMuted, dot: colors.textMuted };
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <View style={[styles.pillDot, { backgroundColor: c.dot }]} />
      <Text style={[styles.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

// Row in a settings-style list: icon, title, optional detail, chevron.
export function ListRow({ icon, title, detail, onPress, danger }: { icon: IconName; title: string; detail?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgCardHover }]}
    >
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerDim }]}>
        <Icon name={icon} size={20} color={danger ? colors.dangerText : colors.gold} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowTitle, danger && { color: colors.dangerText }]}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {!danger && <Icon name="chevron-right" size={20} color={colors.textMuted} />}
    </Pressable>
  );
}

export function Body({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]} accessibilityRole="header">{children}</Text>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// "Step 2 of 4" + bar, for one-question-per-screen setup flows.
export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.stepText}>Step {step} of {total}</Text>
        <Logo width={48} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${step} of ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.stepSeg, { backgroundColor: i < step ? colors.gold : colors.track }]} />
        ))}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontFamily: fonts.extrabold, fontSize: 30, color: colors.textPrimary, letterSpacing: -0.5 },

  primary: { borderRadius: borderRadius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  primaryText: { fontFamily: fonts.extrabold, color: colors.onGold },
  secondary: { height: 52, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.borderLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  secondaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.textPrimary },
  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  textButtonText: { fontFamily: fonts.bold, fontSize: 16, color: colors.gold },

  card: { backgroundColor: colors.bgCard, borderRadius: borderRadius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 20 },
  cardHighlight: { borderWidth: 2, borderColor: colors.gold },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12 },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontFamily: fonts.bold, fontSize: 13 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: 64 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.goldDim, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.textPrimary },
  rowDetail: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },

  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, color: colors.textSecondary },
  title: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 38, color: colors.textPrimary, letterSpacing: -0.5 },
  sectionLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 20, marginLeft: 4 },

  stepText: { fontFamily: fonts.bold, fontSize: 14, color: colors.textMuted },
  stepSeg: { flex: 1, height: 6, borderRadius: 3 },
});
