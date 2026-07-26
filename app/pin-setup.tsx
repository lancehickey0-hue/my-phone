/**
 * PIN Setup — creates and manages the My-Phone unlock PIN.
 *
 * This is a My-Phone PIN, not the phone's own screen-lock passcode. It's the
 * alternative to biometrics on the lockout screen (app/lockout.tsx), for when
 * Face ID / fingerprint isn't available: no sensor, nothing enrolled, wet or
 * gloved hands, or the sensor locked out after too many failed reads.
 *
 * Reached two ways:
 *   1. Onboarding (`?onboarding=1`) — right after device-setup.tsx, which is
 *      after sign-in and after the Vosk model download has finished. Skippable,
 *      *unless* the device has no usable biometrics, in which case the PIN is
 *      the only way to ever unlock a locked device and setup is required.
 *   2. Settings — Profile → Security → PIN Unlock, to change or remove it.
 */

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAction, useQuery } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../convex/_generated/api';
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  formatDuration,
  validatePin,
} from '../convex/pinPolicy';
import { PinKeypad } from '../src/components/PinKeypad';
import { BiometricAuth } from '../src/native/BiometricAuth';
import { borderRadius, colors, fontSize, spacing } from '../src/lib/theme';

type Phase = 'intro' | 'current' | 'create' | 'confirm' | 'done';
type Flow = 'create' | 'change' | 'remove' | 'reset';

// Mirrored in app/_layout.tsx and app/device-setup.tsx, which read the same
// flag to decide whether onboarding still owes the user this screen.
const PIN_PROMPTED_KEY = 'pin_setup_prompted';

