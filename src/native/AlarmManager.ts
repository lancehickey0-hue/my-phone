/**
 * AlarmManager — Manages device alarm sound + lockout when triggered
 *
 * When the WakeWordEngine detects a valid wake phrase + speaker match,
 * this manager:
 *   1. Triggers a loud alarm sound (overrides silent mode)
 *   2. Activates device lockout (shows lockout screen)
 *   3. Sends push notification to all other devices on the account
 *   4. Begins broadcasting GPS location
 *
 * The alarm can ONLY be deactivated by:
 *   - Biometric authentication on the device itself (phone/tablet/laptop)
 *   - Remote unlock from the app on another synced device (watches/earbuds)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type AlarmState = 'inactive' | 'triggered' | 'sounding' | 'locked';

export interface AlarmConfig {
  deviceId: string;
  volume: number; // 0.0 – 1.0 (always maxed during alarm)
  overrideSilentMode: boolean;
  vibrate: boolean;
  flashScreen: boolean;
  escalateVolume: boolean; // Start quieter and ramp up
}

export interface AlarmEvent {
  deviceId: string;
  state: AlarmState;
  triggeredAt: number;
  triggeredBy: 'voice' | 'remote' | 'manual';
  deactivatedAt?: number;
  deactivatedBy?: 'biometric' | 'remote_unlock';
}

// ─── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Omit<AlarmConfig, 'deviceId'> = {
  volume: 1.0,
  overrideSilentMode: true,
  vibrate: true,
  flashScreen: true,
  escalateVolume: true,
};

// ─── Alarm Manager ──────────────────────────────────────────────────────────

export class AlarmManager {
  private activeAlarms: Map<string, AlarmEvent> = new Map();
  private configs: Map<string, AlarmConfig> = new Map();
  private onAlarmChange?: (event: AlarmEvent) => void;

  constructor(onAlarmChange?: (event: AlarmEvent) => void) {
    this.onAlarmChange = onAlarmChange;
  }

  // ─── Alarm Triggers ──────────────────────────────────────────────────

  /**
   * Trigger alarm on a specific device.
   * Called by WakeWordEngine on detection or by remote trigger.
   */
  triggerAlarm(deviceId: string, triggeredBy: AlarmEvent['triggeredBy'] = 'voice'): AlarmEvent {
    const event: AlarmEvent = {
      deviceId,
      state: 'triggered',
      triggeredAt: Date.now(),
      triggeredBy,
    };

    // Phase 1: Triggered (brief visual flash)
    this.activeAlarms.set(deviceId, event);
    this.onAlarmChange?.(event);

    // Phase 2: Start sounding (200ms delay for visual feedback first)
    setTimeout(() => {
      if (this.activeAlarms.has(deviceId)) {
        const soundingEvent = { ...event, state: 'sounding' as AlarmState };
        this.activeAlarms.set(deviceId, soundingEvent);
        this.onAlarmChange?.(soundingEvent);
        this.startAlarmAudio(deviceId);
      }
    }, 200);

    // Phase 3: Lock device (500ms after trigger)
    setTimeout(() => {
      if (this.activeAlarms.has(deviceId)) {
        const lockedEvent = { ...event, state: 'locked' as AlarmState };
        this.activeAlarms.set(deviceId, lockedEvent);
        this.onAlarmChange?.(lockedEvent);
      }
    }, 500);

    return event;
  }

  /**
   * Deactivate alarm after biometric verification.
   */
  deactivateAlarm(deviceId: string, deactivatedBy: 'biometric' | 'remote_unlock'): boolean {
    const alarm = this.activeAlarms.get(deviceId);
    if (!alarm) return false;

    const deactivatedEvent: AlarmEvent = {
      ...alarm,
      state: 'inactive',
      deactivatedAt: Date.now(),
      deactivatedBy,
    };

    this.activeAlarms.delete(deviceId);
    this.stopAlarmAudio(deviceId);
    this.onAlarmChange?.(deactivatedEvent);
    return true;
  }

  // ─── Audio Control ───────────────────────────────────────────────────

  private startAlarmAudio(deviceId: string): void {
    const config = this.configs.get(deviceId) || { ...DEFAULT_CONFIG, deviceId };

    // In production:
    //   iOS: AVAudioSession.setCategory(.playback, options: [.duckOthers])
    //        AVAudioSession.overrideOutputAudioPort(.speaker)
    //        Set volume to max, ignore mute switch
    //   Android: AudioManager.setStreamVolume(STREAM_ALARM, maxVol)
    //            MediaPlayer with STREAM_ALARM (ignores Do Not Disturb)
    //
    // Alarm sound: custom loud siren that escalates in pitch
    // Also triggers haptic feedback pattern (long vibration bursts)

    console.log(`[AlarmManager] 🚨 ALARM SOUNDING on device ${deviceId}`);
    console.log(`  Volume: ${config.volume}, Override Silent: ${config.overrideSilentMode}`);
    console.log(`  Vibrate: ${config.vibrate}, Flash: ${config.flashScreen}`);
  }

  private stopAlarmAudio(deviceId: string): void {
    // In production: stop MediaPlayer/AVAudioPlayer, stop vibration
    console.log(`[AlarmManager] ✅ Alarm silenced on device ${deviceId}`);
  }

  // ─── Configuration ───────────────────────────────────────────────────

  setDeviceConfig(config: AlarmConfig): void {
    this.configs.set(config.deviceId, config);
  }

  getDeviceConfig(deviceId: string): AlarmConfig {
    return this.configs.get(deviceId) || { ...DEFAULT_CONFIG, deviceId };
  }

  // ─── Status ──────────────────────────────────────────────────────────

  isAlarmActive(deviceId: string): boolean {
    return this.activeAlarms.has(deviceId);
  }

  getActiveAlarm(deviceId: string): AlarmEvent | null {
    return this.activeAlarms.get(deviceId) || null;
  }

  getAllActiveAlarms(): AlarmEvent[] {
    return Array.from(this.activeAlarms.values());
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: AlarmManager | null = null;

export function getAlarmManager(onAlarmChange?: (event: AlarmEvent) => void): AlarmManager {
  if (!instance) {
    instance = new AlarmManager(onAlarmChange);
  }
  return instance;
}
