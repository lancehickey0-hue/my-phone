/**
 * WakeWordEngine — Native Wake Word Detection Module
 *
 * Core engine for always-on, background voice wake word detection.
 * Handles per-device keyword models, speaker verification, and alarm triggering.
 *
 * Architecture:
 *   [Microphone] → [VAD] → [Keyword Spotting] → [Speaker Verification] → [Action]
 *
 * In production, this bridges to native modules:
 *   - iOS: AVAudioEngine + CoreML custom keyword model
 *   - Android: AudioRecord + TFLite keyword model
 *
 * For now, this is the TypeScript interface + simulation layer.
 */

import { EventEmitter } from 'events';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DeviceType = 'phone' | 'tablet' | 'laptop' | 'earbuds' | 'watch';

export interface WakeWordConfig {
  deviceId: string;
  deviceType: DeviceType;
  wakePhrase: string;
  speakerEmbedding?: Float32Array; // Voice signature from enrollment
  sensitivity: number; // 0.0 – 1.0 (higher = more sensitive, more false positives)
  requireSpeakerVerification: boolean;
}

export interface DetectionEvent {
  deviceId: string;
  wakePhrase: string;
  confidence: number; // 0.0 – 1.0
  speakerMatch: boolean;
  speakerConfidence: number; // 0.0 – 1.0
  timestamp: number;
  audioSnippetMs: number; // length of triggering audio
}

export interface EngineStatus {
  isRunning: boolean;
  isListening: boolean;
  activeModels: number;
  lastDetection: DetectionEvent | null;
  audioLevel: number; // Current mic level 0.0 – 1.0
  batteryOptimized: boolean;
  backgroundMode: boolean;
}

export type EngineEvent =
  | 'detection' // Wake phrase detected
  | 'listening_start' // Engine started listening
  | 'listening_stop' // Engine stopped
  | 'vad_speech' // Voice activity detected (speech started)
  | 'vad_silence' // Silence detected
  | 'error' // Engine error
  | 'audio_level'; // Audio level change

// ─── Voice Activity Detection (VAD) ────────────────────────────────────────

/**
 * Simple energy-based VAD. In production, replaced by WebRTC VAD or
 * native OS-level speech detection.
 */
export class VoiceActivityDetector {
  private energyThreshold: number;
  private speechFrames: number = 0;
  private silenceFrames: number = 0;
  private isSpeaking: boolean = false;

  // Require N consecutive frames to toggle state (debounce)
  private readonly SPEECH_FRAMES_THRESHOLD = 3;
  private readonly SILENCE_FRAMES_THRESHOLD = 15;

  constructor(energyThreshold = 0.02) {
    this.energyThreshold = energyThreshold;
  }

  processFrame(energy: number): 'speech' | 'silence' | null {
    if (energy > this.energyThreshold) {
      this.speechFrames++;
      this.silenceFrames = 0;

      if (!this.isSpeaking && this.speechFrames >= this.SPEECH_FRAMES_THRESHOLD) {
        this.isSpeaking = true;
        return 'speech';
      }
    } else {
      this.silenceFrames++;
      this.speechFrames = 0;

      if (this.isSpeaking && this.silenceFrames >= this.SILENCE_FRAMES_THRESHOLD) {
        this.isSpeaking = false;
        return 'silence';
      }
    }
    return null;
  }

  reset() {
    this.speechFrames = 0;
    this.silenceFrames = 0;
    this.isSpeaking = false;
  }
}

// ─── Keyword Spotter ────────────────────────────────────────────────────────

/**
 * Per-device keyword spotting model.
 * In production: custom small-footprint neural net (1-2MB per keyword).
 * Trained on the specific wake phrase + user voice samples.
 *
 * Model pipeline:
 *   Audio → MFCC features → Conv1D/GRU → Binary classifier (keyword vs not)
 *
 * Each device gets its own model file:
 *   models/wake_word_{deviceId}.tflite (or .mlmodel for iOS)
 */
export class KeywordSpotter {
  readonly deviceId: string;
  readonly wakePhrase: string;
  private modelLoaded: boolean = false;
  private sensitivity: number;

  constructor(config: { deviceId: string; wakePhrase: string; sensitivity: number }) {
    this.deviceId = config.deviceId;
    this.wakePhrase = config.wakePhrase;
    this.sensitivity = config.sensitivity;
  }

