import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Card from '../../src/components/Card';
import PrimaryButton from '../../src/components/PrimaryButton';
import ToggleRow from '../../src/components/ToggleRow';
import InfinityListeningVisual, { InfinityVisualMode } from '../../src/components/InfinityListeningVisual';
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

  // Home interactions
  const [visualMode, setVisualMode] = useState<InfinityVisualMode>('idle');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const platform = useMemo(() => Platform.OS, []);

  // Always-listening toggle (maps to backend locator settings)
  const listeningEnabled = settings?.enabled ?? true;

  const canSend = useMemo(() => chatInput.trim().length > 0 && !chatLoading && !!deviceId, [chatInput, chatLoading, deviceId]);

  useEffect(() => {
    let mounted = true;

  useEffect(() => {
    if (!deviceId) return;
    let mounted = true;
    (async () => {
      try {
        const res = await api.get(apiPath(`/chat/history/${deviceId}`));
        if (!mounted) return;
        const msgs = (res.data?.messages ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>;
        setChatMessages(msgs.map((m) => ({ role: m.role, content: m.content })));
      } catch {
        // ignore hydration errors on home
      }
    })();

    return () => {
      mounted = false;
    };
  }, [deviceId]);

  useEffect(() => {
    // Visual reacts to listening toggle + chat state
    if (chatLoading) {
      setVisualMode('thinking');
    } else if (listeningEnabled) {
      setVisualMode('listening');
    } else {
      setVisualMode('idle');
    }
  }, [chatLoading, listeningEnabled]);

  async function toggleAlwaysListening() {
    if (!deviceId) return;
    const next = !listeningEnabled;
    // Optimistic update
    setSettings({
      enabled: next,
      wake_phrase: settings?.wake_phrase ?? 'my phone where are you',
      stop_phrase: settings?.stop_phrase ?? "i've found you",
    });

    try {
      await api.put(apiPath(`/locator/settings/${deviceId}`), { enabled: next });
      setError(null);
    } catch (e: any) {
      // Revert
      setSettings({
        enabled: listeningEnabled,
        wake_phrase: settings?.wake_phrase ?? 'my phone where are you',
        stop_phrase: settings?.stop_phrase ?? "i've found you",
      });
      setError(e?.message ?? 'Failed to update listening');
    }
  }

  async function sendChat() {
    if (!deviceId) return;
    const text = chatInput.trim();
    if (!text) return;

    setChatInput('');
    Keyboard.dismiss();
    setError(null);

    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      setChatLoading(true);
      setVisualMode('thinking');
      const res = await api.post(apiPath('/chat'), {
        device_id: deviceId,
        message: text,
      });
      const reply = String(res.data?.reply ?? '').trim();
      if (reply) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      }
      setVisualMode('solid');
      setTimeout(() => {
        // return to listening/idle
        setVisualMode(listeningEnabled ? 'listening' : 'idle');
      }, 650);
    } catch (e: any) {
      setError(e?.message ?? 'Chat failed');
      setVisualMode(listeningEnabled ? 'listening' : 'idle');
    } finally {
      setChatLoading(false);
    }
  }

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
            setError(null);
            setRefreshKey((k) => k + 1);
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
