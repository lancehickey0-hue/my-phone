import { useEffect, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

const { WakeWordModule } = NativeModules;

// Mirrors AlarmWatcher's pattern, but scoped to only the device this code is
// actually running on — locking is a local, physical action (DevicePolicyManager
// .lockNow()), unlike the alarm, so it must never fire for a device merely being
// viewed from someone else's session.
export function LockWatcher() {
  const devices = useQuery(api.devices.list) ?? [];
  const wasLockedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !WakeWordModule?.lockDevice) return;

    const physicalId = (globalThis as any).__myPhoneDeviceId;
    if (!physicalId) return;

    const myDevice = devices.find((d: any) => d.physicalDeviceId === physicalId);
    if (!myDevice) return;

    const isLockedNow = !!(myDevice as any).isLocked;

    if (isLockedNow && !wasLockedRef.current) {
      WakeWordModule.lockDevice().catch((e: any) => {
        console.warn('[LockWatcher] Native lockDevice failed (is device admin granted?):', e);
      });
    }

    wasLockedRef.current = isLockedNow;
  }, [devices]);

  return null;
}
