/**
 * Unlock Setup — what lets the owner (and only the owner) stop an alarm.
 *
 *   Step 1  Choose a My-Phone PIN (4–8 digits). Account-wide backup that
 *           always works, checked on the server with an attempt limit.
 *   Step 2  Register fingerprint/face. Creates a key inside the phone's
 *           secure hardware that can only be used after a strong biometric
 *           check; the server only accepts unlocks signed by it.
 *
 * The PIN is required first so a changed fingerprint (which invalidates
 * the hardware key) can never lock the owner out of their own phone.
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAction, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { DeviceKey, type StrongBiometric } from '../src/native/DeviceKey';

type Step = 'loading' | 'pin' | 'biometric' | 'done';

export default function UnlockSetupScreen() {
  const router = useRouter();
  const devices = useQuery(api.devices.list);
  const physicalId = (globalThis as any).__myPhoneDeviceId as string | undefined;
  const myDevice = devices?.find((d) => d.physicalDeviceId === physicalId);
  const status = useQuery(api.unlock.status, myDevice ? { deviceId: myDevice._id } : {});

  const setPinAction = useAction(api.unlockNode.setPin);
  const registerKey = useAction(api.unlockNode.registerKey);

  const [step, setStep] = useState<Step>('loading');
  const [changingPin, setChangingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strong, setStrong] = useState<StrongBiometric>('unavailable');

  useEffect(() => {
    DeviceKey.strongBiometric().then(setStrong).catch(() => setStrong('unavailable'));
  }, []);

  // Decide where to start once we know what's already set up.
  useEffect(() => {
    if (step !== 'loading' || !status) return;
    if (!status.hasPin) setStep('pin');
    else if (!status.hasKey) setStep('biometric');
    else setStep('done');
  }, [status, step]);

  const savePin = async () => {
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) return setError('Use 4 to 8 numbers.');
    if (pin !== pinConfirm) return setError("The two PINs don't match.");
    setBusy(true);
    try {
      const result = await setPinAction({
        pin,
        currentPin: status?.hasPin ? currentPin : undefined,
      });
      if (result.ok) {
        setCurrentPin(''); setPin(''); setPinConfirm(''); setChangingPin(false);
        setStep(status?.hasKey ? 'done' : 'biometric');
      } else if (result.reason === 'wrong_pin') {
        setError(`Current PIN is wrong. ${result.attemptsLeft} tries left.`);
      } else if (result.reason === 'locked') {
        setError(`Too many wrong tries. Try again after ${new Date(result.lockedUntil).toLocaleTimeString()}.`);
      }
    } catch (e: any) {
      setError(e?.data ?? e?.message ?? 'Could not save PIN.');
    } finally {
      setBusy(false);
    }
  };

  const setUpBiometric = async () => {
    setError(null);
    if (!myDevice) return setError('Still connecting this phone to your account. Try again in a moment.');
    setBusy(true);
    try {
      const publicKey = await DeviceKey.createKey();
      await registerKey({ deviceId: myDevice._id, publicKey });
      setStep('done');
    } catch (e: any) {
      setError(e?.data ?? e?.message ?? 'Could not set up fingerprint/face.');
    } finally {
      setBusy(false);
    }
  };

  const showPinForm = step === 'pin' || changingPin;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepper}>
        {step === 'done' ? 'All set' : `Step ${step === 'biometric' ? 2 : 1} of 2`}
      </Text>

      {step === 'loading' && <ActivityIndicator color={gold} style={{ marginTop: 60 }} />}

      {showPinForm && (
        <>
          <Text style={styles.emoji}>🔢</Text>
          <Text style={styles.title}>{status?.hasPin ? 'Change your PIN' : 'Choose a PIN'}</Text>
          <Text style={styles.subtitle}>
            This stops the alarm if your fingerprint or face ever doesn't work. Pick 4 to 8 numbers you'll remember.
          </Text>

          {status?.hasPin && (
            <PinField label="Current PIN" value={currentPin} onChange={setCurrentPin} />
          )}
          <PinField label={status?.hasPin ? 'New PIN' : 'PIN'} value={pin} onChange={setPin} />
          <PinField label="Type it again" value={pinConfirm} onChange={setPinConfirm} />

          {error && <ErrorBanner text={error} />}

          <PrimaryButton label={busy ? 'Saving…' : 'Save PIN'} onPress={savePin} disabled={busy} />
          {changingPin ? (
            <TouchableOpacity style={styles.backLink} onPress={() => { setChangingPin(false); setError(null); }}>
              <Text style={styles.backLinkText}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/(tabs)')}>
              <Text style={styles.backLinkText}>Do this later</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {step === 'biometric' && !changingPin && (
        <>
          <Text style={styles.emoji}>👆</Text>
          <Text style={styles.title}>Add your fingerprint</Text>
          {strong === 'available' ? (
            <>
              <Text style={styles.subtitle}>
                After this, only your fingerprint or face can stop the alarm on this phone. Not a thief, not someone who knows your screen code.
              </Text>
              {error && <ErrorBanner text={error} />}
              <PrimaryButton label={busy ? 'Setting up…' : 'Set up fingerprint / face'} onPress={setUpBiometric} disabled={busy} />
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>
                {strong === 'not_enrolled'
                  ? "You haven't added a fingerprint to this phone yet. Add one in your phone's Settings → Security, then come back."
                  : "This phone's fingerprint/face sensor isn't secure enough to use. Your PIN will be used to stop the alarm instead."}
              </Text>
              <PrimaryButton label="Use PIN only" onPress={() => setStep('done')} />
            </>
          )}
          <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.backLinkText}>Do this later</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'done' && !changingPin && (
        <>
          <Text style={styles.emoji}>✅</Text>
          <Text style={styles.title}>You're protected</Text>
          <Text style={styles.subtitle}>
            {status?.hasKey
              ? 'Your fingerprint or face stops the alarm. Your PIN is the backup.'
              : 'Your PIN stops the alarm.'}
          </Text>
          <PrimaryButton label="Done" onPress={() => router.replace('/(tabs)')} />
          <TouchableOpacity style={styles.secondaryButton} onPress={() => { setChangingPin(true); setError(null); }}>
            <Text style={styles.secondaryButtonText}>Change PIN</Text>
          </TouchableOpacity>
          {strong === 'available' && (
            <TouchableOpacity style={styles.secondaryButton} onPress={setUpBiometric} disabled={busy}>
              <Text style={styles.secondaryButtonText}>
                {status?.hasKey ? 'Re-register fingerprint / face' : 'Add fingerprint / face'}
              </Text>
            </TouchableOpacity>
          )}
          {error && <ErrorBanner text={error} />}
        </>
      )}
    </ScrollView>
  );
}

function PinField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.pinInput}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        placeholder="••••"
        placeholderTextColor="rgba(255,255,255,0.2)"
      />
    </View>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{text}</Text>
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.primaryButton, disabled && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const gold = '#D4A843';
const bgDark = '#06060A';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: bgDark },
  content: { padding: 24, paddingTop: 60 },

  stepper: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.45)', textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 },
  emoji: { fontSize: 56, marginBottom: 16, textAlign: 'center' },
  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginBottom: 6 },
  pinInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    color: '#fff', fontSize: 24, letterSpacing: 8, paddingVertical: 14, paddingHorizontal: 16, textAlign: 'center',
  },
  title: { fontSize: 26, fontWeight: '800', color: gold, marginBottom: 8, textAlign: 'center' },
  subtitle: {
    fontSize: 16, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 23, paddingHorizontal: 8, marginBottom: 28,
  },

  featureList: { marginBottom: 28 },
  featureItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  featureIcon: { fontSize: 28, marginRight: 14, marginTop: 2 },
  featureTextWrap: { flex: 1 },
  featureTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  featureDesc: { fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 18 },

  alreadyBanner: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 10, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  alreadyText: { fontSize: 13, color: '#4ade80', textAlign: 'center' },

  biometricCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(212,168,67,0.06)',
    borderRadius: 16, padding: 28, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(212,168,67,0.15)',
  },
  biometricCardIcon: { fontSize: 60, marginBottom: 16 },
  biometricCardTitle: { fontSize: 20, fontWeight: '700', color: gold, marginBottom: 8 },
  biometricCardDesc: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20 },

  errorBanner: {
    backgroundColor: 'rgba(220,50,50,0.1)',
    borderRadius: 10, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(220,50,50,0.2)',
  },
  errorText: { fontSize: 13, color: '#f87171', textAlign: 'center' },

  loadingSection: { alignItems: 'center', padding: 40 },
  loadingText: { fontSize: 16, color: 'rgba(255,255,255,0.5)' },

  primaryButton: {
    backgroundColor: gold,
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginBottom: 12,
  },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: bgDark },

  secondaryButton: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginBottom: 12,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },

  backLink: { alignItems: 'center', marginTop: 8, marginBottom: 24 },
  backLinkText: { fontSize: 14, color: 'rgba(255,255,255,0.35)' },
});
