import 'react-native-get-random-values'; // Must be first — Convex needs crypto.getRandomValues()
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { useConvexAuth, useMutation } from 'convex/react';
import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { api } from '../convex/_generated/api';
import { colors } from '../src/lib/theme';

const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL || 'https://quaint-kingfisher-867.convex.cloud'
);

// On native, use SecureStore for auth token persistence.
// On web, ConvexAuthProvider defaults to localStorage automatically.
const nativeStorage = Platform.OS !== 'web' ? {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
} : undefined;

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureProfile = useMutation(api.profiles.ensureProfile);
  const segments = useSegments();
  const router = useRouter();
  const profileCreated = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    const inAuthScreen = segments[0] === 'auth';

    if (!isAuthenticated && !inAuthScreen) {
      // Not logged in and not on auth screen → redirect to login
      profileCreated.current = false;
      router.replace('/auth');
    } else if (isAuthenticated && inAuthScreen) {
      // Logged in but still on auth screen → go to dashboard
      router.replace('/(tabs)');
    }

    // Create profile once auth is confirmed by the Convex client.
    // This runs AFTER the auth token is propagated, avoiding the race condition.
    if (isAuthenticated && !profileCreated.current) {
      profileCreated.current = true;
      ensureProfile().catch(() => {
        // Profile may already exist or will be created on next app open
        profileCreated.current = false;
      });
    }
  }, [isAuthenticated, isLoading, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ConvexAuthProvider client={convex} storage={nativeStorage}>
      <StatusBar style="light" />
      <AuthGuard>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bgPrimary },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen
            name="voice-setup"
            options={{
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="biometric-setup"
            options={{
              headerShown: false,
              presentation: 'modal',
            }}
          />
        </Stack>
      </AuthGuard>
    </ConvexAuthProvider>
  );
}
