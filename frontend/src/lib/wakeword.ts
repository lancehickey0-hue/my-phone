import { Platform } from 'react-native';
import { useEffect, useRef, useState } from 'react';

// Picovoice native modules (only work in a dev build)
import { BuiltInKeywords, PorcupineManager } from '@picovoice/porcupine-react-native';
import { VoiceProcessor } from '@picovoice/react-native-voice-processor';

const vp = VoiceProcessor.instance;

export type WakeWordState = {
  available: boolean;
  running: boolean;
  lastDetection?: { keywordIndex: number; timestamp: number };
  error?: string;
};

/**
 * Hook that manages Porcupine wake word detection lifecycle.
 * NOTE: Requires Picovoice AccessKey (build secret) and a dev build.
 */
export function useWakeWord(options: {
  accessKey?: string;
  keywords: Array<{ builtin?: string; modelPath?: string; sensitivity?: number }>;
  onDetected: (keywordIndex: number) => void;
}) {
  const managerRef = useRef<PorcupineManager | null>(null);
  const [state, setState] = useState<WakeWordState>({
    available: Platform.OS !== 'web',
    running: false,
  });

  useEffect(() => {
    return () => {
      stop().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    try {
      if (!options.accessKey) {
        setState((s) => ({ ...s, error: 'Missing Picovoice access key' }));
        return;
      }

      if (managerRef.current) {
        setState((s) => ({ ...s, running: true, error: undefined }));
        return;
      }

      // PorcupineManager handles audio capture via VoiceProcessor internally.
      const manager = await PorcupineManager.fromBuiltInKeywords(
        options.accessKey,
        options.keywords.map((k) => (BuiltInKeywords as any)[String(k.builtin ?? 'Jarvis')] ?? (BuiltInKeywords as any).Jarvis),
        (keywordIndex: number) => {
          setState((s) => ({
            ...s,
            lastDetection: { keywordIndex, timestamp: Date.now() },
          }));
          options.onDetected(keywordIndex);
        },
        undefined,
        undefined,
        undefined,
        options.keywords.map((k) => k.sensitivity ?? 0.65)
      );

      managerRef.current = manager;
      await manager.start();
      setState((s) => ({ ...s, running: true, error: undefined }));
    } catch (e: any) {
      setState((s) => ({ ...s, running: false, error: e?.message ?? 'Wake word start failed' }));
    }
  }

  async function stop() {
    try {
      if (managerRef.current) {
        await managerRef.current.stop();
        await managerRef.current.delete();
        managerRef.current = null;
      }
      await vp.stop();
    } catch {
      // ignore
    } finally {
      setState((s) => ({ ...s, running: false }));
    }
  }

  return { state, start, stop };
}
