/**
 * LocationTracker — Real-time GPS tracking for all registered devices
 *
 * This module handles:
 *   1. Foreground location updates (high accuracy when app is open)
 *   2. Background location updates (periodic when app is backgrounded)
 *   3. Alarm-mode location broadcasting (continuous high-frequency when alarm active)
 *   4. Geofencing (optional — alert when device leaves an area)
 *
 * Platform implementation:
 *   iOS: CLLocationManager with significant location changes + background mode
 *   Android: FusedLocationProviderClient with priority settings
 *
 * In production: uses expo-location for cross-platform GPS access.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy: number; // meters
  altitude?: number;
  speed?: number; // m/s
  heading?: number; // degrees from north
  timestamp: number;
  source: 'gps' | 'network' | 'fused';
}

export interface TrackingConfig {
  mode: 'foreground' | 'background' | 'alarm';
  intervalMs: number; // How often to push location updates
  distanceFilterMeters: number; // Min distance change to trigger update
  highAccuracy: boolean;
}

export interface LocationHistory {
  deviceId: string;
  locations: LocationUpdate[];
  lastUpdate: number;
}

// ─── Tracking Presets ───────────────────────────────────────────────────────

const TRACKING_PRESETS: Record<TrackingConfig['mode'], Omit<TrackingConfig, 'mode'>> = {
  foreground: {
    intervalMs: 10_000, // Every 10 seconds
    distanceFilterMeters: 10,
    highAccuracy: true,
  },
  background: {
    intervalMs: 60_000, // Every 60 seconds
    distanceFilterMeters: 50,
    highAccuracy: false, // Save battery
  },
  alarm: {
    intervalMs: 3_000, // Every 3 seconds — need real-time tracking
    distanceFilterMeters: 1,
    highAccuracy: true,
  },
};

// ─── Location Tracker ───────────────────────────────────────────────────────

export class LocationTracker {
  private isTracking: boolean = false;
  private mode: TrackingConfig['mode'] = 'foreground';
  private watchId: number | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private locationHistory: Map<string, LocationUpdate[]> = new Map();
  private onLocationUpdate?: (deviceId: string, location: LocationUpdate) => void;
  private currentDeviceId: string | null = null;

  // Max history entries per device (for trail rendering on map)
  private readonly MAX_HISTORY = 100;

  constructor(onLocationUpdate?: (deviceId: string, location: LocationUpdate) => void) {
    this.onLocationUpdate = onLocationUpdate;
  }

  // ─── Start/Stop ──────────────────────────────────────────────────────

  /**
   * Start tracking location for this device.
   */
  async startTracking(deviceId: string, mode: TrackingConfig['mode'] = 'foreground'): Promise<boolean> {
    if (this.isTracking) {
      // Switch mode if already tracking
      if (this.mode !== mode) {
        await this.setMode(mode);
      }
      return true;
    }

    this.currentDeviceId = deviceId;
    this.mode = mode;

    // In production:
    // import * as Location from 'expo-location';
    //
    // const { status } = await Location.requestForegroundPermissionsAsync();
    // if (status !== 'granted') return false;
    //
    // if (mode === 'background' || mode === 'alarm') {
    //   const bgStatus = await Location.requestBackgroundPermissionsAsync();
    //   if (bgStatus.status !== 'granted') return false;
    // }
    //
    // const preset = TRACKING_PRESETS[mode];
    // this.watchId = await Location.watchPositionAsync(
    //   {
    //     accuracy: preset.highAccuracy
    //       ? Location.Accuracy.BestForNavigation
    //       : Location.Accuracy.Balanced,
    //     distanceInterval: preset.distanceFilterMeters,
    //     timeInterval: preset.intervalMs,
    //   },
    //   (location) => this.handleLocationUpdate(deviceId, location),
    // );

    // Simulated: emit location updates on interval
    const preset = TRACKING_PRESETS[mode];
    this.intervalId = setInterval(() => {
      this.emitSimulatedUpdate(deviceId);
    }, preset.intervalMs);

    this.isTracking = true;
    return true;
  }

  /**
   * Stop tracking.
   */
  async stopTracking(): Promise<void> {
    if (!this.isTracking) return;

    // In production: Location.removeWatchAsync(this.watchId)
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isTracking = false;
    this.currentDeviceId = null;
  }

  /**
   * Switch tracking mode (e.g., foreground → alarm when device is triggered).
   */
  async setMode(mode: TrackingConfig['mode']): Promise<void> {
    if (this.mode === mode) return;

    const deviceId = this.currentDeviceId;
    if (deviceId && this.isTracking) {
      await this.stopTracking();
      await this.startTracking(deviceId, mode);
    }
    this.mode = mode;
  }

  // ─── Location Updates ────────────────────────────────────────────────

  private emitSimulatedUpdate(deviceId: string): void {
    // Simulated location (San Francisco area with slight drift)
    const baseLat = 37.7749;
    const baseLng = -122.4194;

    const history = this.locationHistory.get(deviceId) || [];
    const lastLoc = history[history.length - 1];

    const location: LocationUpdate = {
      latitude: lastLoc ? lastLoc.latitude + (Math.random() - 0.5) * 0.001 : baseLat,
      longitude: lastLoc ? lastLoc.longitude + (Math.random() - 0.5) * 0.001 : baseLng,
      accuracy: this.mode === 'alarm' ? 5 : 15,
      speed: Math.random() * 2,
      heading: Math.random() * 360,
      timestamp: Date.now(),
      source: 'fused',
    };

    // Store in history
    history.push(location);
    if (history.length > this.MAX_HISTORY) {
      history.shift();
    }
    this.locationHistory.set(deviceId, history);

    // Notify listener
    this.onLocationUpdate?.(deviceId, location);
  }

  // ─── History ─────────────────────────────────────────────────────────

  /**
   * Get location trail for a device (for rendering on map).
   */
  getLocationHistory(deviceId: string): LocationUpdate[] {
    return this.locationHistory.get(deviceId) || [];
  }

  /**
   * Get last known location for a device.
   */
  getLastLocation(deviceId: string): LocationUpdate | null {
    const history = this.locationHistory.get(deviceId);
    return history && history.length > 0 ? history[history.length - 1] : null;
  }

  /**
   * Clear history for a device.
   */
  clearHistory(deviceId: string): void {
    this.locationHistory.delete(deviceId);
  }

  // ─── Geofencing (Future) ─────────────────────────────────────────────

  /**
   * Set up a geofence around a location. Alert when device exits the radius.
   * Useful for: "Alert me if my laptop leaves the office"
   */
  async addGeofence(_deviceId: string, _lat: number, _lng: number, _radiusMeters: number): Promise<string> {
    // In production:
    // import * as Location from 'expo-location';
    // const regions = [{ latitude, longitude, radius, notifyOnExit: true }];
    // await Location.startGeofencingAsync('GEOFENCE_TASK', regions);

    // Return geofence ID for later removal
    return `geofence_${Date.now()}`;
  }

  async removeGeofence(_geofenceId: string): Promise<void> {
    // In production: remove from geofencing task
  }

  // ─── Status ──────────────────────────────────────────────────────────

  getStatus(): { isTracking: boolean; mode: TrackingConfig['mode']; deviceId: string | null } {
    return {
      isTracking: this.isTracking,
      mode: this.mode,
      deviceId: this.currentDeviceId,
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let trackerInstance: LocationTracker | null = null;

export function getLocationTracker(
  onLocationUpdate?: (deviceId: string, location: LocationUpdate) => void
): LocationTracker {
  if (!trackerInstance) {
    trackerInstance = new LocationTracker(onLocationUpdate);
  }
  return trackerInstance;
}
