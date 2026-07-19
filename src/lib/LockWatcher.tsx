import { useEffect, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

const { WakeWordModule } = NativeModules;

const CONVEX_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL || 'https://cheery-buffalo-947.convex.site';

function logStep(message: string, level: string = 'info') {
  fetch(`${CONVEX_SITE_URL}/logDebug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'LockWatcher', message, level }),
  }).catch(() => {});
}

// Mirrors AlarmWatcher's pattern, but scoped to only the device this code is
// actually running on — locking is a local, physical action (DevicePolicyManager
// .lockNow()), unlike the alarm, so it must never fire for a device merely being
// viewed from someone else's session.
export function LockWatcher() {
  const devices = useQuery(api.devices.list) ?? [];
  const wasLockedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !WakeWordModule?.lockDevice) return;
    if (devices.length === 0) return;

    let cancelled = false;
    (async () => {
      // physicalId is set asynchronously elsewhere (globalThis, not React
      // state), so it may not exist yet even after `devices` has loaded —
      // same race already fixed in the GPS effect and wake-service-start
      // effect in (tabs)/_layout.tsx. Without this poll, the lock could
      // silently never fire if this effect's first run lost the race.
      let physicalId = (globalThis as any).__myPhoneDeviceId;
      let attempts = 0;
      while (!physicalId && attempts < 20 && !cancelled) {
        await new Promise((r) => setTimeout(r, 500));
        physicalId = (globalThis as any).__myPhoneDeviceId;
        attempts++;
      }
      if (!physicalId || cancelled) return;

      const myDevice = devices.find((d: any) => d.physicalDeviceId === physicalId);
      if (!myDevice) return;

      const isLockedNow = !!(myDevice as any).isLocked;

      if (isLockedNow && !wasLockedRef.current) {
        logStep('isLocked true — calling native lockDevice()');
        try {
          await WakeWordModule.lockDevice();
          logStep('lockDevice() succeeded');
        } catch (e: any) {
          logStep('lockDevice() FAILED: ' + (e?.message ?? String(e)));
          console.warn('[LockWatcher] Native lockDevice failed (is device admin granted?):', e);
        }
      }

      wasLockedRef.current = isLockedNow;
    })();

    return () => { cancelled = true; };
  }, [devices]);

  return null;
}
