/**
 * VoiceEnrollmentProcessor — Handles voice sample collection + model training
 *
 * During enrollment, the user speaks their wake phrase 5+ times.
 * This processor:
 *   1. Records audio samples
 *   2. Extracts MFCC features
 *   3. Trains a small keyword spotting model specific to that phrase + voice
 *   4. Extracts speaker embedding for speaker verification
 *   5. Stores the trained model for the WakeWordEngine
 *
 * Each device gets its own model, trained on its specific wake phrase.
 */

import type { DeviceType } from './WakeWordEngine';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnrollmentSample {
  id: string;
  audioData: Float32Array;
  duration: number; // ms
  sampleRate: number;
  mfccFeatures?: Float32Array; // Extracted during processing
  quality: SampleQuality;
}

export interface SampleQuality {
  snr: number; // Signal-to-noise ratio in dB
  energy: number; // RMS energy
  isClipped: boolean; // Audio clipping detected
  tooShort: boolean; // Duration < minimum
  tooLong: boolean; // Duration > maximum
  isAcceptable: boolean; // Overall quality check
}

export interface EnrollmentState {
  deviceId: string;
  deviceType: DeviceType;
  wakePhrase: string;
  samples: EnrollmentSample[];
  requiredSamples: number;
  isRecording: boolean;
  isProcessing: boolean;
  isComplete: boolean;
  modelTrained: boolean;
  speakerEmbedding: Float32Array | null;
  error: string | null;
}

export interface TrainedModel {
  deviceId: string;
  wakePhrase: string;
  modelData: ArrayBuffer; // Serialized TFLite/CoreML model
  speakerEmbedding: Float32Array;
  accuracy: number; // Estimated accuracy from training
  trainedAt: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const REQUIRED_SAMPLES = 5;
const MIN_SAMPLE_DURATION_MS = 800;
const MAX_SAMPLE_DURATION_MS = 5000;
const MIN_SNR_DB = 10;
const SAMPLE_RATE = 16000; // 16kHz for wake word detection

// ─── Enrollment Processor ───────────────────────────────────────────────────

export class VoiceEnrollmentProcessor {
  private state: EnrollmentState;
  private onStateChange?: (state: EnrollmentState) => void;

  constructor(
    deviceId: string,
    deviceType: DeviceType,
    wakePhrase: string,
    onStateChange?: (state: EnrollmentState) => void,
  ) {
    this.onStateChange = onStateChange;
    this.state = {
      deviceId,
      deviceType,
      wakePhrase,
      samples: [],
      requiredSamples: REQUIRED_SAMPLES,
      isRecording: false,
      isProcessing: false,
      isComplete: false,
      modelTrained: false,
      speakerEmbedding: null,
      error: null,
    };
  }

  // ─── Recording ─────────────────────────────────────────────────────────

  /**
   * Start recording a voice sample.
   * In production: opens native audio recorder at 16kHz mono.
   */
  async startRecording(): Promise<void> {
    if (this.state.isRecording) return;

    this.updateState({
      isRecording: true,
      error: null,
    });

    // In production:
    //   iOS: AVAudioRecorder with settings for 16kHz, mono, PCM
    //   Android: AudioRecord with 16kHz, CHANNEL_IN_MONO, ENCODING_PCM_FLOAT
  }

  /**
   * Stop recording and process the sample.
   * Returns the quality assessment.
   */
  async stopRecording(): Promise<SampleQuality | null> {
    if (!this.state.isRecording) return null;

    this.updateState({ isRecording: false, isProcessing: true });

    // In production: stop native recorder, get audio buffer
    // Simulated: create fake audio data
    const durationMs = 1500 + Math.random() * 1000;
    const numSamples = Math.floor((durationMs / 1000) * SAMPLE_RATE);
    const audioData = new Float32Array(numSamples);

    // Simulate audio data
    for (let i = 0; i < numSamples; i++) {
      audioData[i] = (Math.random() - 0.5) * 0.5;
    }

    // Assess quality
    const quality = this.assessQuality(audioData, durationMs);

    if (quality.isAcceptable) {
      const sample: EnrollmentSample = {
        id: `sample_${Date.now()}`,
        audioData,
        duration: durationMs,
        sampleRate: SAMPLE_RATE,
        quality,
      };

      const newSamples = [...this.state.samples, sample];
      const isComplete = newSamples.length >= REQUIRED_SAMPLES;

      this.updateState({
        samples: newSamples,
        isProcessing: false,
        isComplete,
      });

      // Auto-train when we have enough samples
      if (isComplete && !this.state.modelTrained) {
        await this.trainModel();
      }
    } else {
      this.updateState({
        isProcessing: false,
        error: this.getQualityError(quality),
      });
    }

    return quality;
  }

