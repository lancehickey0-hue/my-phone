import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';

import Card from '../../src/components/Card';
import PrimaryButton from '../../src/components/PrimaryButton';
import { colors } from '../../src/theme/colors';
import { api, apiPath } from '../../src/lib/api';
import { useDeviceStore } from '../../src/stores/deviceStore';

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
};

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { deviceId } = useDeviceStore();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  const canSend = useMemo(() => !!deviceId && input.trim().length > 0 && !loading, [deviceId, input, loading]);

  useEffect(() => {
    if (!deviceId) return;
    let mounted = true;
    (async () => {
      try {
        const res = await api.get(apiPath(`/chat/history/${deviceId}`));
        if (!mounted) return;
        setMessages(res.data.messages ?? []);
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load history');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [deviceId]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, [messages.length]);

  async function send() {
    if (!deviceId) return;
    const text = input.trim();
    if (!text) return;

    setInput('');
    Keyboard.dismiss();
    setError(null);

    const optimistic: Msg = { role: 'user', content: text };
    setMessages((prev) => [...prev, optimistic]);

    try {
      setLoading(true);
      const res = await api.post(apiPath('/chat'), {
        device_id: deviceId,
        message: text,
      });
      const reply: Msg = { role: 'assistant', content: res.data.reply };
      setMessages((prev) => [...prev, reply]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send');
    } finally {
      setLoading(false);
    }
  }

  const dismissKeyboard = () => Keyboard.dismiss();

  return (
    <Pressable style={{ flex: 1 }} onPress={dismissKeyboard}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Chat</Text>
          <Text style={styles.subtitle}>Ask anything. Your assistant responds instantly.</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <Card style={{ marginTop: 16 }}>
              <Text style={styles.emptyTitle}>Start a conversation</Text>
              <Text style={styles.emptyHint}>
                Example: “Help me create a morning routine” or “What’s the weather today?”
              </Text>
            </Card>
          ) : (
            <View style={{ marginTop: 12 }}>
              {messages.map((m, idx) => {
                const isUser = m.role === 'user';
                return (
                  <View
                    key={`${idx}-${m.role}`}
                    style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}
                  >
                    <Text style={styles.bubbleText}>{m.content}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {!!error && (
            <Text style={[styles.error, { marginTop: 12 }]}>{error}</Text>
          )}
        </ScrollView>

        <View style={[styles.composer, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Message My Phone…"
              placeholderTextColor={colors.subtext}
              style={styles.input}
              multiline
              maxLength={1200}
            />
            <PrimaryButton
              title={loading ? '…' : ''}
              onPress={send}
              disabled={!canSend}
              style={styles.sendBtn}
              loading={loading}
            />
            <View style={styles.sendIcon} pointerEvents="none">
              <Ionicons name="send" size={18} color="#000" />
            </View>
          </View>
          <Text style={styles.disclaimer}>MVP: answers are generated on-device + server.</Text>
        </View>
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
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyHint: {
    marginTop: 8,
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  bubble: {
    maxWidth: '88%',
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
    backgroundColor: colors.card,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
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
  sendBtn: {
    width: 52,
    height: 48,
    marginLeft: 10,
    borderRadius: 16,
    paddingHorizontal: 0,
  },
  sendIcon: {
    position: 'absolute',
    right: 16,
    bottom: 14,
  },
  disclaimer: {
    marginTop: 6,
    color: colors.subtext,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
});
