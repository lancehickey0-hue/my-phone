import 'react-native-get-random-values'; // Must be first — Convex needs crypto.getRandomValues()
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
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

export default function RootLayout() {
  return (
    <ConvexAuthProvider client={convex} storage={nativeStorage}>
      <StatusBar style="light" />
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
    </ConvexAuthProvider>
  );
}
