import 'react-native-get-random-values'; // Must be first — Convex needs crypto.getRandomValues()
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
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
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthScreen = segments[0] === 'auth';

    if (!isAuthenticated && !inAuthScreen) {
      // Not logged in and not on auth screen → redirect to login
      router.replace('/auth');
    } else if (isAuthenticated && inAuthScreen) {
      // Logged in but still on auth screen → go to dashboard
      router.replace('/(tabs)');
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
              headerShown: true,
              title: 'Voice Training',
              headerStyle: { backgroundColor: colors.bgPrimary },
              headerTintColor: colors.gold,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="biometric-setup"
            options={{
              headerShown: true,
              title: 'Biometric Security',
              headerStyle: { backgroundColor: colors.bgPrimary },
              headerTintColor: colors.gold,
              presentation: 'modal',
            }}
          />
        </Stack>
      </AuthGuard>
    </ConvexAuthProvider>
  );
}
