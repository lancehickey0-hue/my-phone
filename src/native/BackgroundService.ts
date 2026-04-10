/**
 * BackgroundService — Keeps wake word detection running when the app is backgrounded
 *
 * This is critical for a device locator — the engine MUST be listening even when
 * the user isn't actively using the app.
 *
 * Platform strategies:
 *
 *   iOS:
 *   - Background Audio mode (UIBackgroundModes: audio)
 *   - Background Processing tasks (BGTaskScheduler)
 *   - Silent push notifications to wake the app
 *   - Significant location change monitoring as a keep-alive
 *   - AVAudioSession with .playAndRecord category, mixWithOthers option
 *
 *   Android:
 *   - Foreground Service with persistent notification (TYPE_MICROPHONE)
 *   - Partial wake lock for CPU during processing
 *   - Battery optimization exemption request
 *   - WorkManager for periodic health checks
 */

import { getWakeWordEngine } from './WakeWordEngine';
import { getAlarmManager } from './AlarmManager';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BackgroundServiceConfig {
  enableAlwaysOn: boolean; // Keep listening 24/7
  batteryOptimized: boolean; // Reduce processing to save battery
  showNotification: boolean; // Android: foreground service notification
  notificationTitle: string;
  notificationBody: string;
  wakeOnPush: boolean; // Wake from deep sleep via push notification
  gpsUpdateInterval: number; // ms — how often to update location in background
}

export interface ServiceStatus {
  isActive: boolean;
  startedAt: number | null;
  uptime: number; // ms
  detectionsSinceStart: number;
  batteryUsageEstimate: number; // percentage per hour estimate
  lastHealthCheck: number;
}

// ─── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BackgroundServiceConfig = {
  enableAlwaysOn: true,
  batteryOptimized: true,
  showNotification: true,
  notificationTitle: 'My-Phone is protecting your devices',
  notificationBody: 'Listening for wake phrases...',
  wakeOnPush: true,
  gpsUpdateInterval: 30_000, // 30 seconds
};

// ─── Background Service ─────────────────────────────────────────────────────

export class BackgroundService {
  private config: BackgroundServiceConfig;
  private isActive: boolean = false;
  private startedAt: number | null = null;
  private detectionCount: number = 0;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private lastHealthCheck: number = 0;

  constructor(config?: Partial<BackgroundServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────

  /**
   * Start the background service.
   * Must be called after user grants microphone + background permissions.
   */
  async start(): Promise<boolean> {
    if (this.isActive) return true;

    // Check permissions first
    const hasPermissions = await this.checkPermissions();
    if (!hasPermissions) {
      console.warn('[BackgroundService] Missing required permissions');
      return false;
    }

    // Start the wake word engine
    const engine = getWakeWordEngine();
    engine.setBatteryOptimization(this.config.batteryOptimized);
    engine.setBackgroundMode(true);
    await engine.start();

    // Wire up detection → alarm
    engine.on('detection', (detection) => {
      this.detectionCount++;
      const alarmMgr = getAlarmManager();
      alarmMgr.triggerAlarm(detection.deviceId, 'voice');
    });

    // Start health check (verify engine is still running)
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 60_000); // Every minute

    this.isActive = true;
    this.startedAt = Date.now();
    this.lastHealthCheck = Date.now();

    // In production:
    //   iOS: Start background audio session
    //   Android: Start foreground service with notification
    this.startPlatformBackground();

    console.log('[BackgroundService] ✅ Started — listening for wake phrases');
    return true;
  }

  /**
   * Stop the background service.
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    const engine = getWakeWordEngine();
    await engine.stop();

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.isActive = false;
    this.stopPlatformBackground();

    console.log('[BackgroundService] ⏹️ Stopped');
  }

  // ─── Permissions ─────────────────────────────────────────────────────

  private async checkPermissions(): Promise<boolean> {
    // In production, check:
    //   1. Microphone permission (required)
    //   2. Background audio/processing (required)
    //   3. Location permission (for GPS broadcasting)
    //   4. Notification permission (for alarm notifications)
    //   5. Battery optimization exemption (Android — recommended)

    // Simulated: always return true
    return true;
  }

  /**
   * Request all necessary permissions from the user.
   * Should be called during onboarding.
   */
  async requestPermissions(): Promise<{
    microphone: boolean;
    background: boolean;
    location: boolean;
    notifications: boolean;
    batteryExemption: boolean;
  }> {
    // In production: use expo-permissions / react-native-permissions
    return {
      microphone: true,
      background: true,
      location: true,
      notifications: true,
      batteryExemption: true,
    };
  }

  // ─── Platform Background ─────────────────────────────────────────────

  private startPlatformBackground(): void {
    // iOS:
    //   const audioSession = AVAudioSession.sharedInstance()
    //   audioSession.setCategory('playAndRecord', ['mixWithOthers', 'allowBluetooth'])
    //   audioSession.setActive(true)
    //   BGTaskScheduler.shared.register('com.myphone.wakeword', ...)
    //   UIApplication.shared.beginBackgroundTask(...)
    //
    // Android:
    //   startForegroundService(intent)
    //   val notification = NotificationCompat.Builder(...)
    //     .setContentTitle(config.notificationTitle)
    //     .setContentText(config.notificationBody)
    //     .setSmallIcon(R.drawable.infinity_icon)
    //     .setOngoing(true)
    //     .build()
    //   startForeground(NOTIFICATION_ID, notification, FOREGROUND_SERVICE_TYPE_MICROPHONE)
  }

  private stopPlatformBackground(): void {
    // iOS: deactivate audio session, cancel background tasks
    // Android: stop foreground service
  }

  // ─── Health Check ────────────────────────────────────────────────────

  private performHealthCheck(): void {
    const engine = getWakeWordEngine();
    const status = engine.getStatus();

    this.lastHealthCheck = Date.now();

    if (!status.isRunning && this.isActive) {
      console.warn('[BackgroundService] ⚠️ Engine stopped unexpectedly, restarting...');
      engine.start();
    }

    if (!status.isListening && this.isActive) {
      console.warn('[BackgroundService] ⚠️ Engine paused, resuming...');
      engine.resume();
    }

    // Log health metrics
    console.log(`[BackgroundService] Health check — Models: ${status.activeModels}, Running: ${status.isRunning}`);
  }

  // ─── Status ──────────────────────────────────────────────────────────

  getStatus(): ServiceStatus {
    return {
      isActive: this.isActive,
      startedAt: this.startedAt,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      detectionsSinceStart: this.detectionCount,
      batteryUsageEstimate: this.config.batteryOptimized ? 1.5 : 3.0, // % per hour
      lastHealthCheck: this.lastHealthCheck,
    };
  }

  getConfig(): BackgroundServiceConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<BackgroundServiceConfig>): void {
    this.config = { ...this.config, ...partial };

    // Apply changes to running engine
    if (this.isActive) {
      const engine = getWakeWordEngine();
      engine.setBatteryOptimization(this.config.batteryOptimized);
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let serviceInstance: BackgroundService | null = null;

export function getBackgroundService(): BackgroundService {
  if (!serviceInstance) {
    serviceInstance = new BackgroundService();
  }
  return serviceInstance;
}
