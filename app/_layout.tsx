import 'react-native-get-random-values';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, NativeModules, NativeEventEmitter } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '../convex/_generated/api';
import { colors } from '../src/lib/theme';
import { getAlarmManager } from '../src/native/AlarmManager';
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
  const { signOut } = useAuthActions();
  const currentUser = useQuery(api.auth.currentUser);
  const ensureProfile = useMutation(api.profiles.ensureProfile);
  const triggerAlarm = useMutation(api.devices.triggerAlarm);
  const devices = useQuery(api.devices.list) ?? [];
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const triggerAlarmRef = useRef(triggerAlarm);
  triggerAlarmRef.current = triggerAlarm;
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
    const sub = emitter.addListener('WakeWordDetected', async () => {
      const physicalId = (globalThis as any).__myPhoneDeviceId;
      const allDevices = devicesRef.current;
      const myDevice = allDevices.find((d) => d.physicalDeviceId === physicalId) ?? allDevices[0];

      if (myDevice) {
        try {
          await triggerAlarmRef.current({ deviceId: myDevice._id });
        } catch (e) {
          console.warn('Could not trigger alarm in DB:', e);
        }
        getAlarmManager().triggerAlarm(myDevice._id, 'voice');
        router.push({
          pathname: '/lockout',
          params: {
            deviceId: myDevice._id,
            deviceName: myDevice.name,
            deviceType: myDevice.type,
          },
        });
      } else {
        router.push('/lockout');
      }
    });

    try {
      WakeWordModule.startService();
    } catch (e) {
      console.warn('Could not start WakeWordService:', e);
    }

    return () => sub.remove();
  }, [isAuthenticated]);

  // ── Incoming push notification listener ──────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    // Handle push notification received while app is foregrounded
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as any;
      if (data?.type === 'alarm' && data?.deviceId) {
        const deviceId = data.deviceId as string;
        const allDevices = devicesRef.current;
        const device = allDevices.find((d) => d._id === deviceId);
        getAlarmManager().triggerAlarm(deviceId, 'remote');
        router.push({
          pathname: '/lockout',
          params: {
            deviceId,
            deviceName: device?.name ?? 'This Device',
            deviceType: device?.type ?? 'phone',
          },
        });
      }
    });

    // Handle tap on push notification when app was backgrounded/killed
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (data?.type === 'alarm' && data?.deviceId) {
        const deviceId = data.deviceId as string;
        const allDevices = devicesRef.current;
        const device = allDevices.find((d) => d._id === deviceId);
        getAlarmManager().triggerAlarm(deviceId, 'remote');
        router.push({
          pathname: '/lockout',
          params: {
            deviceId,
            deviceName: device?.name ?? 'This Device',
            deviceType: device?.type ?? 'phone',
          },
        });
      }
    });

    return () => {
      sub.remove();
      tapSub.remove();
    };
  }, [isAuthenticated]);

  // ── Ghost account eviction ────────────────────────────────────────────────
  // isAuthenticated can be true with a valid JWT even after the user document
  // was deleted from the DB. Detect this and force a sign-out so the login
  // screen is shown with no stale session.
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    if (currentUser === undefined) return; // query still loading
    if (currentUser === null) {
      signOut();
    }
  }, [isAuthenticated, isLoading, currentUser]);

  // ── Wake word setup check ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || setupChecked) return;

    const inWakeWordSetup = segments[0] === 'wake-word-setup';
    const inLockout = segments[0] === 'lockout';
    const inAuth = segments[0] === 'auth';

    if (inWakeWordSetup || inLockout || inAuth) return;

    // Skip redirect if the user already completed setup in a previous launch
    SecureStore.getItemAsync('wake_word_setup_done').then((done) => {
      if (done === 'true') {
        setSetupChecked(true);
        return;
      }
      const timer = setTimeout(() => {
        setSetupChecked(true);
        router.replace('/wake-word-setup');
      }, 500);
      // No cleanup possible here, but the setupChecked guard prevents re-runs
    });
  }, [isAuthenticated, segments, setupChecked]);

  // ── Auth routing ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      profileCreated.current = false;
      deviceRegistered.current = false;
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
          <Stack.Screen name="manage-users" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="activity-log" options={{ headerShown: false, presentation: 'modal' }} />
        </Stack>
      </AuthGuard>
    </ConvexAuthProvider>
  );
}
