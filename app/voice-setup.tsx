import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../convex/_generated/api';
import { borderRadius, colors, fontSize, spacing } from '../src/lib/theme';
import { deviceEmoji } from '../src/lib/deviceIcons';
import type { Id } from '../convex/_generated/dataModel';

type RecordingState = 'idle' | 'recording' | 'processing' | 'done';

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
  const waveAnim = useRef(new Animated.Value(0)).current;

  const sampleCount = enrollment?.sampleCount ?? 0;
  const isComplete = enrollment?.isEnrolled ?? false;
  const wakePhrase = device?.customWakePhrase || device?.wakePhrase || '...';

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

    let eid = enrollmentId;
    if (!eid) {
      eid = await startEnrollment({ deviceId: typedDeviceId });
      setEnrollmentId(eid);
    }

    setRecordState('recording');

    // Simulate 4-second recording
    // In native build: uses actual microphone + audio processing
    setTimeout(async () => {
      setRecordState('processing');
      try {
        await recordSample({ enrollmentId: eid as any });
        setRecordState('done');
        setTimeout(() => setRecordState('idle'), 1000);
      } catch (e) {
        setRecordState('idle');
      }
    }, 4000);
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
            : `Say the wake phrase ${3 - sampleCount} more time${3 - sampleCount !== 1 ? 's' : ''} to complete training.`}
        </Text>
      </View>

      {/* Wake Phrase */}
      <View style={styles.phraseCard}>
        <Text style={styles.phraseLabel}>WAKE PHRASE FOR {(device?.name ?? 'DEVICE').toUpperCase()}</Text>
        <Text style={styles.phraseText}>"{wakePhrase}"</Text>
      </View>

      {/* Progress Dots */}
      <View style={styles.progressRow}>
        {[1, 2, 3].map((num) => (
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

      {/* Status Text */}
      <Text style={styles.statusText}>
        {recordState === 'idle' && !isComplete && 'Press the microphone to start recording'}
        {recordState === 'recording' && 'Recording... Speak naturally'}
        {recordState === 'processing' && 'Processing voice sample...'}
        {recordState === 'done' && `Sample ${sampleCount} recorded!`}
        {isComplete && 'Voice training complete! ✅'}
      </Text>

      {/* Record Button */}
      {!isComplete && (
        <Pressable
          style={[
            styles.recordBtn,
            recordState === 'recording' && styles.recordBtnActive,
            recordState === 'processing' && styles.recordBtnProcessing,
          ]}
          onPress={handleStartRecording}
          disabled={recordState !== 'idle'}
        >
          <Text style={styles.recordEmoji}>
            {recordState === 'recording' ? '🔴' : recordState === 'processing' ? '⏳' : '🎙️'}
          </Text>
        </Pressable>
      )}

      {/* Complete Actions */}
      {isComplete && (
        <View style={styles.completeActions}>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push('/biometric-setup')}
          >
            <Text style={styles.primaryBtnText}>Set Up Biometric Security →</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryBtnText}>← Back to Locator</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => {
              setEnrollmentId(null);
              if (typedDeviceId) startEnrollment({ deviceId: typedDeviceId });
            }}
          >
            <Text style={styles.secondaryBtnText}>🔄 Retrain Voice</Text>
          </Pressable>
        </View>
      )}

      {/* Tips */}
      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>💡 Tips for best results</Text>
        <Text style={styles.tip}>• Speak at your normal volume and pace</Text>
        <Text style={styles.tip}>• Record in a quiet environment</Text>
        <Text style={styles.tip}>• Say the full phrase naturally each time</Text>
        <Text style={styles.tip}>• Each recording is about 4 seconds</Text>
        <Text style={styles.tip}>• Each device has its own wake phrase</Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg, alignItems: 'center' },

  header: { alignItems: 'center', marginBottom: spacing.xxl },
  headerEmoji: { fontSize: 48, marginBottom: spacing.md },
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.gold },
  deviceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.goldDim, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderWidth: 1, borderColor: colors.goldBorder, marginTop: spacing.sm,
  },
  deviceBadgeEmoji: { fontSize: 16 },
  deviceBadgeText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gold },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },

  phraseCard: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.lg, padding: spacing.xl,
    width: '100%', alignItems: 'center',
    borderWidth: 1, borderColor: colors.goldBorder, marginBottom: spacing.xxl,
  },
  phraseLabel: { fontSize: 10, color: colors.textMuted, letterSpacing: 1.5, marginBottom: spacing.sm },
  phraseText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gold, textAlign: 'center' },

  progressRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.xxl },
  progressDot: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bgCard, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  progressDotComplete: { backgroundColor: colors.goldDim, borderColor: colors.gold },
  progressDotActive: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  progressDotText: { fontSize: fontSize.md, fontWeight: '700', color: colors.textMuted },
  progressDotTextComplete: { color: colors.gold },

  waveContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 60, width: '100%',
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, gap: 3, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  waveBar: { width: 3, borderRadius: 2, minHeight: 4 },

  statusText: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xxl },

  recordBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.bgCard, borderWidth: 3, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xxl,
  },
  recordBtnActive: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  recordBtnProcessing: { borderColor: colors.textMuted, opacity: 0.5 },
  recordEmoji: { fontSize: 32 },

  completeActions: { width: '100%', gap: spacing.md, marginBottom: spacing.xxl },
  primaryBtn: {
    backgroundColor: colors.gold, borderRadius: borderRadius.md, padding: spacing.lg, alignItems: 'center',
  },
  primaryBtnText: { color: colors.bgPrimary, fontWeight: '700', fontSize: fontSize.md },
  secondaryBtn: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.md, padding: spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.textSecondary, fontWeight: '600', fontSize: fontSize.sm },

  tipsCard: {
    backgroundColor: colors.bgCard, borderRadius: borderRadius.lg, padding: spacing.lg,
    width: '100%', borderWidth: 1, borderColor: colors.border,
  },
  tipsTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.gold, marginBottom: spacing.md },
  tip: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 22 },
});
