import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import Card from '../../src/components/Card';
import PrimaryButton from '../../src/components/PrimaryButton';
import { colors } from '../../src/theme/colors';
import { listVoices, speak, stopSpeaking } from '../../src/lib/tts';
import { useAssistantStore } from '../../src/stores/assistantStore';

export default function VoiceSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { voice, setVoice } = useAssistantStore();

  const [voices, setVoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const v = await listVoices();
      if (!mounted) return;
      // prefer English voices, but show all
      setVoices(v);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const recommended = useMemo(() => {
    const en = voices.filter((v) => String(v.language || '').toLowerCase().startsWith('en'));
    return (en.length ? en : voices).slice(0, 8);
  }, [voices]);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Assistant voice</Text>
        <Text style={styles.subtitle}>Choose a natural system voice.</Text>
      </View>

      <Card style={{ marginTop: 16 }}>
        <Text style={styles.cardTitle}>Current</Text>
        <Text style={styles.cardHint}>{voice ? voice.label : 'Default'}</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <PrimaryButton
            title="Preview"
            onPress={() => speak('Hello. I am My Phone.', voice)}
            style={{ flex: 1 }}
          />
          <PrimaryButton title="Stop" onPress={stopSpeaking} variant="secondary" style={{ width: 110 }} />
        </View>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Text style={styles.cardTitle}>Recommended</Text>
        <Text style={styles.cardHint}>
          Voices come from your device and may vary by platform.
        </Text>

        {loading ? (
          <Text style={[styles.cardHint, { marginTop: 12 }]}>Loading voices…</Text>
        ) : recommended.length === 0 ? (
          <Text style={[styles.cardHint, { marginTop: 12 }]}>No voices available.</Text>
        ) : (
          <View style={{ marginTop: 10 }}>
            {recommended.map((v) => {
              const id = String(v.identifier ?? v.id ?? '');
              const label = String(v.name ?? v.identifier ?? 'Voice');
              const isSelected = voice?.id === id;
              return (
                <View key={id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{label}</Text>
                    <Text style={styles.rowSub}>{String(v.language ?? '')}</Text>
                  </View>
                  <PrimaryButton
                    title={isSelected ? 'Selected' : 'Use'}
                    onPress={() => setVoice({ id, label, rate: 0.95, pitch: 1.0 })}
                    disabled={isSelected}
                    variant={isSelected ? 'secondary' : 'primary'}
                    style={{ width: 120 }}
                  />
                </View>
              );
            })}
          </View>
        )}

        <View style={{ marginTop: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="information-circle" size={18} color={colors.subtext} />
          <Text style={[styles.cardHint, { marginTop: 0, flex: 1 }]}>Next: add named presets + more human-like neural voices.</Text>
        </View>
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
    marginTop: 8,
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    minHeight: 56,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  rowSub: {
    marginTop: 4,
    color: colors.subtext,
    fontSize: 12,
  },
});
