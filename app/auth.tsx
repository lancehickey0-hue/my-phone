import { useAuthActions } from '@convex-dev/auth/react';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '../src/lib/theme';

export default function AuthScreen() {
  const { signIn } = useAuthActions();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState<'credentials' | 'verification'>('credentials');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCredentials() {
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      console.log('🔐 Step 1: Submitting credentials...');
      
      // This step sends the OTP code to their email
      await signIn('password', {
        email: email.trim(),
        password,
        name: mode === 'signup' ? name.trim() : undefined,
        flow: mode === 'signup' ? 'signUp' : 'signIn',
      });
      
      console.log('✅ OTP sent! Moving to verification step');
      setStep('verification');
      setLoading(false);
    } catch (e: any) {
      console.error('❌ Credentials error:', e);
      const errorMsg = e.message || 'Failed to process credentials. Please try again.';
      setError(errorMsg);
      Alert.alert('Error', errorMsg);
      setLoading(false);
    }
  }

  async function handleVerification() {
    if (!verificationCode.trim()) {
      setError('Please enter the verification code from your email');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      console.log('🔐 Step 2: Submitting verification code...');
      
      // Complete the auth with the verification code
      const result = await signIn('password', {
        email: email.trim(),
        password,
        code: verificationCode.trim(),
        flow: mode === 'signup' ? 'signUp' : 'signIn',
      });
      
      console.log('✅ Auth successful!');
      // Navigation handled automatically by _layout.tsx
    } catch (e: any) {
      console.error('❌ Verification error:', e);
      const errorMsg = e.message || 'Invalid verification code. Please try again.';
      setError(errorMsg);
      Alert.alert('Error', errorMsg);
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={true}
      >
        <View style={styles.inner}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/infinity-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>My-Phone</Text>
            <Text style={styles.tagline}>Because phones don't just disappear</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {step === 'credentials' ? (
              <>
                {mode === 'signup' && (
                  <TextInput
                    style={styles.input}
                    placeholder="Full Name"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    editable={!loading}
                  />
                )}
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!loading}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!loading}
                />

                <Pressable
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleCredentials}
                  disabled={loading}
                >
                  <Text style={styles.submitText}>
                    {loading ? 'Sending code...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
                  <Text>
                <Pressable onPress={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setError('');
                  setEmail('');
                  setPassword('');
                  setName('');
                }}
                disabled={loading}
                >
                  <Text style={styles.toggleText}>
                    {mode === 'signin'
                      ? "Don't have an account? Sign Up"
                      : 'Already have an account? Sign In'}
                  </Text>
                </Pressable>
             
             </>
           ) : (
              <>
                <Text style={styles.verificationInfo}>
                  We sent a verification code to {email}. Enter it below to complete your sign in.
                </Text>

                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor={colors.textMuted}
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                  textAlign="center"
                />

                <Pressable
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleVerification}
                  disabled={loading}
                >
                  <Text style={styles.submitText}>
                    {loading ? 'Verifying...' : 'Verify & Sign In'}
                  </Text>
                </Pressable>

                <Pressable onPress={() => {
                  setStep('credentials');
                  setVerificationCode('');
                  setError('');
                }}
                disabled={loading}
                >
                  <Text style={styles.toggleText}>
                    Back to Sign In
                  </Text>
                </Pressable>
              </>
            )}

            <Text style={styles.infoText}>
              {step === 'credentials'
                ? mode === 'signup'
                  ? 'A verification code will be sent to your email'
                  : 'Sign in with your credentials'
                : 'Check your email for the verification code'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: spacing.xxl },
  inner: { justifyContent: 'center' },

  logoContainer: { alignItems: 'center', marginBottom: spacing.xxxl },
  logoImage: { width: 160, height: 80, marginBottom: spacing.md },
  logoText: { fontSize: fontSize.hero, fontWeight: '800', color: colors.gold },
  tagline: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },

  form: { gap: spacing.md },
  errorBox: {
    backgroundColor: '#ff4444',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  errorText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeInput: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    letterSpacing: 8,
  },
  verificationInfo: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  submitBtn: {
    backgroundColor: colors.gold,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.bgPrimary, fontWeight: '700', fontSize: fontSize.lg },
  toggleText: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg, fontSize: fontSize.sm },
  infoText: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg, fontSize: fontSize.sm, fontStyle: 'italic' },
});
