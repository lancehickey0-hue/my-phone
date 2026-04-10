import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../convex/_generated/api';
import { borderRadius, colors, fontSize, spacing } from '../src/lib/theme';

export default function AuthScreen() {
  const { signIn } = useAuthActions();
  const ensureProfile = useMutation(api.profiles.ensureProfile);
  const router = useRouter();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAuth() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    setLoading(true);
    try {
      await signIn('password', {
        email: email.trim(),
        password,
        name: mode === 'signup' ? name.trim() : undefined,
        flow: mode === 'signup' ? 'signUp' : 'signIn',
      });
      await ensureProfile();
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoEmoji}>♾️</Text>
          <Text style={styles.logoText}>My-Phone</Text>
          <Text style={styles.tagline}>Your devices. Your voice. Your security.</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
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
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Pressable
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            <Text style={styles.submitText}>
              {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Text>
          </Pressable>

          <Pressable onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            <Text style={styles.toggleText}>
              {mode === 'signin'
                ? "Don't have an account? Sign Up"
                : 'Already have an account? Sign In'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  inner: { flex: 1, justifyContent: 'center', padding: spacing.xxl },

  logoContainer: { alignItems: 'center', marginBottom: spacing.xxxl },
  logoEmoji: { fontSize: 64, marginBottom: spacing.md },
  logoText: { fontSize: fontSize.hero, fontWeight: '800', color: colors.gold },
  tagline: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },

  form: { gap: spacing.md },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: colors.border,
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
});
