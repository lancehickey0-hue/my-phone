import { Audio } from 'expo-av';
import { NativeModules, Platform, Vibration } from 'react-native';

// On Android the wake-word service owns the siren (it keeps playing with
// the app backgrounded and forces alarm volume to max). JS only plays its
// own copy when that service isn't running, so there's never two sirens.
const { WakeWordModule } = NativeModules;

async function startNativeSiren(): Promise<boolean> {
  if (Platform.OS !== 'android' || !WakeWordModule?.startAlarm) return false;
  try {
    return !!(await WakeWordModule.startAlarm());
  } catch {
    return false;
  }
}

function stopNativeSiren() {
  if (Platform.OS === 'android') WakeWordModule?.stopAlarm?.();
}

export type AlarmState = 'inactive' | 'triggered' | 'sounding' | 'locked';

export interface AlarmConfig {
  deviceId: string;
  volume: number;
  overrideSilentMode: boolean;
  vibrate: boolean;
  flashScreen: boolean;
  escalateVolume: boolean;
}

export interface AlarmEvent {
  deviceId: string;
  state: AlarmState;
  triggeredAt: number;
  triggeredBy: 'voice' | 'remote' | 'manual';
  deactivatedAt?: number;
  deactivatedBy?: 'biometric' | 'remote_unlock';
}

const DEFAULT_CONFIG: Omit<AlarmConfig, 'deviceId'> = {
  volume: 1.0,
  overrideSilentMode: true,
  vibrate: true,
  flashScreen: true,
  escalateVolume: true,
};

const VIBRATION_PATTERN = [0, 500, 200, 500, 200, 500, 200, 500];

export class AlarmManager {
  private activeAlarms: Map<string, AlarmEvent> = new Map();
  private configs: Map<string, AlarmConfig> = new Map();
  private soundObject: Audio.Sound | null = null;
  private onAlarmChange?: (event: AlarmEvent) => void;

  constructor(onAlarmChange?: (event: AlarmEvent) => void) {
    this.onAlarmChange = onAlarmChange;
  }

  triggerAlarm(deviceId: string, triggeredBy: AlarmEvent['triggeredBy'] = 'voice'): AlarmEvent {
    const event: AlarmEvent = {
      deviceId,
      state: 'triggered',
      triggeredAt: Date.now(),
      triggeredBy,
    };

    this.activeAlarms.set(deviceId, event);
    this.onAlarmChange?.(event);

    setTimeout(() => {
      if (this.activeAlarms.has(deviceId)) {
        const soundingEvent = { ...event, state: 'sounding' as AlarmState };
        this.activeAlarms.set(deviceId, soundingEvent);
        this.onAlarmChange?.(soundingEvent);
        this.startAlarmAudio(deviceId);
      }
    }, 200);

    setTimeout(() => {
      if (this.activeAlarms.has(deviceId)) {
        const lockedEvent = { ...event, state: 'locked' as AlarmState };
        this.activeAlarms.set(deviceId, lockedEvent);
        this.onAlarmChange?.(lockedEvent);
      }
    }, 500);

    return event;
  }

  deactivateAlarm(deviceId: string, deactivatedBy: 'biometric' | 'remote_unlock'): boolean {
    // Always silence the native siren -- it may have been started by the
    // wake-word service while this JS instance wasn't running, in which
    // case there's no entry in activeAlarms.
    stopNativeSiren();

    const alarm = this.activeAlarms.get(deviceId);
    if (!alarm) {
      this.stopAlarmAudio();
      return false;
    }

    const deactivatedEvent: AlarmEvent = {
      ...alarm,
      state: 'inactive',
      deactivatedAt: Date.now(),
      deactivatedBy,
    };

    this.activeAlarms.delete(deviceId);
    this.stopAlarmAudio();
    this.onAlarmChange?.(deactivatedEvent);
    return true;
  }

  private async startAlarmAudio(deviceId: string): Promise<void> {
    const config = this.configs.get(deviceId) || { ...DEFAULT_CONFIG, deviceId };
    if (await startNativeSiren()) {
      if (config.vibrate) Vibration.vibrate(VIBRATION_PATTERN, true);
      return;
    }
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });

      if (this.soundObject) {
        await this.soundObject.stopAsync();
        await this.soundObject.unloadAsync();
        this.soundObject = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/audio/alarm.mp3'),
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );

      this.soundObject = sound;

      if (config.vibrate) Vibration.vibrate(VIBRATION_PATTERN, true);
    } catch (e) {
      console.error('[AlarmManager] Failed to start audio:', e);
      Vibration.vibrate(VIBRATION_PATTERN, true);
    }
  }

  private async stopAlarmAudio(): Promise<void> {
    try {
      Vibration.cancel();
      if (this.soundObject) {
        await this.soundObject.stopAsync();
        await this.soundObject.unloadAsync();
        this.soundObject = null;
      }
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    } catch (e) {
      console.error('[AlarmManager] Failed to stop audio:', e);
    }
  }

  setDeviceConfig(config: AlarmConfig): void { this.configs.set(config.deviceId, config); }
  getDeviceConfig(deviceId: string): AlarmConfig { return this.configs.get(deviceId) || { ...DEFAULT_CONFIG, deviceId }; }
  isAlarmActive(deviceId: string): boolean { return this.activeAlarms.has(deviceId); }
  getActiveAlarm(deviceId: string): AlarmEvent | null { return this.activeAlarms.get(deviceId) || null; }
  getAllActiveAlarms(): AlarmEvent[] { return Array.from(this.activeAlarms.values()); }
}

let instance: AlarmManager | null = null;

export function getAlarmManager(onAlarmChange?: (event: AlarmEvent) => void): AlarmManager {
  if (!instance) instance = new AlarmManager(onAlarmChange);
  return instance;
}
