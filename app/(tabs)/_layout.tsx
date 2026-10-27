import { Tabs } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { AppState, Platform, NativeModules, PermissionsAndroid } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { api } from '../../convex/_generated/api';
import { AlarmWatcher } from '../../src/lib/AlarmWatcher';
import { LockWatcher } from '../../src/lib/LockWatcher';
import { getPhraseVariants } from '../../src/lib/deviceIcons';
import { colors, fonts } from '../../src/lib/theme';
import { Icon } from '../../src/components/Icon';
import { readDeviceSecret } from '../../src/lib/deviceIdentity';
import { calibrateThreshold } from '../../convex/voiceMath';

const { WakeWordModule } = NativeModules;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Only a completed training counts. No training = no voiceprint = the
// service ignores the wake phrase from everyone.
function voiceConfigFor(e: any): { referenceVector?: number[]; matchThreshold?: number } {
  if (!e?.isEnrolled || !e.referenceVector?.length) return {};
  return {
    referenceVector: e.referenceVector,
    matchThreshold: e.matchThreshold ?? calibrateThreshold(e.sampleVectors ?? []),
  };
}

function HeartbeatManager() {
  const devices = useQuery(api.devices.list) ?? [];
  const voiceEnrollments = useQuery(api.voiceEnrollment.listEnrollments) ?? [];
  const heartbeat = useMutation(api.devices.heartbeat);
  const markOffline = useMutation(api.devices.markOffline);
  const updateLocation = useMutation(api.devices.updateLocation);
  const registerPhysicalDevice = useMutation(api.devices.registerPhysicalDevice);

  // Register push notification token and link to the physical device record
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: 'a57089db-f8e0-4314-888b-29c19c9665cb',
        });
        const expoPushToken = tokenData.data;

        const physicalId = (globalThis as any).__myPhoneDeviceId;
        if (!physicalId || devices.length === 0) return;

        const myDevice = devices.find((d) => d.physicalDeviceId === physicalId);
        if (myDevice && myDevice.expoPushToken !== expoPushToken) {
          await registerPhysicalDevice({
            deviceId: myDevice._id,
            physicalDeviceId: physicalId,
            expoPushToken,
          });
        }
      } catch (e) {
        console.warn('[PushToken] Failed to register:', e);
      }
    })();
  }, [devices.length]);

  // Start the wake word listening service with this device's *real*
  // phrase, now that we're authenticated and know which device this is.
  // Deliberately not done in wake-word-setup.tsx — that screen runs before
  // login, when there's no account yet to look up a phrase from, and
  // querying an account-scoped table pre-login is what caused the crash
  // this replaced. Guarded by a ref so it only fires once per app session.
  const wakeServiceStarted = useRef(false);
  useEffect(() => {
    if (wakeServiceStarted.current) return;
    if (Platform.OS !== 'android' || !WakeWordModule?.startService) return;
    if (devices.length === 0) return;

    let cancelled = false;
    (async () => {
      // physicalId is set asynchronously elsewhere (globalThis, not React
      // state), so it may not exist yet even after `devices` has loaded —
      // same race the GPS effect below already has to poll around.
      let physicalId = (globalThis as any).__myPhoneDeviceId;
      let attempts = 0;
      while (!physicalId && attempts < 20 && !cancelled) {
        await new Promise((r) => setTimeout(r, 500));
        physicalId = (globalThis as any).__myPhoneDeviceId;
        attempts++;
      }
      if (!physicalId || cancelled || wakeServiceStarted.current) return;

      const myDevice = devices.find((d) => d.physicalDeviceId === physicalId);
      if (!myDevice) return;

      // Defensive gate, not just assumed from timing: mic is requested in
      // device-setup.tsx post-login, but startService() requires
      // RECORD_AUDIO actually granted (Android 14 foregroundServiceType
      // requirement) -- check for real rather than trusting screen order.
      if (Platform.OS === 'android') {
        const micGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (!micGranted) {
          fetch(`${process.env.EXPO_PUBLIC_CONVEX_SITE_URL || 'https://cheery-buffalo-947.convex.site'}/logDebug`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'WakeWordService', message: 'startService skipped -- RECORD_AUDIO not granted', level: 'error' }),
          }).catch(() => {});
          return;
        }
      }

      wakeServiceStarted.current = true;
      const rawPhrase = (myDevice as any).customWakePhrase || (myDevice as any).wakePhrase || 'Hey, My-Phone, where are you?';

      // If this device has completed voice enrollment, its reference
      // voiceprint gets included so the native side can require an actual
      // voice match, not just the right words -- see WakeWordService.kt.
      // Devices without enrollment yet fall back to phrase-match-only
      // behavior (referenceVector simply omitted).
      const myEnrollment = voiceEnrollments.find((e) => e.deviceId === myDevice._id);
      const { referenceVector, matchThreshold } = voiceConfigFor(myEnrollment);

      // The native service calls Convex directly (alarm trigger, lock
      // poll) and must authenticate with this install's secret.
      // (wakeServiceStarted is already set, so start even if this effect
      // re-ran meanwhile — otherwise the service would never start.)
      const deviceSecret = await readDeviceSecret();

      WakeWordModule.startService(JSON.stringify({
        phrases: getPhraseVariants(rawPhrase),
        physicalDeviceId: physicalId,
        deviceSecret,
        referenceVector,
        matchThreshold,
      }));
    })();

    return () => { cancelled = true; };
  }, [devices]);

  // Retraining (or first training) must take effect right away: push the
  // new voiceprint + threshold to the running service whenever they change.
  const physicalIdForVoice = (globalThis as any).__myPhoneDeviceId;
  const myVoiceDevice = devices.find((d) => d.physicalDeviceId === physicalIdForVoice);
  const myVoiceEnrollment = myVoiceDevice
    ? voiceEnrollments.find((e) => e.deviceId === myVoiceDevice._id)
    : undefined;
  const voiceKey = myVoiceEnrollment
    ? `${myVoiceEnrollment.isEnrolled}:${myVoiceEnrollment.enrolledAt ?? 0}:${myVoiceEnrollment.matchThreshold ?? ''}`
    : 'none';
  const lastVoiceKey = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'android' || !WakeWordModule?.updateVoiceConfig) return;
    if (!myVoiceDevice) return;
    if (lastVoiceKey.current === voiceKey) return;
    const first = lastVoiceKey.current === null;
    lastVoiceKey.current = voiceKey;
    if (first) return; // startService already sent the initial config
    WakeWordModule.updateVoiceConfig(JSON.stringify(voiceConfigFor(myVoiceEnrollment)));
  }, [voiceKey, myVoiceDevice?._id]);

  // GPS location tracking — update this device's location in Convex
  useEffect(() => {
    let locationSub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      let physicalId = (globalThis as any).__myPhoneDeviceId;
      let attempts = 0;
      while (!physicalId && attempts < 20 && !cancelled) {
        await new Promise((r) => setTimeout(r, 500));
        physicalId = (globalThis as any).__myPhoneDeviceId;
        attempts++;
      }
      if (!physicalId || cancelled) return;

      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        if (devices.length === 0) return;
        const myDevice = devices.find((d) => d.physicalDeviceId === physicalId);
        if (!myDevice) return;

        locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000,
            distanceInterval: 20,
          },
          async (loc) => {
            try {
              let locationName: string | undefined;
              try {
                const [place] = await Location.reverseGeocodeAsync({
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                });
                if (place) {
                  locationName = [place.street, place.city, place.region]
                    .filter(Boolean)
                    .join(', ');
                }
              } catch (_) {}

              await updateLocation({
                deviceId: myDevice._id,
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                locationName,
              });
            } catch (e) {
              console.warn('[Location] updateLocation failed:', e);
            }
          }
        );
      } catch (e) {
        console.warn('[Location] watchPositionAsync failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      locationSub?.remove();
    };
  }, [devices.length]);

  // Heartbeat every 30s + mark offline on background
