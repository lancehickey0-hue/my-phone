/**
 * Lockout — shown on the phone that's alarming.
 *
 *   • Your infinity animation, "This phone is locked", and the owner's
 *     "Found this phone?" message for an honest finder.
 *   • One big button: the owner's fingerprint/face signs a one-time server
 *     challenge with the phone's hardware key (or "Use my PIN instead").
 *     The server verifies → alarm off → back to the app.
 *   • No escape: back button and swipe-to-dismiss are disabled.
 */

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  BackHandler,
  TextInput,
  Pressable,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAction, useMutation, useQuery } from 'convex/react';
import { Video, ResizeMode } from 'expo-av';
import { api } from '../convex/_generated/api';
import { BiometricAuth, type BiometricType } from '../src/native/BiometricAuth';
import { getAlarmManager } from '../src/native/AlarmManager';
import { DeviceKey, SignError } from '../src/native/DeviceKey';
import { Icon } from '../src/components/Icon';
import { PrimaryButton, TextButton } from '../src/components/ui';
import { colors, fonts } from '../src/lib/theme';
import type { Id } from '../convex/_generated/dataModel';


export default function LockoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    deviceId?: string;
    deviceName?: string;
    deviceType?: string;
  }>();

  const videoRef = useRef<Video>(null);
  const biometricUnlock = useMutation(api.biometric.biometricUnlock);
  const createChallenge = useAction(api.unlockNode.createChallenge);
  const unlockWithSignature = useAction(api.unlockNode.unlockWithSignature);
  const unlockWithPin = useAction(api.unlockNode.unlockWithPin);


  // State
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Opened from the native alarm notification (myphone://lockout) there are
  // no params -- resolve this install's own device record instead.
  const devices = useQuery(api.devices.list);
  const physicalId = (globalThis as any).__myPhoneDeviceId as string | undefined;
  const myDevice = devices?.find((d) => d.physicalDeviceId === physicalId);
  const deviceId = (params.deviceId || myDevice?._id) as Id<'devices'> | undefined;
  const deviceName = params.deviceName || myDevice?.name || 'This Device';
  const unlockStatus = useQuery(api.unlock.status, deviceId ? { deviceId } : 'skip');
  const profile = useQuery(api.profiles.current);
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState('');

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

  const finishUnlock = () => {
    if (deviceId) getAlarmManager().deactivateAlarm(deviceId, 'biometric');
    router.replace('/(tabs)');
  };

  // Fingerprint/face. With secure unlock set up this signs a one-time
  // server challenge with the hardware key; the server alone decides.
  const handleBiometricAuth = async () => {
    if (isAuthenticating) return;
    if (!deviceId || !unlockStatus) {
      // Never just navigate away -- that would leave the alarm on with no
      // way back to this screen.
      setAuthError('Still connecting to your account. Try again in a moment.');
      return;
    }
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      if (unlockStatus.hasKey && DeviceKey.isSupported()) {
        const { challengeId, challenge } = await createChallenge({ deviceId });
        const signature = await DeviceKey.sign(challenge, `Unlock ${deviceName}`, 'Touch the sensor to stop the alarm');
        const ok = await unlockWithSignature({ deviceId, challengeId, signature });
        if (ok) return finishUnlock();
        setAuthError("That didn't work. Try again, or use your PIN.");
      } else if (unlockStatus.hasPin) {
        setShowPin(true);
      } else {
        // Secure unlock not set up yet: legacy on-device check, so an
        // owner who skipped setup is never trapped by the siren.
        const result = await BiometricAuth.authenticateForUnlock(deviceName);
        if (result.success) {
          await biometricUnlock({ deviceId });
          return finishUnlock();
        }
        if (result.errorCode === 'lockout') setAuthError('Too many failed attempts. Wait 30 seconds and try again.');
        else if (result.errorCode !== 'user_cancel') setAuthError(result.error || 'Authentication failed. Please try again.');
      }
    } catch (err: any) {
      if (err instanceof SignError) {
        if (err.code === 'use_pin') setShowPin(true);
        else if (err.code === 'key_invalidated' || err.code === 'no_key') {
          setShowPin(true);
          setAuthError('Your fingerprints changed since setup. Use your PIN, then set up fingerprint again.');
        } else if (err.code === 'lockout') {
          setShowPin(true);
          setAuthError('Too many tries with your fingerprint. Use your PIN.');
        } else if (err.code !== 'user_cancel') setAuthError(err.message);
      } else {
        setAuthError(err?.data ?? err?.message ?? 'Something went wrong. Please try again.');
      }
    }
    setIsAuthenticating(false);
  };

  const handlePinUnlock = async () => {
    if (isAuthenticating || !deviceId) return;
    if (pin.length < 4) return setAuthError('Enter your 4–8 number PIN.');
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const result = await unlockWithPin({ deviceId, pin });
      setPin('');
      if (result.ok) return finishUnlock();
      if (result.reason === 'wrong_pin') {
        setAuthError(result.attemptsLeft > 0
          ? `Wrong PIN. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left.`
          : 'Wrong PIN. PIN entry is paused for a few minutes.');
      } else if (result.reason === 'locked') {
        setAuthError(`Too many wrong PINs. Try again after ${new Date(result.lockedUntil).toLocaleTimeString()}.`);
      } else {
        setAuthError('No PIN is set up for this account.');
      }
    } catch (err: any) {
      setAuthError(err?.data ?? err?.message ?? 'Something went wrong. Please try again.');
    }
    setIsAuthenticating(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={styles.alarmStripe} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
        {/* Your infinity animation, with a lock badge */}
        <View style={styles.hero}>
          <Video
            ref={videoRef}
            source={require('../assets/video/infinity-lockout.mp4')}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping
            isMuted
          />
          <View style={styles.lockBadge}>
            <Icon name="lock" size={20} color={colors.onGold} strokeWidth={2.4} />
          </View>
        </View>

        <Text style={styles.title} accessibilityRole="header">This phone is locked</Text>
        <Text style={styles.subtitle}>The owner set off its alarm. Only they can stop it.</Text>

        {profile?.finderMessage ? (
          <View style={styles.finderBox}>
            <Text style={styles.finderLabel}>Found this phone?</Text>
            <Text style={styles.finderText}>{profile.finderMessage}</Text>
          </View>
        ) : null}

        <View style={{ flex: 1, minHeight: 24 }} />

        {authError && (
          <View style={styles.errorBanner} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{authError}</Text>
          </View>
        )}

        {showPin ? (
          <View style={{ gap: 12 }}>
            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              autoFocus
              placeholder="My-Phone PIN"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={handlePinUnlock}
              accessibilityLabel="My-Phone PIN"
            />
            <PrimaryButton label="Unlock with PIN" loading={isAuthenticating} onPress={handlePinUnlock} />
            {unlockStatus?.hasKey && (
              <TextButton label="Use fingerprint instead" onPress={() => { setShowPin(false); setAuthError(null); }} />
            )}
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Owner: unlock with ${biometricLabel}`}
              onPress={handleBiometricAuth}
              disabled={isAuthenticating}
              style={({ pressed }) => [styles.bigUnlock, (pressed || isAuthenticating) && { opacity: 0.85 }]}
            >
              <Icon name="fingerprint" size={44} color={colors.onGold} strokeWidth={1.8} />
              <Text style={styles.bigUnlockText}>{isAuthenticating ? 'Checking…' : 'Owner: touch to unlock'}</Text>
            </Pressable>
            {unlockStatus?.hasPin && (
              <TextButton label="Use my PIN instead" onPress={() => { setShowPin(true); setAuthError(null); }} />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  alarmStripe: { height: 6, backgroundColor: colors.danger },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 40, paddingBottom: 40 },
  hero: { alignSelf: 'center', width: 260, height: 150, marginBottom: 18 },
  video: { width: 260, height: 150 },
  lockBadge: {
    position: 'absolute', right: 4, bottom: -4, width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.danger, borderWidth: 4, borderColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 38, color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 25, color: colors.textSecondary, textAlign: 'center', marginTop: 10 },
  finderBox: { marginTop: 24, borderRadius: 20, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 18, gap: 6 },
  finderLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  finderText: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, color: colors.textPrimary },
  errorBanner: { backgroundColor: colors.dangerDim, borderRadius: 14, padding: 14, marginBottom: 12 },
  errorText: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: colors.dangerText, textAlign: 'center' },
  bigUnlock: { height: 120, borderRadius: 28, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', gap: 8 },
  bigUnlockText: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.onGold },
  pinInput: {
    height: 64, borderRadius: 18, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.bgElevated,
    color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 26, letterSpacing: 8, textAlign: 'center',
  },
});
