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
import * as Application from 'expo-application';

const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL || 'https://cheery-buffalo-947.convex.cloud'
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
  const deviceRegistered = useRef(false);

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
    // Capture this device's hardware ID for "This is my device" registration
      if (!deviceRegistered.current) {
        deviceRegistered.current = true;
    // Auto-start wake word background service
          try {
            const { getBackgroundService } = require('../src/native/BackgroundService');
            getBackgroundService().start();
          } catch (e) {
            console.warn('Could not start background service:', e);
          }
        (async () => {
          try {
            let physicalDeviceId = Platform.OS === 'android'
             ? Application.androidId ?? ''
             : (await Application.getIosIdForVendorAsync()) ?? '';

            // Fallback: if androidId is null/empty, use a persistent UUID
            if (!physicalDeviceId) {
             const stored = await SecureStore.getItemAsync('device_uuid');
              if (stored) {
                physicalDeviceId = stored;
              } else {
                const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                  const r = Math.random() * 16 | 0;
                  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                });
                await SecureStore.setItemAsync('device_uuid', uuid);
                physicalDeviceId = uuid;
              }
            }
            if (typeof globalThis !== 'undefined') {
              (globalThis as any).__myPhoneDeviceId = physicalDeviceId;
            }
          } catch (e) {
            console.warn('Could not get device ID:', e);
          }
        })();
      }
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
