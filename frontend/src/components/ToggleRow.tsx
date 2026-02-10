import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

type Props = {
  label: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
  description?: string;
};

export default function ToggleRow({ label, value, onToggle, disabled, description }: Props) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        { opacity: disabled ? 0.5 : pressed ? 0.92 : 1 },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.desc}>{description}</Text> : null}
      </View>

      <View style={[styles.pill, value ? styles.pillOn : styles.pillOff]}>
        <Ionicons
          name={value ? 'radio-button-on' : 'radio-button-off'}
          size={20}
          color={value ? '#000' : colors.subtext}
        />
        <Text style={[styles.pillText, { color: value ? '#000' : colors.subtext }]}>
          {value ? 'On' : 'Off'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  desc: {
    marginTop: 4,
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  pill: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillOn: {
    backgroundColor: colors.primary,
  },
  pillOff: {
    backgroundColor: colors.card2,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '900',
  },
});
