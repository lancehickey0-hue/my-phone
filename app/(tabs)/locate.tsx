import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  NativeEventEmitter,
  NativeModules,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../../convex/_generated/api';
import { borderRadius, colors, fontSize, spacing } from '../../src/lib/theme';
import { deviceEmoji } from '../../src/lib/deviceIcons';
import { getAlarmManager } from '../../src/native/AlarmManager';
import type { Id } from '../../convex/_generated/dataModel';

const { WakeWordModule } = NativeModules;

type ListenState = 'idle' | 'listening' | 'detected' | 'activated';

export default function LocateTab() {
  const devices = useQuery(api.devices.list) ?? [];
  const enrollments = useQuery(api.voiceEnrollment.listEnrollments) ?? [];
  const triggerAlarm = useMutation(api.devices.triggerAlarm);
  const stopAlarm = useMutation(api.devices.stopAlarm);
  const router = useRouter();

  const [selectedDeviceId, setSelectedDeviceId] = useState<Id<'devices'> | null>(null);
  const [listenState, setListenState] = useState<ListenState>('idle');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const infinityFadeAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const isListeningRef = useRef(false);

  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0) {
      setSelectedDeviceId(devices[0]._id);
    }
  }, [devices, selectedDeviceId]);

  const selectedDevice = devices.find((d) => d._id === selectedDeviceId);
  const selectedEnrollment = enrollments.find((e) => e.deviceId === selectedDeviceId);
  const isEnrolled = selectedEnrollment?.isEnrolled ?? false;
  const activeWakePhrase = selectedDevice?.customWakePhrase || selectedDevice?.wakePhrase || '';
  const enrollmentByDevice = new Map(enrollments.map((e) => [e.deviceId, e]));
  const enrolledCount = enrollments.filter((e) => e.isEnrolled).length;

  // ── Listen for native wake word detection (THIS device heard its phrase) ──
  // When detected: alarm the selected target device remotely
  useEffect(() => {
    if (!WakeWordModule) return;

    const emitter = new NativeEventEmitter(WakeWordModule);
    const sub = emitter.addListener('WakeWordDetected', async () => {
      if (!isListeningRef.current || !selectedDeviceId) return;

      isListeningRef.current = false;
      setListenState('detected');

      try {
        await triggerAlarm({ deviceId: selectedDeviceId });
      } catch (e) {
        console.warn('triggerAlarm failed:', e);
      }

      getAlarmManager().triggerAlarm(selectedDeviceId, 'voice');
      setListenState('activated');

      setTimeout(() => {
        router.push({
          pathname: '/lockout',
          params: {
            deviceId: selectedDeviceId,
            deviceName: selectedDevice?.name ?? 'This Device',
            deviceType: selectedDevice?.type ?? 'phone',
          },
        });
      }, 300);
    });

    return () => sub.remove();
  }, [selectedDeviceId, selectedDevice]);

  // ── Pulse animation while listening ────────────────────────────────────────
  useEffect(() => {
    if (listenState === 'listening') {
      const fade = Animated.loop(
        Animated.sequence([
          Animated.timing(infinityFadeAnim, { toValue: 0.3, duration: 750, useNativeDriver: true }),
          Animated.timing(infinityFadeAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
        ])
      );
      const ring = Animated.loop(
        Animated.sequence([
          Animated.timing(ringAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(ringAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ])
      );
      fade.start();
      ring.start();
      return () => { fade.stop(); ring.stop(); };
    } else {
      infinityFadeAnim.setValue(1);
      ringAnim.setValue(0);
    }
  }, [listenState]);

  useEffect(() => {
    if (listenState === 'activated') {
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        ])
      );
      glow.start();
      return () => glow.stop();
    }
  }, [listenState]);

  // ── Button: hold to listen for wake phrase, or remote alarm ───────────────
  function handleInfinityPress() {
    if (!selectedDeviceId) return;

    if (listenState === 'idle') {
      if (isEnrolled) {
        // Voice mode: listen for wake phrase
        setListenState('listening');
        isListeningRef.current = true;
      } else {
        // No voice training — offer remote alarm instead
        Alert.alert(
          'Voice Not Trained',
          `Train the wake phrase for ${selectedDevice?.name ?? 'this device'} to use voice detection, or trigger a remote alarm now.`,
          [
            { text: 'Train Voice', onPress: () => router.push({ pathname: '/voice-setup', params: { deviceId: selectedDeviceId } }) },
            { text: 'Remote Alarm', style: 'destructive', onPress: () => handleRemoteAlarm() },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
    } else if (listenState === 'listening') {
      isListeningRef.current = false;
      setListenState('idle');
    }
  }

  async function handleRemoteAlarm() {
    if (!selectedDeviceId) return;
    try {
      await triggerAlarm({ deviceId: selectedDeviceId });
      setListenState('activated');
      setTimeout(() => {
        router.push({
          pathname: '/lockout',
          params: {
            deviceId: selectedDeviceId,
            deviceName: selectedDevice?.name ?? 'This Device',
            deviceType: selectedDevice?.type ?? 'phone',
          },
        });
      }, 300);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not trigger alarm.');
    }
  }

  async function handleStopAlarm() {
    if (!selectedDeviceId) return;
    try {
      await stopAlarm({ deviceId: selectedDeviceId });
      getAlarmManager().deactivateAlarm(selectedDeviceId, 'remote_unlock');
      setListenState('idle');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not stop alarm.');
    }
  }

  const isAlarming = selectedDevice?.isAlarmActive ?? false;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.statusHeader}>
        <Text style={styles.pageTitle}>Voice Locator</Text>
        <Text style={styles.pageSubtitle}>
          {isAlarming
            ? `${selectedDevice?.name ?? 'Device'} is alarming`
            : 'Select a device, then press the button and say its wake phrase'}
        </Text>
      </View>

      {/* Device chips */}
      {devices.length > 0 && (
        <View style={styles.deviceChipsWrap}>
          {devices.map((device) => {
            const isSelected = device._id === selectedDeviceId;
            const enrolled = enrollmentByDevice.get(device._id)?.isEnrolled ?? false;
            return (
              <Pressable
                key={device._id}
                style={[styles.deviceChip, isSelected && styles.deviceChipSelected, device.isAlarmActive && styles.deviceChipAlarm]}
                onPress={() => {
                  setSelectedDeviceId(device._id);
                  setListenState('idle');
                  isListeningRef.current = false;
                }}
              >
                <Text style={styles.chipEmoji}>{deviceEmoji(device.type)}</Text>
                <View>
                  <Text style={[styles.chipName, isSelected && styles.chipNameSelected]}>{device.name}</Text>
                  <Text style={[styles.chipStatus, enrolled ? styles.chipEnrolled : styles.chipNotEnrolled]}>
                    {device.isAlarmActive ? '🔔 Alarming' : enrolled ? '✓ Trained' : '○ Not trained'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Infinity button */}
      <View style={styles.infinityContainer}>
        {listenState === 'listening' && (
          <>
            <Animated.View style={[styles.infinityRing, styles.infinityRingOuter, { opacity: Animated.multiply(ringAnim, new Animated.Value(0.15)) }]} />
            <Animated.View style={[styles.infinityRing, styles.infinityRingMiddle, { opacity: Animated.multiply(ringAnim, new Animated.Value(0.25)) }]} />
          </>
        )}
        {(listenState === 'activated' || isAlarming) && (
          <Animated.View style={[styles.infinityRing, styles.infinityRingDanger, { opacity: glowAnim }]} />
        )}

        <Pressable
          style={[
            styles.infinityButton,
            listenState === 'listening' && styles.infinityButtonListening,
            listenState === 'detected' && styles.infinityButtonDetected,
            (listenState === 'activated' || isAlarming) && styles.infinityButtonActivated,
          ]}
          onPress={isAlarming ? handleStopAlarm : handleInfinityPress}
        >
          {(listenState === 'activated' || isAlarming) ? (
            <Animated.Text style={[styles.infinityAlarmEmoji, { opacity: glowAnim }]}>🔔</Animated.Text>
          ) : listenState === 'detected' ? (
            <Text style={styles.infinityDetectedEmoji}>🎯</Text>
          ) : (
            <Animated.Image
              source={require('../../assets/images/infinity-logo.png')}
              style={[styles.infinityLogoImage, { opacity: listenState === 'listening' ? infinityFadeAnim : 1 }]}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </View>

      {listenState === 'listening' && (
        <Text style={styles.listeningHint}>Listening... say "{activeWakePhrase}"</Text>
      )}
      {isAlarming && (
        <Text style={styles.alarmingHint}>Tap the button to stop the alarm</Text>
      )}

      {/* Wake phrase card */}
      {selectedDevice && !isAlarming && (
        <View style={styles.phraseCard}>
          <Text style={styles.phraseLabel}>WAKE PHRASE FOR {selectedDevice.name.toUpperCase()}</Text>
          <Text style={styles.phraseText}>"{activeWakePhrase}"</Text>
          {selectedDevice.customWakePhrase && (
            <Text style={styles.phraseCustom}>Custom phrase</Text>
          )}
        </View>
      )}

      {/* Train prompt if not enrolled */}
      {selectedDevice && !isEnrolled && !isAlarming && (
        <Pressable
          style={styles.setupCard}
          onPress={() => router.push({ pathname: '/voice-setup', params: { deviceId: selectedDeviceId ?? '' } })}
        >
          <Text style={styles.setupTitle}>Train Wake Phrase for {selectedDevice.name}</Text>
          <Text style={styles.setupDesc}>Record the wake phrase 3 times so My-Phone learns your voice.</Text>
          <View style={styles.setupBtn}>
            <Text style={styles.setupBtnText}>Start Training →</Text>
          </View>
        </Pressable>
      )}

      {/* Remote alarm button — always available */}
      {selectedDevice && !isAlarming && (
        <Pressable
          style={styles.remoteAlarmBtn}
          onPress={() =>
            Alert.alert(
              'Remote Alarm',
              `Sound alarm on ${selectedDevice.name}? The device will alarm and lock until unlocked with biometrics.`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sound Alarm', style: 'destructive', onPress: handleRemoteAlarm },
              ]
            )
          }
        >
          <Text style={styles.remoteAlarmText}>🚨 Remote Alarm — {selectedDevice.name}</Text>
        </Pressable>
      )}

      {/* All devices summary */}
      {devices.length > 1 && (
        <View style={styles.allDevicesCard}>
          <View style={styles.allDevicesHeader}>
            <Text style={styles.allDevicesTitle}>All Wake Phrases</Text>
            <Text style={styles.allDevicesCount}>{enrolledCount}/{devices.length} trained</Text>
          </View>
          {devices.map((device) => {
            const enrolled = enrollmentByDevice.get(device._id)?.isEnrolled ?? false;
            const phrase = device.customWakePhrase || device.wakePhrase;
            return (
              <Pressable
                key={device._id}
                style={styles.devicePhraseRow}
                onPress={() => router.push({ pathname: '/voice-setup', params: { deviceId: device._id } })}
              >
                <Text style={styles.devicePhraseEmoji}>{deviceEmoji(device.type)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.devicePhraseName}>{device.name}</Text>
                  <Text style={styles.devicePhraseText}>"{phrase}"</Text>
                </View>
                <View style={[styles.enrollBadge, enrolled ? styles.enrollBadgeActive : styles.enrollBadgeInactive]}>
                  <Text style={[styles.enrollBadgeText, enrolled ? styles.enrollBadgeTextActive : {}]}>
                    {enrolled ? '✓' : '○'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* How it works */}
      <View style={styles.howItWorks}>
        <Text style={styles.howTitle}>How It Works</Text>
        <View style={styles.stepRow}>
          <View style={styles.step}>
            <Text style={styles.stepNum}>1</Text>
            <Text style={styles.stepEmoji}>🗣️</Text>
            <Text style={styles.stepText}>Say device's wake phrase</Text>
          </View>
          <Text style={styles.stepArrow}>→</Text>
          <View style={styles.step}>
            <Text style={styles.stepNum}>2</Text>
            <Text style={styles.stepEmoji}>🔔</Text>
            <Text style={styles.stepText}>That device alarms</Text>
          </View>
          <Text style={styles.stepArrow}>→</Text>
          <View style={styles.step}>
            <Text style={styles.stepNum}>3</Text>
            <Text style={styles.stepEmoji}>🔐</Text>
            <Text style={styles.stepText}>Biometric unlock</Text>
          </View>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg, alignItems: 'center' },
  statusHeader: { alignItems: 'center', marginBottom: spacing.lg },
  pageTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.gold },
  pageSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },

  deviceChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: spacing.xl, width: '100%' },
  deviceChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.bgCard, borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.border },
  deviceChipSelected: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  deviceChipAlarm: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  chipEmoji: { fontSize: 16 },
  chipName: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary },
  chipNameSelected: { color: colors.gold },
  chipStatus: { fontSize: 10, marginTop: 1 },
  chipEnrolled: { color: colors.success },
  chipNotEnrolled: { color: colors.textMuted },

  infinityContainer: { alignItems: 'center', justifyContent: 'center', height: 200, width: 200, marginBottom: spacing.xl },
  infinityRing: { position: 'absolute', borderRadius: 999, borderWidth: 2, borderColor: colors.gold },
  infinityRingOuter: { width: 200, height: 200 },
  infinityRingMiddle: { width: 170, height: 170 },
  infinityRingDanger: { width: 200, height: 200, borderColor: colors.danger, borderWidth: 2 },
  infinityButton: { width: 140, height: 140, borderRadius: 70, backgroundColor: 'transparent', borderWidth: 3, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  infinityButtonListening: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  infinityButtonDetected: { borderColor: colors.success, backgroundColor: colors.successDim },
  infinityButtonActivated: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  infinityLogoImage: { width: 90, height: 45 },
  infinityDetectedEmoji: { fontSize: 44 },
  infinityAlarmEmoji: { fontSize: 44 },

  listeningHint: { fontSize: fontSize.sm, color: colors.gold, marginBottom: spacing.lg, textAlign: 'center', fontStyle: 'italic' },
  alarmingHint: { fontSize: fontSize.sm, color: colors.danger, marginBottom: spacing.lg, textAlign: 'center', fontStyle: 'italic' },

  phraseCard: { backgroundColor: colors.bgCard, borderRadius: borderRadius.lg, padding: spacing.xl, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: colors.goldBorder, marginBottom: spacing.lg },
  phraseLabel: { fontSize: 10, color: colors.textMuted, letterSpacing: 1.5, marginBottom: spacing.sm },
  phraseText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gold, textAlign: 'center' },
  phraseCustom: { fontSize: 11, color: colors.gold, marginTop: spacing.xs, fontStyle: 'italic' },

  setupCard: { backgroundColor: colors.bgCard, borderRadius: borderRadius.lg, padding: spacing.xl, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: colors.goldBorder, marginBottom: spacing.lg },
  setupTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.gold, marginBottom: spacing.sm },
  setupDesc: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  setupBtn: { backgroundColor: colors.gold, borderRadius: borderRadius.sm, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, marginTop: spacing.lg },
  setupBtnText: { color: colors.bgPrimary, fontWeight: '700', fontSize: fontSize.md },

  remoteAlarmBtn: { width: '100%', backgroundColor: colors.dangerDim, borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.danger + '40', marginBottom: spacing.lg },
  remoteAlarmText: { color: colors.danger, fontWeight: '700', fontSize: fontSize.sm },

  allDevicesCard: { backgroundColor: colors.bgCard, borderRadius: borderRadius.lg, padding: spacing.lg, width: '100%', borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  allDevicesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  allDevicesTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.gold },
  allDevicesCount: { fontSize: fontSize.xs, color: colors.textMuted },
  devicePhraseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  devicePhraseEmoji: { fontSize: 22 },
  devicePhraseName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  devicePhraseText: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  enrollBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  enrollBadgeActive: { backgroundColor: colors.successDim },
  enrollBadgeInactive: { backgroundColor: 'rgba(255,255,255,0.05)' },
  enrollBadgeText: { fontSize: 14, color: colors.textMuted },
  enrollBadgeTextActive: { color: colors.success },

  howItWorks: { backgroundColor: colors.bgCard, borderRadius: borderRadius.lg, padding: spacing.lg, width: '100%', borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  howTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.gold, marginBottom: spacing.lg, textAlign: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  step: { alignItems: 'center', flex: 1 },
  stepNum: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 4 },
  stepEmoji: { fontSize: 28, marginBottom: 6 },
  stepText: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
  stepArrow: { fontSize: fontSize.lg, color: colors.textMuted, marginHorizontal: 4 },
});
