import React, { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getAlarmManager } from '../native/AlarmManager';

export function AlarmWatcher() {
  const devices = useQuery(api.devices.list) ?? [];
  const router = useRouter();
  const prevAlarmingRef = useRef<Set<string>>(new Set());

  // Read through a ref so this doesn't re-run the effect on every navigation.
  // The lockout screen can now also be raised natively (WakeWordService's
  // full-screen intent), so by the time this sees isAlarmActive flip we may
  // already be sitting on it — pushing again would stack a second copy.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    const alarmMgr = getAlarmManager();
    const currentAlarming = new Set(
      devices.filter((d) => d.isAlarmActive).map((d) => d._id as string)
    );
    const prev = prevAlarmingRef.current;

    for (const deviceId of currentAlarming) {
      if (!prev.has(deviceId)) {
        const device = devices.find((d) => d._id === deviceId);
        alarmMgr.triggerAlarm(deviceId, 'remote');
        if (pathnameRef.current !== '/lockout') {
          router.push({
            pathname: '/lockout',
            params: {
              deviceId,
              deviceName: device?.name ?? 'This Device',
              deviceType: device?.type ?? 'phone',
            },
          });
        }
      }
    }

    for (const deviceId of prev) {
      if (!currentAlarming.has(deviceId)) {
        alarmMgr.deactivateAlarm(deviceId, 'remote_unlock');
      }
    }

    prevAlarmingRef.current = currentAlarming;
  }, [devices]);

  return null;
}
