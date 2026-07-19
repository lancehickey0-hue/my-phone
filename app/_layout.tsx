import 'react-native-get-random-values';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { convex } from '../src/lib/convex';
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

const nativeStorage = Platform.OS !== 'web' ? {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
} : undefined;

// -- Global error/crash logging --------------------------------------------
// Catches anything that isn't already explicitly logged elsewhere: uncaught
// JS exceptions and unhandled promise rejections, app-wide, regardless of
// auth state. Runs once at module load. Doesn't replace the existing crash
// UI/behavior (the original handler still runs after logging) -- just also
// reports it to Convex so it shows up in the dashboard instead of silently
// vanishing. This is what would have caught tonight's JWT_PRIVATE_KEY
// sign-in crash automatically, without needing to manually instrument the
// auth code that threw it.
const GLOBAL_ERROR_CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL || 'https://cheery-buffalo-947.convex.site';

function logGlobalError(message: string) {
  fetch(`${GLOBAL_ERROR_CONVEX_URL}/logDebug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'GlobalError', message, level: 'error' }),
  }).catch(() => {});
}

const rnGlobal = global as any;
const defaultErrorHandler = rnGlobal.ErrorUtils?.getGlobalHandler?.();
rnGlobal.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
  logGlobalError(
    (isFatal ? 'FATAL: ' : 'non-fatal: ') +
    (error?.message ?? String(error)) +
    (error?.stack ? ' | ' + error.stack : '')
  );
  defaultErrorHandler?.(error, isFatal);
});

rnGlobal.addEventListener?.('unhandledRejection', (event: any) => {
  const reason = event?.reason;
  logGlobalError(
    'Unhandled promise rejection: ' +
    (reason?.message ?? String(reason)) +
    (reason?.stack ? ' | ' + reason.stack : '')
  );
});

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

    return () => sub.remove();
  }, [isAuthenticated]);

  // ── Incoming push notification listener ──────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

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
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    if (currentUser === undefined) return;
    if (currentUser === null) {
      signOut();
    }
  }, [isAuthenticated, isLoading, currentUser]);

  // ── Wake word setup check ─────────────────────────────────────────────────
  // Runs independent of auth state entirely — permissions + Vosk download
  // happen before we know or care whether someone's logged in.
  useEffect(() => {
    if (setupChecked) return;

    const inWakeWordSetup = segments[0] === 'wake-word-setup';
    const inLockout = segments[0] === 'lockout';

    if (inWakeWordSetup || inLockout) return;

    SecureStore.getItemAsync('wake_word_setup_done').then((done) => {
      setSetupChecked(true);
      if (done !== 'true') {
        router.replace('/wake-word-setup');
      }
    });
  }, [segments, setupChecked]);

  // ── Auth routing ──────────────────────────────────────────────────────────
  // (tabs) is only ever reached once currentUser resolves to a real,
  // server-confirmed user — never speculatively. If isAuthenticated is
  // false, or claims true but currentUser turns out null (ghost session),
  // we go straight to /auth. While currentUser is still resolving
  // (undefined) we simply wait — the Stack's initial screen is /auth, not
  // (tabs), so there's nothing sensitive on screen during that wait.
  useEffect(() => {
    if (isLoading || !setupChecked) return;

    const inWakeWordSetup = segments[0] === 'wake-word-setup';
    if (inWakeWordSetup) return;

    if (!isAuthenticated || currentUser === null) {
      profileCreated.current = false;
      deviceRegistered.current = false;
      if (segments[0] !== 'auth') {
        router.replace('/auth');
      }
      return;
    }

    if (currentUser === undefined) return;

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

    // Real, confirmed user — safe to enter the app now. Post-login
    // permissions (notifications, mic, phone_state, device_admin) still
    // need to be requested once per install — see device-setup.tsx.
    if (segments[0] === 'auth' || segments[0] === 'wake-word-setup') {
      SecureStore.getItemAsync('post_login_permissions_done').then((done) => {
        router.replace(done === 'true' ? '/(tabs)' : '/device-setup');
      });
    }
  }, [isAuthenticated, isLoading, currentUser, segments, setupChecked]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ConvexAuthProvider client={convex} storage={nativeStorage}>
      <StatusBar style="light" />
      <AuthGuard>
        <Stack
          initialRouteName="auth"
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
          <Stack.Screen name="device-setup" options={{ headerShown: false }} />
          <Stack.Screen name="voice-setup" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="biometric-setup" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="manage-users" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="activity-log" options={{ headerShown: false, presentation: 'modal' }} />
        </Stack>
      </AuthGuard>
    </ConvexAuthProvider>
  );
}
