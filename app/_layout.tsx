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
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { getAlarmManager } from '../src/native/AlarmManager';
import * as Location from 'expo-location';
import { startBackgroundLocationTracking } from '../src/lib/BackgroundLocation';
import {
  defaultDeviceName,
  getOrCreateDeviceSecret,
  getPhysicalDeviceId,
} from '../src/lib/deviceIdentity';

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

function logGlobalInfo(message: string) {
  fetch(`${GLOBAL_ERROR_CONVEX_URL}/logDebug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'DeviceLink', message, level: 'info' }),
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
  const claimThisDevice = useMutation(api.deviceAuth.claimThisDevice);
  const devices = useQuery(api.devices.list) ?? [];
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const segments = useSegments();
  const router = useRouter();
  const profileCreated = useRef(false);
  const deviceRegistered = useRef(false);
  const [setupChecked, setSetupChecked] = useState(false);

  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  // Opens the lockout screen for THIS install's device, once. Guarded so a
  // wake-word event, a push notification and AlarmWatcher firing for the
  // same alarm don't stack three lockout screens.
  const openLockoutForThisDevice = (deviceId?: string) => {
    const physicalId = (globalThis as any).__myPhoneDeviceId;
    const myDevice = devicesRef.current.find((d) => d.physicalDeviceId === physicalId);
    // Only ever lock out the phone that's actually alarming.
    if (deviceId && myDevice && deviceId !== myDevice._id) return;
    if (segmentsRef.current[0] === 'lockout') return;
    if (myDevice) getAlarmManager().triggerAlarm(myDevice._id, 'voice');
    router.push({
      pathname: '/lockout',
      params: myDevice
        ? { deviceId: myDevice._id, deviceName: myDevice.name, deviceType: myDevice.type }
        : {},
    });
  };
  const openLockoutRef = useRef(openLockoutForThisDevice);
  openLockoutRef.current = openLockoutForThisDevice;

  // ── Wake word listener ────────────────────────────────────────────────────
  // The native WakeWordService has already started the siren and flipped
  // the alarm on in Convex by the time this fires (it does both itself so
  // they work with the app backgrounded). JS only needs to show lockout.
  useEffect(() => {
    if (!isAuthenticated) return;
    const { WakeWordModule } = NativeModules;
    if (!WakeWordModule) return;

    const emitter = new NativeEventEmitter(WakeWordModule);
    const sub = emitter.addListener('WakeWordDetected', () => {
      openLockoutRef.current();
    });

    return () => sub.remove();
  }, [isAuthenticated]);

  // ── Incoming push notification listener ──────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    const handle = (data: any) => {
      if (data?.type === 'alarm' && data?.deviceId) {
        openLockoutRef.current(String(data.deviceId));
      }
    };
    const sub = Notifications.addNotificationReceivedListener((n) =>
      handle(n.request.content.data),
    );
    const tapSub = Notifications.addNotificationResponseReceivedListener((r) =>
      handle(r.notification.request.content.data),
    );

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
      deviceRegistered.current = true;

      (async () => {
        // 1. Resolve this install's stable ID and publish it for the rest
        //    of the app (wake word, LockWatcher, heartbeat all read it).
        let physicalDeviceId = '';
        try {
          physicalDeviceId = await getPhysicalDeviceId();
          (globalThis as any).__myPhoneDeviceId = physicalDeviceId;
        } catch (e) {
          console.warn('Could not get device ID:', e);
        }

        // 2. Profile must exist first — claimThisDevice reads maxDevices.
        try {
          await ensureProfile();
        } catch {
          profileCreated.current = false;
          deviceRegistered.current = false;
          return;
        }
        if (!physicalDeviceId) return;

        // 3. Link this install to its device record automatically and
        //    register the secret its headless calls authenticate with.
        try {
          const deviceSecret = await getOrCreateDeviceSecret();
          const deviceId = await claimThisDevice({
            physicalDeviceId,
            deviceSecret,
            defaultName: defaultDeviceName(),
          });
          logGlobalInfo(
            deviceId
              ? 'device linked: ' + deviceId
              : 'device not linked: plan device limit reached',
          );
        } catch (e: any) {
          deviceRegistered.current = false;
          logGlobalError('claimThisDevice failed: ' + (e?.message ?? String(e)));
          return;
        }

        // 4. Background tracking was previously only started from the
        //    one-time wake-word-setup screen. Restart it on every launch
        //    when the permission is already granted.
        try {
          const { status } = await Location.getBackgroundPermissionsAsync();
          if (status === 'granted') await startBackgroundLocationTracking();
        } catch {}
      })();
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
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  // Fonts are bundled, so this is a few frames at most. On error, carry on
  // with the system font rather than blocking the app.
  if (!fontsLoaded && !fontError) return null;

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
          <Stack.Screen
            name="lockout"
            options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
          />
          <Stack.Screen name="wake-word-setup" options={{ headerShown: false }} />
          <Stack.Screen name="device-setup" options={{ headerShown: false }} />
          <Stack.Screen name="voice-setup" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="biometric-setup" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="manage-users" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="activity-log" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="manage-devices" options={{ headerShown: false }} />
        </Stack>
      </AuthGuard>
    </ConvexAuthProvider>
  );
}
