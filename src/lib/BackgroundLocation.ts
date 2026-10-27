import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { readDeviceSecret, readPhysicalDeviceId } from './deviceIdentity';

const CONVEX_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL || 'https://cheery-buffalo-947.convex.site';

const BACKGROUND_LOCATION_TASK = 'my-phone-background-location';

function logStep(message: string, level: string = 'info') {
  fetch(`${CONVEX_SITE_URL}/logDebug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'BackgroundLocation', message, level }),
  }).catch(() => {});
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
    const [physicalDeviceId, deviceSecret] = await Promise.all([
      readPhysicalDeviceId(),
      readDeviceSecret(),
    ]);
    if (!physicalDeviceId || !deviceSecret) {
      logStep('device not linked yet (no id/secret), skipping update', 'warn');
      return;
    }

    const res = await fetch(`${CONVEX_SITE_URL}/updateDeviceLocation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        physicalDeviceId,
        deviceSecret,
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
