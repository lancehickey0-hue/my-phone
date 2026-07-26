/**
 * Lockout Screen — Shown when a device alarm is triggered
 *
 * Flow:
 *   1. WakeWordEngine detects wake phrase → AlarmManager triggers alarm
 *   2. This screen takes over (full screen, no navigation escape)
 *   3. Lance's gold infinity animation plays on loop
 *   4. User taps screen → animation pauses → unlock panel slides up
 *   5. Auth succeeds → calls the matching unlock mutation → alarm off → navigate away
 *   6. Cancel → panel hides → animation resumes (still locked)
 *
 * Two ways through step 5:
 *   • Biometric — Face ID / fingerprint, the default when the device has it.
 *   • My-Phone PIN — the fallback (app/pin-setup.tsx). Offered whenever a PIN
 *     is set, and opened automatically when biometrics can't be used at all:
 *     no sensor, nothing enrolled, or the sensor locked out after too many
 *     failed reads. This is My-Phone's own PIN, not the phone's screen-lock
 *     passcode — the OS passcode is explicitly *not* accepted here, since
 *     anyone who shoulder-surfed the screen lock would otherwise walk
 *     straight through the lockout.
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
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAction, useMutation, useQuery } from 'convex/react';
import { Video, ResizeMode } from 'expo-av';
import { api } from '../convex/_generated/api';
import { formatDuration } from '../convex/pinPolicy';
import { BiometricAuth } from '../src/native/BiometricAuth';
import { getAlarmManager } from '../src/native/AlarmManager';
import { PinKeypad } from '../src/components/PinKeypad';
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
  const verifyPinAndUnlock = useAction(api.pinActions.verifyAndUnlock);
  const pinStatus = useQuery(api.pin.status);

  // Animations
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // State
  const [showPanel, setShowPanel] = useState(false);
  const [mode, setMode] = useState<'biometric' | 'pin'>('biometric');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // PIN state
  const [pinEntry, setPinEntry] = useState('');
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [biometricUsable, setBiometricUsable] = useState<boolean | null>(null);

  const deviceName = params.deviceName || 'This Device';
  const deviceId = params.deviceId as Id<'devices'> | undefined;

  const pinIsSet = pinStatus?.isSet ?? false;
  const cooldownMs = lockedUntil ? lockedUntil - now : 0;
  const isCoolingDown = cooldownMs > 0;

  // Capabilities are checked up front, not at tap time, so the panel can open
  // straight into the right mode instead of showing a Face ID button that
  // was never going to work.
  useEffect(() => {
    BiometricAuth.getCapabilities()
      .then((caps) => setBiometricUsable(caps.isAvailable && caps.isEnrolled))
      .catch(() => setBiometricUsable(false));
  }, []);

  // Carry a cooldown from an earlier attempt (possibly a previous session).
  useEffect(() => {
    if (pinStatus?.lockedUntil) setLockedUntil(pinStatus.lockedUntil);
  }, [pinStatus?.lockedUntil]);

  useEffect(() => {
    if (!lockedUntil || lockedUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

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

  // Handle screen tap → show unlock panel
  const handleScreenTap = () => {
    if (showPanel) return;

    // Pause the infinity animation
    videoRef.current?.pauseAsync();

    // Open straight into PIN entry when biometrics aren't an option here.
    setMode(biometricUsable === false && pinIsSet ? 'pin' : 'biometric');
    setShowPanel(true);
    setAuthError(null);
    setPinEntry('');
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 9,
    }).start();
  };

  // Shared success path for both unlock methods
  const completeUnlock = (via: 'biometric' | 'pin') => {
    if (deviceId) {
      getAlarmManager().deactivateAlarm(deviceId, via);
    }
    router.replace('/(tabs)');
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
        // Success — unlock the device in backend
        if (deviceId) {
          await biometricUnlock({ deviceId });
        }
        completeUnlock('biometric');
      } else {
        // Auth failed. A sensor lockout or missing/unenrolled hardware means
        // retrying biometrics is pointless — send them to the PIN if there is
        // one, rather than leaving them tapping a dead button.
        const deadEnd =
          result.errorCode === 'lockout' ||
          result.errorCode === 'not_available' ||
          result.errorCode === 'not_enrolled';

        if (deadEnd && pinIsSet) {
          setMode('pin');
          setPinEntry('');
          setAuthError(
            result.errorCode === 'lockout'
              ? 'Too many failed biometric attempts. Enter your PIN instead.'
              : 'Biometrics unavailable on this device. Enter your PIN instead.',
          );
        } else {
          setAuthError(result.error || 'Authentication failed. Please try again.');
        }
        setIsAuthenticating(false);
      }
    } catch (err) {
      console.error('Biometric unlock error:', err);
      setAuthError('An error occurred. Please try again.');
      setIsAuthenticating(false);
    }
  };

  // Handle PIN unlock
  const handlePinSubmit = async () => {
    if (isAuthenticating || isCoolingDown) return;
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const result = await verifyPinAndUnlock({
        pin: pinEntry,
        ...(deviceId ? { deviceId } : {}),
      });

      if (result.lockedUntil) setLockedUntil(result.lockedUntil);

      if (result.success) {
        completeUnlock('pin');
      } else {
        setPinEntry('');
        setAuthError(result.error ?? 'Incorrect PIN.');
        setIsAuthenticating(false);
      }
    } catch (err) {
      console.error('PIN unlock error:', err);
      setPinEntry('');
      setAuthError('Could not reach the server. Check your connection.');
      setIsAuthenticating(false);
    }
  };

  const switchMode = (next: 'biometric' | 'pin') => {
    setMode(next);
    setAuthError(null);
    setPinEntry('');
  };

  // Handle cancel → hide panel, resume animation
  const handleCancel = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setShowPanel(false);
      setAuthError(null);
      setPinEntry('');
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
      <View style={[styles.overlay, showPanel && styles.overlayDim]} />

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

          {/* Bottom: Touch to unlock (hidden when the unlock panel is up) */}
          {!showPanel && (
            <Animated.View style={[styles.bottomSection, { opacity: pulseAnim }]}>
              <Text style={styles.touchText}>TOUCH TO UNLOCK</Text>
              <View style={styles.touchLine} />
            </Animated.View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Unlock panel (slides up from bottom) */}
      {showPanel && (
        <Animated.View
          style={[
            styles.biometricPanel,
            {
              transform: [{
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [SCREEN_H * 0.9, 0],
                }),
              }],
            },
          ]}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          <Text style={styles.biometricIcon}>{mode === 'pin' ? '🔢' : '🔐'}</Text>
          <Text style={styles.biometricTitle}>
            {mode === 'pin' ? 'Enter Your PIN' : 'Verify Identity'}
          </Text>
          <Text style={styles.biometricSubtitle}>
            {mode === 'pin'
              ? `Your My-Phone PIN unlocks\n${deviceName}`
              : `Use Face ID or fingerprint to unlock\n${deviceName}`}
          </Text>

          {/* Error message */}
          {authError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠️ {authError}</Text>
            </View>
          )}

          {/* Cooldown after too many wrong PINs */}
          {mode === 'pin' && isCoolingDown && (
            <View style={styles.cooldownBanner}>
              <Text style={styles.cooldownText}>
                Locked for {formatDuration(cooldownMs)}
              </Text>
            </View>
          )}

          {mode === 'biometric' ? (
            <>
              {/* Unlock button */}
              <TouchableOpacity
                style={[styles.unlockButton, isAuthenticating && styles.unlockButtonDisabled]}
                onPress={handleBiometricAuth}
                disabled={isAuthenticating}
                activeOpacity={0.8}
              >
                <Text style={styles.unlockButtonText}>
                  {isAuthenticating ? '⏳ Verifying...' : '🔐  Unlock with Face ID'}
                </Text>
              </TouchableOpacity>

              {/* PIN fallback */}
              {pinIsSet && (
                <TouchableOpacity
                  style={styles.altButton}
                  onPress={() => switchMode('pin')}
                  disabled={isAuthenticating}
                  activeOpacity={0.7}
                >
                  <Text style={styles.altButtonText}>Use PIN instead</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <PinKeypad
                value={pinEntry}
                onChange={(next) => {
                  setPinEntry(next);
                  if (authError) setAuthError(null);
                }}
                onSubmit={handlePinSubmit}
                disabled={isAuthenticating || isCoolingDown}
                submitLabel="→"
              />

              {isAuthenticating && (
                <ActivityIndicator color={gold} style={{ marginTop: 16 }} />
              )}

              {/* Back to biometrics, when this device actually has them */}
              {biometricUsable !== false && (
                <TouchableOpacity
                  style={styles.altButton}
                  onPress={() => switchMode('biometric')}
                  disabled={isAuthenticating}
                  activeOpacity={0.7}
                >
                  <Text style={styles.altButtonText}>Use Face ID instead</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* No way in: no PIN set and no usable biometrics */}
          {mode === 'biometric' && !pinIsSet && biometricUsable === false && (
            <Text style={styles.ownerNote}>
              No PIN is set on this account and this device has no biometrics
              enrolled. Unlock it from another signed-in device.
            </Text>
          )}

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

  cooldownBanner: {
    width: '100%',
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderRadius: 10, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(234, 179, 8, 0.3)',
  },
  cooldownText: { fontSize: 13, color: '#eab308', textAlign: 'center', fontWeight: '600' },

  altButton: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center', marginBottom: 6, marginTop: 10,
  },
  altButtonText: { fontSize: 14, fontWeight: '600', color: gold },

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
