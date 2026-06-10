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
  if (!NativeSpeechModule?.requestPermissionsAsync) {
    return { 
      granted: false, 
      status: 'unavailable',
      restricted: true
    };
  }
  
  try {
    return (await NativeSpeechModule.requestPermissionsAsync()) as SpeechPermissionResponse;
  } catch (error) {
    console.error('[SpeechRecognition] Permission request failed:', error);
    return { 
      granted: false,
      status: 'error',
      restricted: true
    };
  }
}

export function startSpeechRecognition(options: SpeechStartOptions) {
  if (!NativeSpeechModule) {
    throw new Error('Speech recognition module not available (requires dev build)');
  }
  
  if (typeof NativeSpeechModule.start !== 'function') {
    throw new Error('Speech recognition start method not available');
  }
  
  try {
    NativeSpeechModule.start(options);
  } catch (error) {
    console.error('[SpeechRecognition] Failed to start recognition:', error);
    throw new Error(`Speech recognition failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function stopSpeechRecognition() {
  if (!NativeSpeechModule?.stop) {
    console.warn('[SpeechRecognition] Stop method not available');
    return;
  }
  
  try {
    NativeSpeechModule.stop();
  } catch (error) {
    console.error('[SpeechRecognition] Failed to stop recognition:', error);
  }
}

export function addSpeechListener(eventName: string, listener: (event: any) => void) {
  const addListener = NativeSpeechModule?.addListener;
  
  if (typeof addListener !== 'function') {
    console.warn('[SpeechRecognition] Listener registration not available');
    return null;
  }
  
  try {
    const sub = addListener.call(NativeSpeechModule, eventName, listener);
    return sub;
  } catch (error) {
    console.error(`[SpeechRecognition] Failed to add ${eventName} listener:`, error);
    return null;
  }
}
