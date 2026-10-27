/**
 * Lockout Screen — Shown when a device alarm is triggered
 *
 * Flow:
 *   1. WakeWordEngine detects wake phrase → AlarmManager triggers alarm
 *   2. This screen takes over (full screen, no navigation escape)
 *   3. Lance's gold infinity animation plays on loop
 *   4. User taps screen → animation pauses → biometric panel slides up
 *   5. Biometric auth succeeds → calls biometricUnlock mutation → alarm off → navigate away
 *   6. Cancel → panel hides → animation resumes (still locked)
 */

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
  Alert,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { Video, ResizeMode } from 'expo-av';
import { api } from '../convex/_generated/api';
import { BiometricAuth, type BiometricType } from '../src/native/BiometricAuth';
import { getAlarmManager } from '../src/native/AlarmManager';
import type { Id } from '../convex/_generated/dataModel';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const gold = '#D4A843';
const bgDark = '#06060A';

export default function LockoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
  }>();

  const videoRef = useRef<Video>(null);
  const biometricUnlock = useMutation(api.biometric.biometricUnlock);

  // Animations
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // State
  const [showBiometric, setShowBiometric] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Opened from the native alarm notification (myphone://lockout) there are
  // no params -- resolve this install's own device record instead.
  const devices = useQuery(api.devices.list);
  const physicalId = (globalThis as any).__myPhoneDeviceId as string | undefined;
  const myDevice = devices?.find((d) => d.physicalDeviceId === physicalId);
  const deviceId = (params.deviceId || myDevice?._id) as Id<'devices'> | undefined;
  const deviceName = params.deviceName || myDevice?.name || 'This Device';

  const [biometricType, setBiometricType] = useState<BiometricType>('none');
  useEffect(() => {
    BiometricAuth.getCapabilities()
      .then((c) => setBiometricType(c.isEnrolled ? c.biometricType : 'none'))
      .catch(() => {});
  }, []);
  const biometricLabel = biometricType === 'none'
    ? 'your screen lock'
    : BiometricAuth.getBiometricLabel(biometricType);

  // No escape: the hardware back button does nothing while locked out.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // Pulse "Touch to unlock" text
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1500, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Handle screen tap → show biometric panel
  const handleScreenTap = () => {
    if (showBiometric) return;

    // Pause the infinity animation
    videoRef.current?.pauseAsync();

    // Slide up biometric panel
    setShowBiometric(true);
    setAuthError(null);
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 9,
    }).start();
  };

  // Handle biometric authentication
   const handleBiometricAuth = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      // Trigger native biometric prompt
   const result = await BiometricAuth.authenticateForUnlock(deviceName);

      if (result.success) {
        if (!deviceId) {
          // Never just navigate away -- that would leave the alarm on with
          // no way back to this screen.
          setAuthError('Still connecting to your account. Try again in a moment.');
          setIsAuthenticating(false);
          return;
        }

        // Server first: only silence the siren once the unlock is recorded,
        // otherwise the native lock poller would (correctly) restart it.
        await biometricUnlock({ deviceId });
        getAlarmManager().deactivateAlarm(deviceId, 'biometric');

        router.replace('/(tabs)');
      } else if (result.errorCode === 'user_cancel') {
        setIsAuthenticating(false);
      } else if (result.errorCode === 'lockout') {
        setAuthError('Too many failed attempts. Wait 30 seconds and try again.');
        setIsAuthenticating(false);
      } else {
        setAuthError(result.error || 'Authentication failed. Please try again.');
        setIsAuthenticating(false);
      }
    } catch (err) {
      console.error('Biometric unlock error:', err);
      setAuthError('An error occurred. Please try again.');
      setIsAuthenticating(false);
    }
  };

  // Handle cancel → hide panel, resume animation
  const handleCancel = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setShowBiometric(false);
      setAuthError(null);
      // Resume infinity animation
      videoRef.current?.playAsync();
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Full-screen looping infinity animation */}
      <Video
        ref={videoRef}
        source={require('../assets/video/infinity-lockout.mp4')}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isLooping
        isMuted
      />

      {/* Dark overlay */}
      <View style={[styles.overlay, showBiometric && styles.overlayDim]} />

      {/* Touch area (entire screen) */}
      <TouchableWithoutFeedback onPress={handleScreenTap}>
        <View style={styles.touchArea}>
          {/* Top: Lock status */}
          <View style={styles.topSection}>
            <Text style={styles.lockIcon}>🔒</Text>
            <Text style={styles.lockTitle}>Device Locked</Text>
            <Text style={styles.lockSubtitle}>
              {deviceName} has been locked by My-Phone
            </Text>
          </View>

          {/* Bottom: Touch to unlock (hidden when biometric panel is up) */}
          {!showBiometric && (
            <Animated.View style={[styles.bottomSection, { opacity: pulseAnim }]}>
              <Text style={styles.touchText}>TOUCH TO UNLOCK</Text>
              <View style={styles.touchLine} />
            </Animated.View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Biometric unlock panel (slides up from bottom) */}
      {showBiometric && (
        <Animated.View
          style={[
            styles.biometricPanel,
            {
              transform: [{
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [400, 0],
                }),
              }],
            },
          ]}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          <Text style={styles.biometricIcon}>🔐</Text>
          <Text style={styles.biometricTitle}>Verify Identity</Text>
          <Text style={styles.biometricSubtitle}>
            Use {biometricLabel} to unlock{'\n'}{deviceName}
          </Text>

          {/* Error message */}
          {authError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠️ {authError}</Text>
            </View>
          )}

          {/* Unlock button */}
          <TouchableOpacity
            style={[styles.unlockButton, isAuthenticating && styles.unlockButtonDisabled]}
            onPress={handleBiometricAuth}
            disabled={isAuthenticating}
            activeOpacity={0.8}
          >
            <Text style={styles.unlockButtonText}>
              {isAuthenticating ? '⏳ Verifying...' : `🔐  Unlock with ${biometricLabel}`}
            </Text>
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={isAuthenticating}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.ownerNote}>
            Only the registered owner can unlock this device
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

 const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: bgDark },

  video: {
    position: 'absolute',
    top: 0, left: 0,
    width: SCREEN_W,
    height: SCREEN_H,
  },

  overlay: {
    position: 'absolute',
    top: 0, left: 0,
    width: SCREEN_W,
    height: SCREEN_H,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  overlayDim: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },

  touchArea: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 55,
    paddingHorizontal: 32,
  },

  topSection: { alignItems: 'center' },
  lockIcon: { fontSize: 40, marginBottom: 12 },
  lockTitle: { fontSize: 28, fontWeight: '800', color: gold, marginBottom: 6 },
  lockSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },

  bottomSection: { alignItems: 'center' },
  touchText: {
    fontSize: 15, fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 2, marginBottom: 10,
  },
  touchLine: {
    width: 90, height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  // Biometric panel
  biometricPanel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#0D0D12',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(212, 168, 67, 0.2)',
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
    paddingHorizontal: 32,
    alignItems: 'center',
  },

  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 22,
  },

  biometricIcon: { fontSize: 52, marginBottom: 14 },
  biometricTitle: { fontSize: 22, fontWeight: '800', color: gold, marginBottom: 6 },
  biometricSubtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.5)',
    textAlign: 'center', marginBottom: 24, lineHeight: 20,
  },

  errorBanner: {
    width: '100%',
    backgroundColor: 'rgba(220, 50, 50, 0.15)',
    borderRadius: 10, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(220, 50, 50, 0.3)',
  },
  errorText: { fontSize: 13, color: '#f87171', textAlign: 'center' },

  unlockButton: {
    width: '100%',
    backgroundColor: gold,
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginBottom: 14,
  },
  unlockButtonDisabled: { opacity: 0.6 },
  unlockButtonText: { fontSize: 16, fontWeight: '700', color: bgDark },

  cancelButton: {
    width: '100%',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14, paddingVertical: 13,
    alignItems: 'center', marginBottom: 14,
  },
  cancelButtonText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },

  ownerNote: { fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' },
});
