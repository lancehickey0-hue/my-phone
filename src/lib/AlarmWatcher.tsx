import { useEffect, useRef } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getAlarmManager } from '../native/AlarmManager';

// Sounds the alarm and shows the lockout screen ONLY when the device this
// code is running on is the one alarming. Previously it reacted to every
// device on the account, so triggering your lost phone from your tablet
// also made the tablet blare and lock itself out.
//
// Also covers the cold-start case: if the alarm was triggered while the
// app's JS wasn't running (wake word heard natively, or remote trigger),
// opening the app lands straight on the lockout screen.
export function AlarmWatcher() {
  const devices = useQuery(api.devices.list);
  const router = useRouter();
  const segments = useSegments();
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const wasAlarmingRef = useRef(false);

  useEffect(() => {
    if (!devices) return;

    let cancelled = false;
    (async () => {
      // physicalId is published by app/_layout.tsx after sign-in.
      let physicalId = (globalThis as any).__myPhoneDeviceId;
      let attempts = 0;
      while (!physicalId && attempts < 20 && !cancelled) {
        await new Promise((r) => setTimeout(r, 500));
        physicalId = (globalThis as any).__myPhoneDeviceId;
        attempts++;
      }
      if (!physicalId || cancelled) return;

      const myDevice = devices.find((d) => d.physicalDeviceId === physicalId);
      const alarming = !!myDevice?.isAlarmActive;
      const alarmMgr = getAlarmManager();

      if (alarming && !wasAlarmingRef.current && myDevice) {
        alarmMgr.triggerAlarm(myDevice._id, 'remote');
        if (segmentsRef.current[0] !== 'lockout') {
          router.push({
            pathname: '/lockout',
            params: {
              deviceId: myDevice._id,
              deviceName: myDevice.name,
              deviceType: myDevice.type,
            },
          });
        }
      } else if (!alarming && wasAlarmingRef.current && myDevice) {
        // Cleared elsewhere (e.g. "Stop alarm" from another device).
        alarmMgr.deactivateAlarm(myDevice._id, 'remote_unlock');
        if (segmentsRef.current[0] === 'lockout') router.replace('/(tabs)');
      }

      wasAlarmingRef.current = alarming;
    })();

    return () => {
      cancelled = true;
    };
  }, [devices]);

  return null;
}