  async loadModel(): Promise<boolean> {
    // In production: load TFLite/CoreML model from app storage
    // The model is trained during voice enrollment (3+ samples)
    // Model file: `models/wake_word_${this.deviceId}.tflite`
    this.modelLoaded = true;
    return true;
  }

  async unloadModel(): Promise<void> {
    this.modelLoaded = false;
  }

  /**
   * Score an audio segment against the keyword model.
   * Returns confidence 0.0 – 1.0 that the wake phrase was spoken.
   */
  async scoreAudio(audioBuffer: Float32Array): Promise<number> {
    if (!this.modelLoaded) return 0;

    // In production: run inference on the TFLite/CoreML model
    // Simulated: random score for testing UI flow
    return Math.random() * 0.5; // low scores unless actually triggered
  }

  isLoaded(): boolean {
    return this.modelLoaded;
  }

  setSensitivity(value: number) {
    this.sensitivity = Math.max(0, Math.min(1, value));
  }

  getSensitivity(): number {
    return this.sensitivity;
  }
}

// ─── Speaker Verification ───────────────────────────────────────────────────

/**
 * Verifies the detected voice belongs to the enrolled user.
 * Prevents unauthorized people from triggering the alarm.
 *
 * Pipeline:
 *   Audio → Speaker embedding (d-vector/x-vector) → Cosine similarity vs enrolled embedding
 *
 * In production: uses a small speaker verification model (e.g., ECAPA-TDNN lite)
 */
export class SpeakerVerifier {
  private enrolledEmbedding: Float32Array | null = null;
  private threshold: number;

  constructor(threshold = 0.65) {
    this.threshold = threshold;
  }

  setEnrolledEmbedding(embedding: Float32Array) {
    this.enrolledEmbedding = embedding;
  }

  /**
   * Verify speaker identity from an audio segment.
   * Returns { match: boolean, confidence: number }
   */
  async verify(audioBuffer: Float32Array): Promise<{ match: boolean; confidence: number }> {
    if (!this.enrolledEmbedding) {
      return { match: false, confidence: 0 };
    }

    // In production: extract speaker embedding from audio, compute cosine similarity
    // Simulated for UI development
    const confidence = 0.5 + Math.random() * 0.5;
    return {
      match: confidence >= this.threshold,
      confidence,
    };
  }

  setThreshold(threshold: number) {
    this.threshold = Math.max(0, Math.min(1, threshold));
  }
}

// ─── Main Wake Word Engine ──────────────────────────────────────────────────

export class WakeWordEngine extends EventEmitter {
  private spotters: Map<string, KeywordSpotter> = new Map();
  private verifier: SpeakerVerifier;
  private vad: VoiceActivityDetector;
  private isRunning: boolean = false;
  private isListening: boolean = false;
  private lastDetection: DetectionEvent | null = null;
  private batteryOptimized: boolean = true;
  private backgroundMode: boolean = false;
  private audioLevelInterval: ReturnType<typeof setInterval> | null = null;
  private currentAudioLevel: number = 0;

  constructor() {
    super();
    this.verifier = new SpeakerVerifier();
    this.vad = new VoiceActivityDetector();
  }

  // ─── Device Model Management ─────────────────────────────────────────────

  /**
   * Register a device's wake word model.
   * Called when a device is added or its wake phrase is changed.
   */
  async registerDevice(config: WakeWordConfig): Promise<boolean> {
    const spotter = new KeywordSpotter({
      deviceId: config.deviceId,
      wakePhrase: config.wakePhrase,
      sensitivity: config.sensitivity,
    });

    const loaded = await spotter.loadModel();
    if (!loaded) {
      this.emit('error', { deviceId: config.deviceId, error: 'Failed to load keyword model' });
      return false;
    }

    this.spotters.set(config.deviceId, spotter);

    // Set speaker embedding if provided
    if (config.speakerEmbedding) {
      this.verifier.setEnrolledEmbedding(config.speakerEmbedding);
    }

    return true;
  }

  /**
   * Unregister a device (e.g., device removed from account).
   */
  async unregisterDevice(deviceId: string): Promise<void> {
    const spotter = this.spotters.get(deviceId);
    if (spotter) {
      await spotter.unloadModel();
      this.spotters.delete(deviceId);
    }
  }

  /**
   * Update a device's wake phrase (requires re-training).
   */
  async updateWakePhrase(deviceId: string, newPhrase: string): Promise<void> {
    const spotter = this.spotters.get(deviceId);
    if (spotter) {
      await spotter.unloadModel();
      this.spotters.delete(deviceId);
    }
    // New model will be created during re-enrollment
  }

