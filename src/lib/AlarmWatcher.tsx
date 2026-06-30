import React, { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getAlarmManager } from '../native/AlarmManager';

export function AlarmWatcher() {
  const devices = useQuery(api.devices.list) ?? [];
  const router = useRouter();
  const prevAlarmingRef = useRef<Set<string>>(new Set());

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

    for (const deviceId of prev) {
      if (!currentAlarming.has(deviceId)) {
        alarmMgr.deactivateAlarm(deviceId, 'remote_unlock');
      }
    }

    prevAlarmingRef.current = currentAlarming;
  }, [devices]);

  return null;
}
