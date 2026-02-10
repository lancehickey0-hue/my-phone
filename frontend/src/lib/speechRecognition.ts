import { Platform } from 'react-native';
// NOTE: This uses Expo's optional native module loading so the app still runs in Expo Go.
// In a custom dev build, if the native module is installed, voice recognition can be enabled.
import { requireOptionalNativeModule } from 'expo';

export type SpeechPermissionResponse = {
  granted: boolean;
  canAskAgain?: boolean;
  status?: string;
  restricted?: boolean;
};

export type SpeechStartOptions = {
  lang?: string;
  interimResults?: boolean;
  continuous?: boolean;
  requiresOnDeviceRecognition?: boolean;
  contextualStrings?: string[];
};

const NativeSpeechModule: any = requireOptionalNativeModule('ExpoSpeechRecognition');

export function isNativeSpeechRecognitionAvailable() {
  return !!NativeSpeechModule && Platform.OS !== 'web';
}

export async function requestSpeechRecognitionPermissionsAsync(): Promise<SpeechPermissionResponse> {
  if (!NativeSpeechModule?.requestPermissionsAsync) return { granted: false };
  return (await NativeSpeechModule.requestPermissionsAsync()) as SpeechPermissionResponse;
}

export function startSpeechRecognition(options: SpeechStartOptions) {
  if (!NativeSpeechModule?.start) throw new Error('Speech recognition module not available');
  NativeSpeechModule.start(options);
}

export function stopSpeechRecognition() {
  if (!NativeSpeechModule?.stop) return;
  NativeSpeechModule.stop();
}

export function addSpeechListener(eventName: string, listener: (event: any) => void) {
  const addListener = NativeSpeechModule?.addListener;
  if (typeof addListener !== 'function') return null;
  const sub = addListener.call(NativeSpeechModule, eventName, listener);
  return sub;
}
