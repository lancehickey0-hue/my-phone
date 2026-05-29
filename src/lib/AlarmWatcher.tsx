import React, { useEffect, useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { startAlarm, stopAlarm } from './AlarmManager';

export function AlarmWatcher() {
  const devices = useQuery(api.devices.list) ?? [];
  const wasAlarming = useRef(false);

  useEffect(() => {
    const anyAlarming = devices.some(d => d.isAlarmActive);
    
    if (anyAlarming && !wasAlarming.current) {
      wasAlarming.current = true;
      startAlarm();
    } else if (!anyAlarming && wasAlarming.current) {
      wasAlarming.current = false;
      stopAlarm();
    }
  }, [devices]);

  return null;
}
