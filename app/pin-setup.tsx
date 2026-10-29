/**
 * My-Phone PIN setup — required, right after the account is created.
 *
 * Order for a new user:
 *   wake-word-setup (voice model download) → auth (create account)
 *   → THIS SCREEN → device-setup (permissions) → biometric-setup → app
 *
 * AuthGuard (app/_layout.tsx) sends any signed-in user without a PIN here,
 * so it can't be skipped, and existing accounts that never set one get
 * sent here on their next launch.
 *
 * The My-Phone PIN is separate from the phone's own screen-lock code: the
 * screen-lock code can NOT stop the alarm. A thief who watched the owner
 * unlock their phone would know that code, so the owner is told to pick a
 * different one. (Android doesn't let apps read the screen-lock code, so
 * reuse can't be detected — only discouraged.)
 */

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAction, useQuery } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../convex/_generated/api';
import { pinProblem, PIN_MAX } from '../convex/pinRules';

const gold = '#D4A843';
const bgDark = '#06060A';

export default function PinSetupScreen() {
  const router = useRouter();
  const status = useQuery(api.unlock.status, {});
  const setPinAction = useAction(api.unlockNode.setPin);

  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<TextInput>(null);

  // Required step: the hardware back button doesn't leave this screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const goNext = async () => {
    const permsDone = await SecureStore.getItemAsync('post_login_permissions_done');
    router.replace(permsDone === 'true' ? '/(tabs)' : '/device-setup');
  };

  // Already has a PIN (e.g. reinstall on an existing account) — move on.
  useEffect(() => {
    if (status?.hasPin && !busy) goNext();
  }, [status?.hasPin]);

  const save = async () => {
    setError(null);
    const problem = pinProblem(pin);
    if (problem) return setError(problem);
    if (pin !== pinConfirm) return setError("The two PINs don't match.");
    setBusy(true);
    try {
      const result = await setPinAction({ pin });
      if (result.ok) {
        setPin(''); setPinConfirm('');
        await goNext();
        return;
      }
      if (result.reason === 'locked') {
        setError(`Too many tries. Try again after ${new Date(result.lockedUntil).toLocaleTimeString()}.`);
      } else {
        setError('Could not save your PIN. Please try again.');
      }
    } catch (e: any) {
      setError(e?.data ?? e?.message ?? 'Could not save your PIN. Please try again.');
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.emoji}>🔢</Text>
        <Text style={styles.title}>Create your My-Phone PIN</Text>
        <Text style={styles.subtitle}>
          This PIN is what turns off the alarm if your phone is ever lost or stolen.
        </Text>

        <View style={styles.warning}>
          <Text style={styles.warningTitle}>Use a different PIN than your phone's lock screen</Text>
          <Text style={styles.warningText}>
            Your phone's normal unlock code will NOT stop the alarm. If someone has seen you unlock your phone, they'd know that code — so pick a new one only you know.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>New PIN (4 to 8 numbers)</Text>
        <TextInput
          style={styles.pinInput}
          value={pin}
          onChangeText={(t) => { setPin(t.replace(/\D/g, '')); setError(null); }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN_MAX}
          autoFocus
          placeholder="••••"
          placeholderTextColor="rgba(255,255,255,0.2)"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />

        <Text style={styles.fieldLabel}>Type it again</Text>
        <TextInput
          ref={confirmRef}
          style={styles.pinInput}
          value={pinConfirm}
          onChangeText={(t) => { setPinConfirm(t.replace(/\D/g, '')); setError(null); }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN_MAX}
          placeholder="••••"
          placeholderTextColor="rgba(255,255,255,0.2)"
          onSubmitEditing={save}
        />

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, (busy || !status) && { opacity: 0.6 }]}
          onPress={save}
          disabled={busy || !status}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>{busy ? 'Saving…' : 'Save PIN'}</Text>
        </TouchableOpacity>

        <Text style={styles.footnote}>
          You can change it later in Profile → Security. You'll need this PIN to change it.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: bgDark },
  content: { padding: 24, paddingTop: 64, paddingBottom: 40 },
  emoji: { fontSize: 56, marginBottom: 16, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: gold, marginBottom: 8, textAlign: 'center' },
  subtitle: {
    fontSize: 16, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 23,
    paddingHorizontal: 8, marginBottom: 20,
  },
  warning: {
    backgroundColor: 'rgba(212,168,67,0.08)', borderRadius: 14, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: 'rgba(212,168,67,0.3)',
  },
  warningTitle: { fontSize: 15, fontWeight: '700', color: gold, marginBottom: 6 },
  warningText: { fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 20 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginBottom: 6 },
  pinInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 24, letterSpacing: 8,
    paddingVertical: 14, paddingHorizontal: 16, textAlign: 'center', marginBottom: 16,
  },
  errorBanner: {
    backgroundColor: 'rgba(220,50,50,0.1)', borderRadius: 10, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(220,50,50,0.2)',
  },
  errorText: { fontSize: 14, color: '#f87171', textAlign: 'center' },
  primaryButton: {
    backgroundColor: gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    marginTop: 4, marginBottom: 16,
  },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: bgDark },
  footnote: { fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 18 },
});
