/**
 * Biometric Setup Screen — Enroll Face ID / Fingerprint for device unlock
 *
 * During onboarding, users register their biometric so they can:
 *   1. Unlock locked-out devices
 *   2. Optionally use biometric login
 *   3. Authorize sensitive actions (removing devices, changing settings)
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { BiometricAuth, type BiometricType } from '../src/native/BiometricAuth';
import { colors, fontSize, spacing, borderRadius } from '../src/lib/theme';

type SetupStep = 'intro' | 'checking' | 'enrolling' | 'complete' | 'unavailable';

export default function BiometricSetupScreen() {
  const router = useRouter();
  const credentials = useQuery(api.biometric.listCredentials) ?? [];
  const registerCredential = useMutation(api.biometric.registerCredential);

  const [step, setStep] = useState<SetupStep>('intro');
  const [biometricType, setBiometricType] = useState<BiometricType>('none');
  const [error, setError] = useState<string | null>(null);

  const biometricLabel = BiometricAuth.getBiometricLabel(biometricType);
  const biometricIcon = BiometricAuth.getBiometricIcon(biometricType);
  const alreadySetup = credentials.length > 0;

  // Check device capabilities
  const checkCapabilities = async () => {
    setStep('checking');
    setError(null);

    const caps = await BiometricAuth.getCapabilities();

    if (!caps.isAvailable) {
      setStep('unavailable');
      setError('Your device does not support biometric authentication.');
      return;
    }

    if (!caps.isEnrolled) {
      setStep('unavailable');
      setError(
        `${BiometricAuth.getBiometricLabel(caps.biometricType)} is available but not set up on your device. ` +
        'Please enable it in your device settings first.'
      );
      return;
    }

    setBiometricType(caps.biometricType);
    setStep('enrolling');
  };

  // Perform biometric enrollment
  const enrollBiometric = async () => {
    setError(null);

    const result = await BiometricAuth.authenticate({
      promptMessage: `Set up ${biometricLabel} for My-Phone`,
      cancelLabel: 'Cancel',
    });

    if (result.success) {
      // Register the credential in the backend
      const credId = `bio_${Platform.OS}_${Date.now()}`;
      await registerCredential({
        credentialId: credId,
        credentialLabel: `${biometricLabel} (${Platform.OS === 'ios' ? 'iPhone' : 'Android'})`,
      });

      setStep('complete');
    } else {
      setError(result.error || 'Biometric verification failed. Please try again.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>
          {step === 'complete' ? '✅' : step === 'unavailable' ? '⚠️' : '🔐'}
        </Text>
        <Text style={styles.title}>
          {step === 'complete'
            ? 'Biometric Enrolled!'
            : step === 'unavailable'
              ? 'Biometric Unavailable'
              : 'Biometric Security'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 'complete'
            ? `${biometricLabel} is now active on your account. You can unlock locked-out devices with a glance or a touch.`
            : step === 'unavailable'
              ? error
              : 'Secure your devices with Face ID or fingerprint. This is required to unlock devices after a lockout.'}
        </Text>
      </View>

      {/* Intro step */}
      {step === 'intro' && (
        <>
          <View style={styles.featureList}>
            <FeatureItem
              icon="🔓"
              title="Unlock Locked Devices"
              desc="Only you can deactivate alarms and unlock your devices"
            />
            <FeatureItem
              icon="🛡️"
              title="Theft Protection"
              desc="Even if someone finds your device, they can't bypass the lock"
            />
            <FeatureItem
              icon="⚡"
              title="Instant Verification"
              desc="Unlock with a glance (Face ID) or a touch (fingerprint)"
            />
          </View>

          {alreadySetup && (
            <View style={styles.alreadyBanner}>
              <Text style={styles.alreadyText}>
                ✅ You already have {credentials.length} biometric{credentials.length > 1 ? 's' : ''} registered
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.primaryButton} onPress={checkCapabilities}>
            <Text style={styles.primaryButtonText}>
              {alreadySetup ? 'Add Another Biometric' : 'Set Up Biometric'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* Checking step */}
      {step === 'checking' && (
        <View style={styles.loadingSection}>
          <Text style={styles.loadingText}>Checking device capabilities...</Text>
        </View>
      )}

      {/* Enrolling step */}
      {step === 'enrolling' && (
        <>
          <View style={styles.biometricCard}>
            <Text style={styles.biometricCardIcon}>{biometricIcon}</Text>
            <Text style={styles.biometricCardTitle}>{biometricLabel} Detected</Text>
            <Text style={styles.biometricCardDesc}>
              Tap the button below to verify your {biometricLabel}. This confirms you're the device owner.
            </Text>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.primaryButton} onPress={enrollBiometric}>
            <Text style={styles.primaryButtonText}>
              Verify with {biometricLabel}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* Complete step */}
      {step === 'complete' && (
        <>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.primaryButtonText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/pin-setup')}
          >
            <Text style={styles.secondaryButtonText}>Set Up a Backup PIN</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Unavailable step */}
      {step === 'unavailable' && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryButtonText}>Go Back</Text>
        </TouchableOpacity>
      )}

      {/* Back link */}
      {(step === 'intro' || step === 'enrolling') && (
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>← Back</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function FeatureItem({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={styles.featureTextWrap}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

const gold = '#D4A843';
const bgDark = '#06060A';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: bgDark },
  content: { padding: 24, paddingTop: 60 },

  header: { alignItems: 'center', marginBottom: 32 },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800', color: gold, marginBottom: 8, textAlign: 'center' },
  subtitle: {
    fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 22, paddingHorizontal: 8,
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
