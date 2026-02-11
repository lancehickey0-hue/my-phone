import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../../src/components/Card';
import InfinityMark from '../../src/components/InfinityMark';
import { colors } from '../../src/theme/colors';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Branding and app-level preferences.</Text>
      </View>

      <Card style={{ marginTop: 16 }}>
        <Text style={styles.cardTitle}>Brand</Text>
        <View style={styles.brandRow}>
          <InfinityMark size={56} />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.brandName}>My Phone</Text>
            <Text style={styles.brandHint}>Infinity mark is used as the app identity.</Text>
          </View>
        </View>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Text style={styles.cardTitle}>Assistant voice</Text>
        <Text style={styles.cardHint}>Pick a natural system voice.</Text>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Text style={styles.cardTitle}>Background Listening</Text>
        <Text style={styles.cardHint}>
          Android-first. True always-on hotword needs a custom dev build and a foreground service.
        </Text>
        <Text style={styles.cardHint}>
          iOS background speech recognition is restricted; we’ll support best-effort behavior.
        </Text>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Text style={styles.cardTitle}>Privacy</Text>
        <Text style={styles.cardHint}>
          Locator uses on-device speech recognition APIs when available. No raw audio is sent to the backend.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: 8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 6,
    color: colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  cardHint: {
    marginTop: 10,
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  brandName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  brandHint: {
    marginTop: 4,
    color: colors.subtext,
    fontSize: 13,
  },
});
