/**
 * useWakeWordEngine — React hook for wake word engine integration
 *
 * Provides reactive state from the native WakeWordEngine,
 * handles device registration, and manages detection events.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  getWakeWordEngine,
  type DetectionEvent,
  type EngineStatus,
  type WakeWordConfig,
} from '../native/WakeWordEngine';
import { getBackgroundService } from '../native/BackgroundService';

export interface UseWakeWordEngineReturn {
  // Engine state
  isRunning: boolean;
  isListening: boolean;
  audioLevel: number;
  activeModels: number;

  // Detection
  lastDetection: DetectionEvent | null;
  detectionCount: number;

  // Background service
  backgroundActive: boolean;
  batteryUsage: number; // % per hour

  // Actions
  startEngine: () => Promise<void>;
  stopEngine: () => Promise<void>;
  toggleBackground: () => Promise<void>;
  simulateDetection: (deviceId: string) => Promise<void>;
}

export function useWakeWordEngine(): UseWakeWordEngineReturn {
  const devices = useQuery(api.devices.list) ?? [];
  const enrollments = useQuery(api.voiceEnrollment.listEnrollments) ?? [];

  const [status, setStatus] = useState<EngineStatus>({
    isRunning: false,
    isListening: false,
    activeModels: 0,
    lastDetection: null,
    audioLevel: 0,
    batteryOptimized: true,
    backgroundMode: false,
  });

  const [detectionCount, setDetectionCount] = useState(0);
  const [backgroundActive, setBackgroundActive] = useState(false);
  const engineRef = useRef(getWakeWordEngine());

  // Register all enrolled devices with the engine
  useEffect(() => {
    const engine = engineRef.current;

    // Get enrolled device IDs
    const enrolledDeviceIds = new Set(
      enrollments.filter((e) => e.isEnrolled).map((e) => e.deviceId)
    );

    // Register each enrolled device
    devices.forEach(async (device) => {
      if (enrolledDeviceIds.has(device._id) && !engine.isDeviceRegistered(device._id)) {
        const config: WakeWordConfig = {
          deviceId: device._id,
          deviceType: device.type,
          wakePhrase: device.customWakePhrase || device.wakePhrase,
          sensitivity: 0.7,
          requireSpeakerVerification: true,
        };
        await engine.registerDevice(config);
      }
    });

    // Unregister removed devices
    engine.getRegisteredDevices().forEach(async (regDeviceId) => {
      if (!devices.find((d) => d._id === regDeviceId)) {
        await engine.unregisterDevice(regDeviceId);
      }
    });
  }, [devices, enrollments]);

  // Listen to engine events
  useEffect(() => {
    const engine = engineRef.current;

    const onDetection = (event: DetectionEvent) => {
      setDetectionCount((c) => c + 1);
      setStatus(engine.getStatus());
    };

    const onAudioLevel = (level: number) => {
      setStatus((prev) => ({ ...prev, audioLevel: level }));
    };

    const onListeningStart = () => setStatus(engine.getStatus());
    const onListeningStop = () => setStatus(engine.getStatus());

    engine.on('detection', onDetection);
    engine.on('audio_level', onAudioLevel);
    engine.on('listening_start', onListeningStart);
    engine.on('listening_stop', onListeningStop);

    return () => {
      engine.off('detection', onDetection);
      engine.off('audio_level', onAudioLevel);
      engine.off('listening_start', onListeningStart);
      engine.off('listening_stop', onListeningStop);
    };
  }, []);

  const startEngine = useCallback(async () => {
    await engineRef.current.start();
    setStatus(engineRef.current.getStatus());
  }, []);

  const stopEngine = useCallback(async () => {
    await engineRef.current.stop();
    setStatus(engineRef.current.getStatus());
  }, []);

  const toggleBackground = useCallback(async () => {
    const service = getBackgroundService();
    if (backgroundActive) {
      await service.stop();
      setBackgroundActive(false);
    } else {
      const started = await service.start();
      setBackgroundActive(started);
    }
  }, [backgroundActive]);

  const simulateDetection = useCallback(async (deviceId: string) => {
    await engineRef.current.simulateDetection(deviceId);
    setStatus(engineRef.current.getStatus());
  }, []);

  return {
    isRunning: status.isRunning,
    isListening: status.isListening,
    audioLevel: status.audioLevel,
    activeModels: status.activeModels,
    lastDetection: status.lastDetection,
    detectionCount,
    backgroundActive,
    batteryUsage: status.batteryOptimized ? 1.5 : 3.0,
    startEngine,
    stopEngine,
    toggleBackground,
    simulateDetection,
  };
}