  // ─── Quality Assessment ────────────────────────────────────────────────

  private assessQuality(audioData: Float32Array, durationMs: number): SampleQuality {
    // Calculate RMS energy
    let sumSquares = 0;
    for (let i = 0; i < audioData.length; i++) {
      sumSquares += audioData[i] * audioData[i];
    }
    const rmsEnergy = Math.sqrt(sumSquares / audioData.length);

    // Estimate SNR (simplified)
    const signalPower = rmsEnergy;
    const noisePower = 0.01; // estimated noise floor
    const snr = 20 * Math.log10(signalPower / noisePower);

    // Check clipping
    let clippedSamples = 0;
    for (let i = 0; i < audioData.length; i++) {
      if (Math.abs(audioData[i]) > 0.95) clippedSamples++;
    }
    const isClipped = clippedSamples / audioData.length > 0.01;

    const tooShort = durationMs < MIN_SAMPLE_DURATION_MS;
    const tooLong = durationMs > MAX_SAMPLE_DURATION_MS;

    const isAcceptable = !tooShort && !tooLong && !isClipped && snr >= MIN_SNR_DB;

    return { snr, energy: rmsEnergy, isClipped, tooShort, tooLong, isAcceptable };
  }

  private getQualityError(quality: SampleQuality): string {
    if (quality.tooShort) return 'Recording too short. Please speak the full wake phrase.';
    if (quality.tooLong) return 'Recording too long. Speak only the wake phrase.';
    if (quality.isClipped) return 'Audio is too loud. Try speaking at a normal volume.';
    if (quality.snr < MIN_SNR_DB) return 'Too much background noise. Try a quieter environment.';
    return 'Sample quality too low. Please try again.';
  }

  // ─── Model Training ───────────────────────────────────────────────────

  /**
   * Train the keyword spotting model from collected samples.
   *
   * In production, this either:
   *   a) Trains on-device using transfer learning from a base model
   *   b) Sends samples to a secure server for model fine-tuning
   *
   * The resulting model is ~1-2MB and runs efficiently on-device.
   */
  async trainModel(): Promise<TrainedModel | null> {
    if (this.state.samples.length < REQUIRED_SAMPLES) {
      this.updateState({ error: `Need ${REQUIRED_SAMPLES} samples, have ${this.state.samples.length}` });
      return null;
    }

    this.updateState({ isProcessing: true, error: null });

    // Simulate model training time (1-3 seconds)
    await new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 1500));

    // In production:
    //   1. Extract MFCC features from all samples
    //   2. Data augmentation (noise, speed, pitch variations)
    //   3. Fine-tune base keyword model with samples
    //   4. Extract speaker embedding (d-vector) from samples
    //   5. Save model to device storage
    //   6. Register model with WakeWordEngine

    // Simulate speaker embedding (192-dim d-vector)
    const embeddingDim = 192;
    const speakerEmbedding = new Float32Array(embeddingDim);
    for (let i = 0; i < embeddingDim; i++) {
      speakerEmbedding[i] = (Math.random() - 0.5) * 2;
    }
    // Normalize
    const norm = Math.sqrt(speakerEmbedding.reduce((sum, v) => sum + v * v, 0));
    for (let i = 0; i < embeddingDim; i++) {
      speakerEmbedding[i] /= norm;
    }

    const model: TrainedModel = {
      deviceId: this.state.deviceId,
      wakePhrase: this.state.wakePhrase,
      modelData: new ArrayBuffer(1024 * 1024), // Simulated 1MB model
      speakerEmbedding,
      accuracy: 0.92 + Math.random() * 0.07, // 92-99% accuracy
      trainedAt: Date.now(),
    };

    this.updateState({
      isProcessing: false,
      modelTrained: true,
      speakerEmbedding,
    });

    return model;
  }

  // ─── State Management ─────────────────────────────────────────────────

  private updateState(partial: Partial<EnrollmentState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange?.(this.state);
  }

  getState(): EnrollmentState {
    return { ...this.state };
  }

  /**
   * Reset enrollment (start over).
   */
  reset(): void {
    this.state = {
      ...this.state,
      samples: [],
      isRecording: false,
      isProcessing: false,
      isComplete: false,
      modelTrained: false,
      speakerEmbedding: null,
      error: null,
    };
    this.onStateChange?.(this.state);
  }

  /**
   * Remove a specific sample (e.g., user wants to redo one).
   */
  removeSample(sampleId: string): void {
    const samples = this.state.samples.filter((s) => s.id !== sampleId);
    this.updateState({
      samples,
      isComplete: false,
      modelTrained: false,
    });
  }
}
