/**
 * PIN entry keypad — shared by the onboarding/settings PIN screen
 * (app/pin-setup.tsx) and the lockout screen (app/lockout.tsx).
 *
 * Deliberately self-contained: no OS keyboard, no text input. The lockout
 * screen runs over a locked device where a soft keyboard would be both
 * awkward and a way to reach autocorrect/clipboard UI.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '../../convex/pinPolicy';
import { colors, fontSize, spacing } from '../lib/theme';

interface PinKeypadProps {
  value: string;
  onChange: (next: string) => void;
  /** Called when the user presses the confirm key with a long-enough PIN. */
  onSubmit: () => void;
  disabled?: boolean;
  /** Overrides the confirm key glyph (defaults to a checkmark). */
  submitLabel?: string;
  maxLength?: number;
  minLength?: number;
}

export function PinKeypad({
  value,
  onChange,
  onSubmit,
  disabled = false,
  submitLabel = '✓',
  maxLength = PIN_MAX_LENGTH,
  minLength = PIN_MIN_LENGTH,
}: PinKeypadProps) {
  const canSubmit = !disabled && value.length >= minLength;

  const press = (digit: string) => {
    if (disabled || value.length >= maxLength) return;
    onChange(value + digit);
  };

  const backspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  // One dot per entered digit, with empty slots padding out to the minimum
  // length so the user can see how much further they have to go.
  const slots = Math.max(minLength, value.length);

  return (
    <View style={styles.wrap}>
      <View style={styles.dots}>
        {Array.from({ length: slots }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i < value.length ? styles.dotFilled : styles.dotEmpty]}
          />
        ))}
      </View>

      <View style={styles.grid}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <Key key={digit} label={digit} onPress={() => press(digit)} disabled={disabled} />
        ))}

        <Key label="⌫" onPress={backspace} disabled={disabled || value.length === 0} muted />
        <Key label="0" onPress={() => press('0')} disabled={disabled} />
        <Key label={submitLabel} onPress={onSubmit} disabled={!canSubmit} accent />
      </View>
    </View>
  );
}

function Key({
  label,
  onPress,
  disabled,
  accent,
  muted,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.key,
        accent && styles.keyAccent,
        muted && styles.keyMuted,
        pressed && !disabled && styles.keyPressed,
        disabled && styles.keyDisabled,
      ]}
    >
      <Text
        style={[
          styles.keyText,
          accent && styles.keyTextAccent,
          muted && styles.keyTextMuted,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const KEY_SIZE = 68;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: '100%' },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 24,
    marginBottom: spacing.xl,
    flexWrap: 'wrap',
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  dotFilled: { backgroundColor: colors.gold },
  dotEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.borderLight,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: KEY_SIZE * 3 + spacing.lg * 2,
    gap: spacing.lg,
  },

  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyAccent: { backgroundColor: colors.gold, borderColor: colors.gold },
  keyMuted: { backgroundColor: 'transparent', borderColor: 'transparent' },
  keyPressed: { opacity: 0.6 },
  keyDisabled: { opacity: 0.3 },

  keyText: { fontSize: fontSize.xxl, fontWeight: '600', color: colors.textPrimary },
  keyTextAccent: { color: colors.bgPrimary, fontWeight: '800' },
  keyTextMuted: { color: colors.textSecondary, fontSize: fontSize.xl },
});