useEffect(() => {
  const physicalId = (globalThis as any).__myPhoneDeviceId;
  const myDevice = devices.find((d) => d.physicalDeviceId === physicalId);
  if (!myDevice) return;

  heartbeat({ deviceId: myDevice._id }).catch(() => {});

  const interval = setInterval(() => {
    heartbeat({ deviceId: myDevice._id }).catch(() => {});
  }, 30000);

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      markOffline({ deviceId: myDevice._id }).catch(() => {});
    } else if (state === 'active') {
      heartbeat({ deviceId: myDevice._id }).catch(() => {});
    }
  });

  return () => {
    clearInterval(interval);
    subscription.remove();
  };
 }, [devices.length]);

 return null;
}

export default function TabsLayout() {
  return (
    <>
      <HeartbeatManager />
      <AlarmWatcher />
      <LockWatcher />
      <Tabs
        screenOptions={{
          // Each screen draws its own big header (logo + title).
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.bgTabBar,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 84,
            paddingBottom: 22,
            paddingTop: 10,
          },
          tabBarActiveTintColor: colors.gold,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 12 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Find', tabBarIcon: ({ color }) => <Icon name="pin" color={color} /> }}
        />
        <Tabs.Screen
          name="this-phone"
          options={{ title: 'This Phone', tabBarIcon: ({ color }) => <Icon name="shield" color={color} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Settings', tabBarIcon: ({ color }) => <Icon name="settings" color={color} /> }}
        />
      </Tabs>
    </>
  );
}
