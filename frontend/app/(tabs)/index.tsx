import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Card from '../../src/components/Card';
import PrimaryButton from '../../src/components/PrimaryButton';
import { colors } from '../../src/theme/colors';
import { api, apiPath } from '../../src/lib/api';
import { getOrCreateDeviceId } from '../../src/lib/device';
import { useDeviceStore } from '../../src/stores/deviceStore';
import { useLocatorStore } from '../../src/stores/locatorStore';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { deviceId, setDeviceId } = useDeviceStore();
  const { settings, setSettings } = useLocatorStore();

  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const platform = useMemo(() => Platform.OS, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setBooting(true);
        const id = await getOrCreateDeviceId();
        if (!mounted) return;
        setDeviceId(id);

        const res = await api.post(apiPath('/devices/register'), {
          device_id: id,
          platform,
        });
        if (!mounted) return;
        setSettings(res.data.settings);
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to register device');
      } finally {
        if (mounted) setBooting(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [platform, refreshKey, setDeviceId, setSettings]);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.header}>
        <Text style={styles.title}>My Phone</Text>
        <Text style={styles.subtitle}>Voice locator + smart assistant</Text>
      </View>

      <Card style={{ marginTop: 16 }}>
        <Text style={styles.cardTitle}>Device</Text>
        <Text style={styles.cardText}>Device ID: {deviceId ? deviceId.slice(0, 8) + '…' : '—'}</Text>
        <Text style={styles.cardText}>Locator: {settings?.enabled ? 'Enabled' : 'Disabled'}</Text>
        <Text style={styles.cardHint}>
          Tip: Try saying “{settings?.wake_phrase ?? 'my phone where are you'}” while this app is open.
        </Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <PrimaryButton
          title={booting ? 'Initializing…' : 'Refresh'}
          onPress={() => {
            // Trigger the effect by re-running registration quickly
            // simplest: reload app state
            setError(null);
            setBooting(true);
            setTimeout(() => setBooting(false), 250);
          }}
          loading={booting}
          style={{ marginTop: 12 }}
        />
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Text style={styles.cardTitle}>Permissions</Text>
        <Text style={styles.cardText}>Microphone: required for voice commands</Text>
        <Text style={styles.cardText}>Camera (torch): required for flashlight alert</Text>
        <Text style={styles.cardHint}>
          You can grant permissions inside the Locator tab.
        </Text>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Text style={styles.cardTitle}>Limitations (MVP)</Text>
        <Text style={styles.cardHint}>
          Always-listening in background is Android-first and may need a custom dev build. iOS background hotword
          has platform restrictions.
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
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 6,
    color: colors.subtext,
    fontSize: 15,
    lineHeight: 20,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  cardText: {
    marginTop: 8,
    color: colors.text,
    fontSize: 14,
  },
  cardHint: {
    marginTop: 10,
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    marginTop: 10,
    color: colors.danger,
    fontSize: 13,
  },
});
