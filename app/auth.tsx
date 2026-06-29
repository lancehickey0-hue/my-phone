import { useAuthActions } from '@convex-dev/auth/react';
import * as SecureStore from 'expo-secure-store';
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

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL || 'https://cheery-buffalo-947.convex.cloud';
const STORAGE_NS = CONVEX_URL.replace(/[^a-zA-Z0-9]/g, '');
const REFRESH_KEY = `__convexAuthRefreshToken_${STORAGE_NS}`;
const JWT_KEY = `__convexAuthJWT_${STORAGE_NS}`;

async function clearStaleTokens() {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(JWT_KEY),
  ]);
}

export default function AuthScreen() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
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
      await clearStaleTokens();
      const payload: Record<string, string> = {
        email: email.trim(),
        password,
        flow: mode === 'signup' ? 'signUp' : 'signIn',
      };
      if (mode === 'signup') {
        payload.name = name.trim();
      }
      await signIn('password', payload);
    } catch (e: any) {
      const errorMsg = e.message || 'Failed to sign in. Please try again.';
      setError(errorMsg);
      Alert.alert('Error', errorMsg);
    } finally {
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
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/images/infinity-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logoText}>My-Phone</Text>
            <Text style={styles.tagline}>Because phones don't just disappear</Text>
          </View>
          <View style={styles.form}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

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
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitText}>
                {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
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
  errorBox: { backgroundColor: '#ff4444', padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.md },
  errorText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },
  input: { backgroundColor: colors.bgCard, borderRadius: borderRadius.md, padding: spacing.lg, color: colors.textPrimary, fontSize: fontSize.md, borderWidth: 1, borderColor: colors.border },
  submitBtn: { backgroundColor: colors.gold, borderRadius: borderRadius.md, padding: spacing.lg, alignItems: 'center', marginTop: spacing.sm },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.bgPrimary, fontWeight: '700', fontSize: fontSize.lg },
  toggleText: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg, fontSize: fontSize.sm },
})
