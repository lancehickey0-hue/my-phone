import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CONVEX_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL || 'https://cheery-buffalo-947.convex.site';

const BACKGROUND_LOCATION_TASK = 'my-phone-background-location';

function logStep(message: string, level: string = 'info') {
  fetch(`${CONVEX_SITE_URL}/logDebug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'BackgroundLocation', message, level }),
  }).catch(() => {});
}

// Mirrors the exact physicalDeviceId resolution in app/_layout.tsx's device
// registration effect (androidId first, then the stored fallback UUID) --
// deliberately NOT generating a new UUID here if both are missing, since a
// background task minting its own ID would create a phantom device that
// doesn't match whatever was actually registered at login.
async function resolvePhysicalDeviceId(): Promise<string> {
  if (Platform.OS === 'android') {
    const androidId = (Application as any).androidId;
    if (androidId) return androidId;
  } else {
    const iosId = await Application.getIosIdForVendorAsync();
    if (iosId) return iosId;
  }
  const stored = await SecureStore.getItemAsync('device_uuid');
  return stored ?? '';
}

// Defined unconditionally at module load -- required by TaskManager even
// for a headless relaunch triggered by the OS while the app is fully
// backgrounded or killed, not just while a component is mounted. This file
// is side-effect-imported once from app/_layout.tsx to guarantee that.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    logStep('task error: ' + error.message, 'error');
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const loc = locations?.[0];
  if (!loc) return;

  try {
    const physicalDeviceId = await resolvePhysicalDeviceId();
    if (!physicalDeviceId) {
      logStep('no physicalDeviceId available, skipping update', 'warn');
      return;
    }

    const res = await fetch(`${CONVEX_SITE_URL}/updateDeviceLocation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        physicalDeviceId,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      }),
    });
    if (!res.ok) {
      logStep('updateDeviceLocation returned ' + res.status, 'warn');
    }
  } catch (e: any) {
    logStep('failed to report location: ' + (e?.message ?? String(e)), 'error');
  }
});

// Call once, after location_background permission is confirmed granted
// (see wake-word-setup.tsx). Safe to call more than once -- checks whether
// tracking already started before requesting it again.
export async function startBackgroundLocationTracking() {
  try {
    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (alreadyStarted) {
      logStep('already tracking, skipped');
      return;
    }

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000,
      distanceInterval: 20,
      foregroundService: {
        notificationTitle: 'My-Phone',
        notificationBody: 'Now tracking your device with My-Phone',
      },
    });
    logStep('started');
  } catch (e: any) {
    logStep('failed to start: ' + (e?.message ?? String(e)), 'error');
  }
}
