import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { requestRecordingPermissionsAsync } from 'expo-audio';

import { useWakeWord } from '../../src/lib/wakeword';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import Card from '../../src/components/Card';
import PrimaryButton from '../../src/components/PrimaryButton';
import { colors } from '../../src/theme/colors';

/**
 * NOTE:
 * Modern speech recognition (Porcupine + OS STT) does not need per-user voice training.
 * This screen is a UX onboarding step to:
 * - request mic permission
 * - test the audio input
 * - help users speak clearly and confirm the wake phrase works
 */

const DEFAULT_SCRIPT =
  "My Phone, when I say my wake phrase, please help me find my device. Today I’m setting up voice detection so you can recognize my commands clearly.";

export default function VoiceSetupScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const [wakeStatus, setWakeStatus] = useState<string>('Not started');
  const script = useMemo(() => DEFAULT_SCRIPT, []);

  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
  const accessKey = extra.PICOVOICE_ACCESS_KEY as string | undefined;

  const wake = useWakeWord({
    accessKey,
    keywords: [{ builtin: 'Jarvis', sensitivity: 0.65 }],
    onDetected: () => setWakeStatus('Wake word detected'),
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { paddingTop: insets.top + 8 }]}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Voice setup</Text>
          <Text style={styles.subtitle}>Calibrate your microphone and confirm wake-word detection.</Text>
        </View>

        <Card style={{ marginTop: 16 }}>
          <View style={styles.stepRow}>
            <Ionicons name={step >= 1 ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={step >= 1 ? colors.success : colors.subtext} />
            <Text style={styles.stepTitle}>Step 1: Permissions</Text>
          </View>
          <Text style={styles.hint}>
            We’ll request microphone access so My Phone can hear your wake word and commands.
          </Text>
          <PrimaryButton
            title="Continue"
            onPress={() => setStep(2)}
            style={{ marginTop: 12 }}
          />
        </Card>

        <Card style={{ marginTop: 16 }}>
          <View style={styles.stepRow}>
            <Ionicons name={step >= 2 ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={step >= 2 ? colors.success : colors.subtext} />
            <Text style={styles.stepTitle}>Step 2: Read this aloud</Text>
          </View>
          <Text style={styles.script}>{script}</Text>
          <Text style={styles.hint}>
            Tip: Speak naturally. This doesn’t store your voice; it’s just to confirm your device can hear you clearly.
          </Text>
          <PrimaryButton
            title="I read it"
            onPress={() => setStep(3)}
            style={{ marginTop: 12 }}
            variant={step >= 2 ? 'primary' : 'secondary'}
          />
        </Card>

        <Card style={{ marginTop: 16 }}>
          <View style={styles.stepRow}>
            <Ionicons name={step >= 3 ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={step >= 3 ? colors.success : colors.subtext} />
            <Text style={styles.stepTitle}>Step 3: Test wake word</Text>
          </View>
          <Text style={styles.hint}>
            After you receive your wake-word engine key, you’ll be able to test “My Phone” detection here.
          </Text>
          <PrimaryButton
            title="Done"
            onPress={() => {
              // In next iteration: navigate back
            }}
            style={{ marginTop: 12 }}
            variant={step >= 3 ? 'primary' : 'secondary'}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
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
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  hint: {
    marginTop: 10,
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  script: {
    marginTop: 12,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: colors.card2,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
