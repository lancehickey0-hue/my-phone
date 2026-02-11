import * as Speech from 'expo-speech';
import { AssistantVoice } from '../stores/assistantStore';

export async function listVoices(): Promise<Speech.Voice[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices ?? [];
  } catch {
    return [];
  }
}

export function speak(text: string, voice?: AssistantVoice | null) {
  Speech.stop();
  Speech.speak(text, {
    voice: voice?.id,
    rate: voice?.rate ?? 0.95,
    pitch: voice?.pitch ?? 1.0,
  });
}

export function stopSpeaking() {
  Speech.stop();
}