export default function PinSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ onboarding?: string }>();
  const isOnboarding = params.onboarding === '1';

  const pinStatus = useQuery(api.pin.status);
  const biometricCreds = useQuery(api.biometric.listCredentials) ?? [];

  const setPin = useAction(api.pinActions.setPin);
  const verifyPin = useAction(api.pinActions.verifyPin);
  const removePin = useAction(api.pinActions.removePin);
  const resetPinWithBiometric = useAction(api.pinActions.resetPinWithBiometric);

  const [phase, setPhase] = useState<Phase>('intro');
  const [flow, setFlow] = useState<Flow>('create');
  const [entry, setEntry] = useState('');
  const [pendingPin, setPendingPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  // Whether this device can do biometrics at all. Decides if onboarding is
  // skippable — with no biometrics, a PIN is the only unlock path there is.
  const [biometricUsable, setBiometricUsable] = useState<boolean | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    BiometricAuth.getCapabilities()
      .then((caps) => setBiometricUsable(caps.isAvailable && caps.isEnrolled))
      .catch(() => setBiometricUsable(false));
  }, []);

  // Server-side cooldown from a previous session — reflect it on open.
  useEffect(() => {
    if (pinStatus?.lockedUntil) setLockedUntil(pinStatus.lockedUntil);
  }, [pinStatus?.lockedUntil]);

  // Tick only while a cooldown is actually counting down.
  useEffect(() => {
    if (!lockedUntil || lockedUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const cooldownMs = lockedUntil ? lockedUntil - now : 0;
  const isCoolingDown = cooldownMs > 0;
  const pinIsSet = pinStatus?.isSet ?? false;
  const canSkip = !isOnboarding || biometricUsable === true;

  function resetEntry() {
    setEntry('');
    setError(null);
  }

  function goto(next: Phase) {
    resetEntry();
    setPhase(next);
  }

  function applyResult(result: {
    success: boolean;
    error?: string;
    lockedUntil?: number;
  }): boolean {
    if (result.lockedUntil) setLockedUntil(result.lockedUntil);
    if (!result.success) {
      setError(result.error ?? 'Something went wrong. Please try again.');
      setEntry('');
      return false;
    }
    setError(null);
    return true;
  }

  async function finishOnboarding() {
    // Remembered per install so a user who skips (or later removes their PIN)
    // isn't re-prompted on every launch. The Security row in Profile stays
    // available either way.
    await SecureStore.setItemAsync(PIN_PROMPTED_KEY, 'true').catch(() => {});
    router.replace('/(tabs)');
  }

  function handleSkip() {
    Alert.alert(
      'Skip PIN setup?',
      "Without a PIN, biometrics are the only way to unlock a locked device. You can set one up later in Profile → Security.",
      [
        { text: 'Go Back', style: 'cancel' },
        { text: 'Skip', style: 'destructive', onPress: finishOnboarding },
      ],
    );
  }

  // ── Phase submissions ────────────────────────────────────────────────────

  async function submitCurrent() {
    if (busy || isCoolingDown) return;
    setBusy(true);
    try {
      if (flow === 'remove') {
        const result = await removePin({ currentPin: entry });
        if (applyResult(result)) {
          doneRef.current = true;
          goto('done');
        }
      } else {
        const result = await verifyPin({ pin: entry });
        if (applyResult(result)) {
          setCurrentPin(entry);
          goto('create');
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not verify PIN.');
      setEntry('');
    } finally {
      setBusy(false);
    }
  }

  function submitCreate() {
    const invalid = validatePin(entry);
    if (invalid) {
      setError(invalid);
      setEntry('');
      return;
    }
    setPendingPin(entry);
    goto('confirm');
  }

  async function submitConfirm() {
    if (busy) return;
    if (entry !== pendingPin) {
      // Not `goto`, which clears the error we're about to show.
      setPendingPin('');
      setEntry('');
      setPhase('create');
      setError("Those PINs didn't match. Start again.");
      return;
    }

    setBusy(true);
    try {
      const result =
        flow === 'reset'
          ? await resetPinWithBiometric({ pin: pendingPin })
          : await setPin({
              pin: pendingPin,
              ...(flow === 'change' ? { currentPin } : {}),
            });

      if (applyResult(result)) {
        setPendingPin('');
        setCurrentPin('');
        doneRef.current = true;
        goto('done');
      } else {
        // Rejected server-side (policy or proof) — send them back to re-enter.
        setPendingPin('');
        setPhase('create');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not save PIN.');
      setEntry('');
    } finally {
      setBusy(false);
    }
  }

  async function startForgotPin() {
    const caps = await BiometricAuth.getCapabilities();
    if (!caps.isAvailable || !caps.isEnrolled) {
      Alert.alert(
        'Biometrics Unavailable',
        "This device has no biometrics set up, so a forgotten PIN can't be reset here.",
      );
      return;
    }

    const result = await BiometricAuth.authenticate({
      promptMessage: 'Verify your identity to reset your My-Phone PIN',
      cancelLabel: 'Cancel',
      disableDeviceFallback: true,
    });

    if (!result.success) {
      if (result.errorCode !== 'user_cancel') {
        setError(result.error ?? 'Biometric verification failed.');
      }
      return;
    }

    setFlow('reset');
    goto('create');
  }

  // ── Copy per phase ───────────────────────────────────────────────────────

  const heading =
    phase === 'done'
      ? flow === 'remove'
        ? 'PIN Removed'
        : 'PIN Ready'
      : phase === 'current'
        ? flow === 'remove'
          ? 'Enter Your PIN'
          : 'Enter Current PIN'
        : phase === 'create'
          ? pinIsSet && flow !== 'create'
            ? 'Choose a New PIN'
            : 'Choose a PIN'
          : phase === 'confirm'
            ? 'Confirm Your PIN'
            : 'Unlock PIN';

  const subheading =
    phase === 'done'
      ? flow === 'remove'
        ? 'Biometrics are now the only way to unlock a locked device.'
        : 'You can now unlock a locked device with your PIN if biometrics fail.'
      : phase === 'current'
        ? flow === 'remove'
          ? 'Confirm your current PIN to remove it.'
          : 'Confirm your current PIN before choosing a new one.'
        : phase === 'create'
          ? `${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits. Avoid repeated digits or runs like 1234.`
          : phase === 'confirm'
            ? 'Enter it once more so we know it stuck.'
            : 'A backup way to unlock your device when Face ID or fingerprint fails.';

  if (pinStatus === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.emoji}>
          {phase === 'done' ? (flow === 'remove' ? '🗑️' : '✅') : '🔢'}
        </Text>
        <Text style={styles.title}>{heading}</Text>
        <Text style={styles.subtitle}>{subheading}</Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {isCoolingDown && phase !== 'done' && (
        <View style={styles.cooldownBanner}>
          <Text style={styles.cooldownText}>
            Too many incorrect attempts. Try again in {formatDuration(cooldownMs)}.
          </Text>
        </View>
      )}

      {/* ── Intro ──────────────────────────────────────────────────────── */}
      {phase === 'intro' && (
        <>
          {isOnboarding && (
            <View style={styles.featureList}>
              <Feature
                icon="🔒"
                title="Works when biometrics don't"
                desc="Wet hands, a failed sensor, or a face the phone won't recognize"
              />
              <Feature
                icon="☁️"
                title="Checked on our servers"
                desc="Not stored on this phone, so it can't be pulled off a stolen device"
              />
              <Feature
                icon="🚫"
                title="Guess-proof"
                desc={`${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits, with a cooldown after repeated wrong tries`}
              />
            </View>
          )}

          {pinIsSet ? (
            <View style={styles.card}>
              <View style={styles.statusRow}>
                <Text style={styles.statusIcon}>✅</Text>
                <Text style={styles.statusText}>A PIN is set on your account</Text>
              </View>

              <Pressable
                style={styles.rowButton}
                onPress={() => {
                  setFlow('change');
                  goto('current');
                }}
              >
                <Text style={styles.rowButtonText}>Change PIN</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>

              <View style={styles.divider} />

              <Pressable style={styles.rowButton} onPress={startForgotPin}>
                <Text style={styles.rowButtonText}>Forgot PIN? Reset with biometrics</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>

              <View style={styles.divider} />

              <Pressable
                style={styles.rowButton}
                onPress={() => {
                  setFlow('remove');
                  goto('current');
                }}
              >
                <Text style={[styles.rowButtonText, { color: colors.danger }]}>Remove PIN</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>

              {biometricCreds.length === 0 && (
                <Text style={styles.footnote}>
                  No biometrics registered on this account — your PIN is currently the
                  only way to unlock a locked device.
                </Text>
              )}
            </View>
          ) : (
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                setFlow('create');
                goto('create');
              }}
            >
              <Text style={styles.primaryButtonText}>Create PIN</Text>
            </Pressable>
          )}

          {isOnboarding && !pinIsSet && canSkip && (
            <Pressable style={styles.textButton} onPress={handleSkip}>
              <Text style={styles.textButtonLabel}>Skip for now</Text>
            </Pressable>
          )}

          {isOnboarding && !pinIsSet && !canSkip && biometricUsable === false && (
            <Text style={styles.footnote}>
              This device has no biometrics set up, so a PIN is the only way to unlock
              it after a lockout. Setting one is required.
            </Text>
          )}

          {!isOnboarding && (
            <Pressable style={styles.textButton} onPress={() => router.back()}>
              <Text style={styles.textButtonLabel}>← Back</Text>
            </Pressable>
          )}
        </>
      )}

      {/* ── Keypad phases ──────────────────────────────────────────────── */}
      {(phase === 'current' || phase === 'create' || phase === 'confirm') && (
        <>
          <PinKeypad
            value={entry}
            onChange={(next) => {
              setEntry(next);
              if (error) setError(null);
            }}
            onSubmit={
              phase === 'current'
                ? submitCurrent
                : phase === 'create'
                  ? submitCreate
                  : submitConfirm
            }
            disabled={busy || isCoolingDown}
          />

          {busy && <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.lg }} />}

          <Pressable
            style={styles.textButton}
            disabled={busy}
            onPress={() => {
              setPendingPin('');
              setCurrentPin('');
              setFlow(pinIsSet ? 'change' : 'create');
              goto('intro');
            }}
          >
            <Text style={styles.textButtonLabel}>Cancel</Text>
          </Pressable>
        </>
      )}

      {/* ── Done ───────────────────────────────────────────────────────── */}
      {phase === 'done' && (
        <Pressable
          style={styles.primaryButton}
          onPress={() => (isOnboarding ? finishOnboarding() : router.back())}
        >
          <Text style={styles.primaryButtonText}>
            {isOnboarding ? 'Continue' : 'Done'}
          </Text>
        </Pressable>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.xxl, paddingTop: 60, alignItems: 'center' },
  loading: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  header: { alignItems: 'center', marginBottom: spacing.xxl },
  emoji: { fontSize: 56, marginBottom: spacing.lg },
  title: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.gold,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  featureList: { width: '100%', marginBottom: spacing.xxl },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  featureIcon: { fontSize: 26 },
  featureTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  featureDesc: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 18 },

  card: {
    width: '100%',
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statusIcon: { fontSize: 18 },
  statusText: { fontSize: fontSize.sm, color: colors.textSecondary },

  rowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowButtonText: { fontSize: fontSize.md, color: colors.textPrimary },
  chevron: { fontSize: fontSize.xl, color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border },

  errorBanner: {
    width: '100%',
    backgroundColor: colors.dangerDim,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.danger + '40',
  },
  errorText: { fontSize: fontSize.sm, color: colors.danger, textAlign: 'center' },

  cooldownBanner: {
    width: '100%',
    backgroundColor: colors.warningDim,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning + '40',
  },
  cooldownText: { fontSize: fontSize.sm, color: colors.warning, textAlign: 'center' },

  primaryButton: {
    width: '100%',
    backgroundColor: colors.gold,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  primaryButtonText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.bgPrimary },

  textButton: { marginTop: spacing.lg, padding: spacing.sm },
  textButtonLabel: { fontSize: fontSize.sm, color: colors.textMuted },

  footnote: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 17,
  },
});
