import { Audio } from 'expo-av';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  NativeModules,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../convex/_generated/api';
import { borderRadius, colors, fontSize, spacing } from '../src/lib/theme';
import { deviceEmoji, getPhraseVariants } from '../src/lib/deviceIcons';
import type { Id } from '../convex/_generated/dataModel';

const { WakeWordModule } = NativeModules;

type RecordingState = 'idle' | 'recording' | 'processing' | 'done';

const SAMPLES_REQUIRED = 5;

export default function VoiceSetupScreen() {
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const typedDeviceId = (deviceId || '') as Id<"devices">;

  const device = useQuery(api.devices.get, typedDeviceId ? { deviceId: typedDeviceId } : 'skip');
  const enrollment = useQuery(
    api.voiceEnrollment.getDeviceEnrollment,
    typedDeviceId ? { deviceId: typedDeviceId } : 'skip',
  );
  const startEnrollment = useMutation(api.voiceEnrollment.startEnrollment);
  const recordSample = useMutation(api.voiceEnrollment.recordSample);
  const router = useRouter();

  const [recordState, setRecordState] = useState<RecordingState>('idle');
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const waveAnim = useRef(new Animated.Value(0)).current;

  const sampleCount = enrollment?.sampleCount ?? 0;
  const isComplete = enrollment?.isEnrolled ?? false;
  const wakePhrase = device?.customWakePhrase || device?.wakePhrase || '...';

  // Request microphone permission on mount. Actual capture during a sample
  // recording is handled entirely natively (WakeWordModule.recordVoiceSample
  // reuses the same Vosk pipeline the always-on service uses) -- this check
  // is just a safety net since mic permission is normally already granted
  // during device-setup.tsx's post-login flow.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        setPermissionGranted(status === 'granted');
        if (status !== 'granted') {
          Alert.alert(
            'Microphone Required',
            'My-Phone needs microphone access to train your voice. Please enable it in Settings.',
          );
        }
      } catch (e) {
        console.warn('Audio permission error:', e);
      }
    })();
  }, []);

  // Wave animation during recording
  useEffect(() => {
    if (recordState === 'recording') {
      const wave = Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(waveAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
        ])
      );
      wave.start();
      return () => wave.stop();
    }
  }, [recordState]);

  async function handleStartRecording() {
    if (!typedDeviceId) return;

    if (!permissionGranted) {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Microphone Required', 'Please enable microphone access in your device settings.');
        return;
      }
      setPermissionGranted(true);
    }

    let eid = enrollmentId;
    if (!eid) {
      try {
        eid = await startEnrollment({ deviceId: typedDeviceId });
        setEnrollmentId(eid);
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to start enrollment');
        return;
      }
    }

    if (!WakeWordModule?.recordVoiceSample) {
      Alert.alert('Not Available', 'Voice training requires the voice models to be downloaded first.');
      return;
    }

    setRecordState('recording');

    try {
      // Same phrase variants used for real-time detection, so training
      // matches exactly what the always-on service will later listen for.
      const phrases = getPhraseVariants(wakePhrase);
      const result = await WakeWordModule.recordVoiceSample(JSON.stringify(phrases));
      setRecordState('processing');

      const vector: number[] = Array.isArray(result?.vector) ? result.vector : [];
      if (vector.length === 0) {
        throw new Error('No voice sample captured');
      }

      await recordSample({ enrollmentId: eid as any, vector });

      setRecordState('done');
      setTimeout(() => setRecordState('idle'), 1000);
    } catch (e: any) {
      console.warn('Voice sample recording error:', e);
      const message = e?.code === 'TIMEOUT'
        ? `Didn't catch "${wakePhrase}" clearly. Please try again, speaking clearly right after tapping.`
        : (e?.message || 'Failed to record voice sample. Please try again.');
      Alert.alert('Try Again', message);
      setRecordState('idle');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerEmoji}>🎙️</Text>
        <Text style={styles.title}>Voice Training</Text>
        {device && (
          <View style={styles.deviceBadge}>
            <Text style={styles.deviceBadgeEmoji}>{deviceEmoji(device.type)}</Text>
            <Text style={styles.deviceBadgeText}>{device.name}</Text>
          </View>
        )}
        <Text style={styles.subtitle}>
          {isComplete
            ? `Voice print ready for ${device?.name ?? 'this device'}! It will recognize your voice.`
            : `Say the wake phrase ${SAMPLES_REQUIRED - sampleCount} more time${SAMPLES_REQUIRED - sampleCount !== 1 ? 's' : ''} to complete training.`}
        </Text>
      </View>

      {/* Wake Phrase */}
      <View style={styles.phraseCard}>
        <Text style={styles.phraseLabel}>WAKE PHRASE FOR {(device?.name ?? 'DEVICE').toUpperCase()}</Text>
        <Text style={styles.phraseText}>"{wakePhrase}"</Text>
      </View>

      {/* Progress Dots */}
      <View style={styles.progressRow}>
        {[1, 2, 3, 4, 5].map((num) => (
          <View
            key={num}
            style={[
              styles.progressDot,
              sampleCount >= num && styles.progressDotComplete,
              sampleCount === num - 1 && recordState === 'recording' && styles.progressDotActive,
            ]}
          >
            <Text
              style={[
                styles.progressDotText,
                sampleCount >= num && styles.progressDotTextComplete,
              ]}
            >
              {sampleCount >= num ? '✓' : num}
            </Text>
          </View>
        ))}
      </View>

      {/* Waveform Visualizer */}
      <View style={styles.waveContainer}>
        {Array.from({ length: 30 }).map((_, i) => {
          const height = recordState === 'recording'
            ? 10 + Math.random() * 40
            : 4;
          return (
            <Animated.View
              key={i}
              style={[
                styles.waveBar,
                {
                  height,
                  opacity: recordState === 'recording' ? 0.8 : 0.2,
                  backgroundColor: recordState === 'recording' ? colors.gold : colors.textMuted,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Record Button */}
      {!isComplete && (
        <Pressable
          style={[
            styles.recordBtn,
            recordState === 'recording' && styles.recordBtnActive,
            recordState === 'processing' && styles.recordBtnProcessing,
            recordState === 'done' && styles.recordBtnDone,
          ]}
          onPress={handleStartRecording}
          disabled={recordState !== 'idle'}
        >
          <Text style={styles.recordBtnText}>
            {recordState === 'idle'
              ? `🎙️ Tap & Say "${wakePhrase}"`
              : recordState === 'recording'
                ? '🔴 Recording...'
                : recordState === 'processing'
                  ? '⏳ Processing...'
                  : '✅ Got it!'}
          </Text>
        </Pressable>
      )}

      {/* Complete State */}
      {isComplete && (
        <View style={styles.completeCard}>
          <Text style={styles.completeEmoji}>✅</Text>
          <Text style={styles.completeTitle}>Voice Print Complete!</Text>
          <Text style={styles.completeDesc}>
            {device?.name ?? 'This device'} will now respond to your voice saying "{wakePhrase}".
          </Text>
          <Pressable style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      )}

      {/* Permission info */}
      {!permissionGranted && (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>⚠️ Microphone Access Required</Text>
          <Text style={styles.permissionDesc}>
            Voice training needs microphone access to record your wake phrase samples. Please grant permission when prompted.
          </Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg, alignItems: 'center' },

  header: { alignItems: 'center', marginBottom: spacing.xl },
  headerEmoji: { fontSize: 48, marginBottom: spacing.md },
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.gold },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 },

  deviceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bgCard, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  deviceBadgeEmoji: { fontSize: 16 },
  deviceBadgeText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },

  phraseCard: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.lg, padding: spacing.xl,
    width: '100%', alignItems: 'center', marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.goldBorder,
  },
  phraseLabel: { fontSize: 10, color: colors.textMuted, letterSpacing: 1.5, marginBottom: spacing.sm },
  phraseText: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gold },

  progressRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.xl },
  progressDot: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bgCard, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  progressDotComplete: { borderColor: colors.success, backgroundColor: colors.successDim },
  progressDotActive: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  progressDotText: { fontSize: fontSize.md, fontWeight: '700', color: colors.textMuted },
  progressDotTextComplete: { color: colors.success },

  waveContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3, height: 60, marginBottom: spacing.xl, width: '100%',
  },
  waveBar: { width: 4, borderRadius: 2 },

  recordBtn: {
    backgroundColor: colors.gold, borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg,
    width: '100%', alignItems: 'center',
  },
  recordBtnActive: { backgroundColor: colors.danger },
  recordBtnProcessing: { backgroundColor: colors.textMuted },
  recordBtnDone: { backgroundColor: colors.success },
  recordBtnText: { color: colors.bgPrimary, fontWeight: '700', fontSize: fontSize.md },

  completeCard: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.lg, padding: spacing.xxl,
    width: '100%', alignItems: 'center',
    borderWidth: 1, borderColor: colors.success,
  },
  completeEmoji: { fontSize: 48, marginBottom: spacing.md },
  completeTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.success, marginBottom: spacing.sm },
  completeDesc: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  doneBtn: {
    backgroundColor: colors.gold, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, marginTop: spacing.lg,
  },
  doneBtnText: { color: colors.bgPrimary, fontWeight: '700', fontSize: fontSize.md },

  permissionCard: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.lg, padding: spacing.lg,
    width: '100%', marginTop: spacing.lg,
    borderWidth: 1, borderColor: colors.warning,
  },
  permissionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.warning, marginBottom: spacing.sm },
  permissionDesc: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
});
