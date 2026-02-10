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

  // Register device + fetch default locator settings
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

  // Hydrate recent chat history for context
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

  // Visual reacts to listening toggle + chat state
  useEffect(() => {
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
        setVisualMode(listeningEnabled ? 'listening' : 'idle');
      }, 650);
    } catch (e: any) {
      setError(e?.message ?? 'Chat failed');
      setVisualMode(listeningEnabled ? 'listening' : 'idle');
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { paddingTop: insets.top + 8 }]}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>My Phone</Text>
            <Text style={styles.subtitle}>Say your phrase. Find your phone. Ask anything.</Text>
          </View>

          <View style={styles.visualWrap}>
            <InfinityListeningVisual mode={visualMode} size={280} />
            <Text style={styles.visualHint}>
              {visualMode === 'thinking'
                ? 'Listening…'
                : listeningEnabled
                  ? 'Always listening is enabled'
                  : 'Listening is paused'}
            </Text>
          </View>

          <Card style={{ marginTop: 16 }}>
            <ToggleRow
              label="Always listening"
              value={listeningEnabled}
              onToggle={toggleAlwaysListening}
              disabled={booting || !deviceId}
              description="Turn off to save battery."
            />

            <View style={styles.rowBtns}>
              <PrimaryButton
                title="Test locator alert"
                onPress={() => {
                  // sends user to Locator tab for now
                  setError(null);
                }}
                disabled={booting}
                style={{ flex: 1 }}
              />
              <View style={{ width: 12 }} />
              <PrimaryButton
                title={booting ? '…' : 'Refresh'}
                onPress={() => {
                  setError(null);
                  setRefreshKey((k) => k + 1);
                }}
                loading={booting}
                variant="secondary"
                style={{ width: 120 }}
              />
            </View>

            {!!error && <Text style={[styles.error, { marginTop: 10 }]}>{error}</Text>}
          </Card>

          <Card style={{ marginTop: 16 }}>
            <Text style={styles.cardTitle}>Chat</Text>
            <Text style={styles.cardHint}>Keep context here. You’ll also see responses in this thread.</Text>

            <View style={{ marginTop: 12 }}>
              {chatMessages.slice(-6).map((m, idx) => (
                <View
                  key={`${idx}-${m.role}`}
                  style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}
                >
                  <Text style={styles.bubbleText}>{m.content}</Text>
                </View>
              ))}
            </View>

            <View style={{ marginTop: 12 }}>
              <TextInput
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="Message My Phone…"
                placeholderTextColor={colors.subtext}
                style={styles.chatInput}
                multiline
                maxLength={1200}
              />
              <PrimaryButton
                title={chatLoading ? 'Sending…' : 'Send'}
                onPress={sendChat}
                disabled={!canSend}
                loading={chatLoading}
                style={{ marginTop: 10 }}
              />
            </View>
          </Card>

          <Card style={{ marginTop: 16 }}>
            <Text style={styles.cardTitle}>Device</Text>
            <Text style={styles.cardText}>Device ID: {deviceId ? deviceId.slice(0, 8) + '…' : '—'}</Text>
            <Text style={styles.cardText}>Wake: “{settings?.wake_phrase ?? 'my phone where are you'}”</Text>
            <Text style={styles.cardText}>Stop: “{settings?.stop_phrase ?? "i've found you"}”</Text>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  visualWrap: {
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualHint: {
    marginTop: 10,
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '700',
  },
  rowBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  bubble: {
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(46,209,255,0.18)',
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card2,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  chatInput: {
    minHeight: 48,
    maxHeight: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
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
