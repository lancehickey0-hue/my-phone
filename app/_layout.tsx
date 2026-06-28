import 'react-native-get-random-values';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { useConvexAuth, useMutation } from 'convex/react';
import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import { api } from '../convex/_generated/api';
import { colors } from '../src/lib/theme';
import * as Application from 'expo-application';

const convex = new ConvexReactClient(
  process.env.EXPO_PUBLIC_CONVEX_URL || 'https://cheery-buffalo-947.convex.cloud'
);

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
  const [setupChecked, setSetupChecked] = useState(false);

  // ── Wake word listener ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    const { WakeWordModule } = NativeModules;
    if (!WakeWordModule) return;

    const emitter = new NativeEventEmitter(WakeWordModule);
    const sub = emitter.addListener('WakeWordDetected', () => {
      router.push('/lockout');
    });

    try {
      WakeWordModule.startService();
    } catch (e) {
      console.warn('Could not start WakeWordService:', e);
    }

    return () => sub.remove();
  }, [isAuthenticated]);

  // ── Wake word setup check ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || setupChecked) return;

    const inWakeWordSetup = segments[0] === 'wake-word-setup';
    const inLockout = segments[0] === 'lockout';
    const inAuth = segments[0] === 'auth';

    if (inWakeWordSetup || inLockout || inAuth) return;

    // Small delay to let router settle
    const timer = setTimeout(() => {
      setSetupChecked(true);
      router.replace('/wake-word-setup');
    }, 500);

    return () => clearTimeout(timer);
  }, [isAuthenticated, segments, setupChecked]);

  // ── Auth routing ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      profileCreated.current = false;
      setSetupChecked(false);
      router.replace('/auth');
      return;
    }

    if (!profileCreated.current) {
      profileCreated.current = true;

      ensureProfile().catch(() => {
        profileCreated.current = false;
      });

      if (!deviceRegistered.current) {
        deviceRegistered.current = true;
        (async () => {
          try {
            let physicalDeviceId = Platform.OS === 'android'
              ? Application.androidId ?? ''
              : (await Application.getIosIdForVendorAsync()) ?? '';

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
    }
  }, [isAuthenticated, isLoading]);

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
          <Stack.Screen name="lockout" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="wake-word-setup" options={{ headerShown: false }} />
          <Stack.Screen name="voice-setup" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="biometric-setup" options={{ headerShown: false, presentation: 'modal' }} />
        </Stack>
      </AuthGuard>
    </ConvexAuthProvider>
  );
}