  // ─── Engine Lifecycle ────────────────────────────────────────────────────

  /**
   * Start the wake word engine. Begins microphone capture and processing.
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    // Start the native Android foreground service
    try {
      const { NativeModules } = require('react-native');
      if (NativeModules.WakeWordModule) {
        NativeModules.WakeWordModule.startService();
      }
    } catch (e) {
      console.warn('[WakeWordEngine] Could not start native service:', e);
    }

    this.isRunning = true;
    this.isListening = true;
    this.emit('listening_start');

// Listen for native wake word detections
  try {
    const { DeviceEventEmitter } = require('react-native');
    DeviceEventEmitter.addListener('WakeWordDetected', () => {
      const activeDevices = Array.from(this.spotters.keys());
      if (activeDevices.length > 0) {
        this.simulateDetection(activeDevices[0]);
      }
    });
  } catch (e) {
    console.warn('[WakeWordEngine] Could not add native listener:', e);
  }

    this.audioLevelInterval = setInterval(() => {
      this.currentAudioLevel = Math.random() * 0.3;
      this.emit('audio_level', this.currentAudioLevel);
    }, 100);
  }

  /**
   * Stop the engine entirely.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const { NativeModules } = require('react-native');
      if (NativeModules.WakeWordModule) {
        NativeModules.WakeWordModule.stopService();
      }
    } catch (e) {
      console.warn('[WakeWordEngine] Could not stop native service:', e);
    }

    this.isRunning = false;
    this.isListening = false;
    this.emit('listening_stop');

    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }
  }

  /**
   * Pause listening (e.g., during a call) without fully stopping.
   */
  pause(): void {
    this.isListening = false;
  }

  /**
   * Resume listening after pause.
   */
  resume(): void {
    if (this.isRunning) {
      this.isListening = true;
    }
  }

  // ─── Detection Simulation ────────────────────────────────────────────────

  /**
   * Simulate a wake word detection for a specific device.
   * In production, this is called by the audio processing pipeline.
   */
  async simulateDetection(deviceId: string): Promise<DetectionEvent | null> {
    const spotter = this.spotters.get(deviceId);
    if (!spotter) return null;

    const detection: DetectionEvent = {
      deviceId,
      wakePhrase: spotter.wakePhrase,
      confidence: 0.85 + Math.random() * 0.15, // High confidence for simulation
      speakerMatch: true,
      speakerConfidence: 0.9 + Math.random() * 0.1,
      timestamp: Date.now(),
      audioSnippetMs: 1800 + Math.random() * 400,
    };

    this.lastDetection = detection;
    this.emit('detection', detection);
    return detection;
  }

  // ─── Background Mode ─────────────────────────────────────────────────────

  /**
   * Enable background mode for always-on detection.
   *
   * iOS: Uses Background Audio + Background Processing tasks
   * Android: Uses a Foreground Service with persistent notification
   *
   * Battery optimization: When enabled, reduces audio processing
   * frequency and uses larger buffers to save power.
   */
  setBackgroundMode(enabled: boolean): void {
    this.backgroundMode = enabled;
    // In production: configure native background execution
  }

  setBatteryOptimization(enabled: boolean): void {
    this.batteryOptimized = enabled;
    // In production: adjust audio buffer sizes and processing intervals
    // Optimized: 512ms buffers, every-other-frame processing
    // Normal: 256ms buffers, every-frame processing
  }

  // ─── Status ──────────────────────────────────────────────────────────────

  getStatus(): EngineStatus {
    return {
      isRunning: this.isRunning,
      isListening: this.isListening,
      activeModels: this.spotters.size,
      lastDetection: this.lastDetection,
      audioLevel: this.currentAudioLevel,
      batteryOptimized: this.batteryOptimized,
      backgroundMode: this.backgroundMode,
    };
  }

  getRegisteredDevices(): string[] {
    return Array.from(this.spotters.keys());
  }

  isDeviceRegistered(deviceId: string): boolean {
    return this.spotters.has(deviceId);
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let engineInstance: WakeWordEngine | null = null;

export function getWakeWordEngine(): WakeWordEngine {
  if (!engineInstance) {
    engineInstance = new WakeWordEngine();
  }
  return engineInstance;
}

export function resetWakeWordEngine(): void {
  if (engineInstance) {
    engineInstance.stop();
    engineInstance = null;
  }
}
