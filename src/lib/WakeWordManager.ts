import { NativeModules, NativeEventEmitter, Platform, DeviceEventEmitter } from 'react-native';

// Start the wake word foreground service
export function startWakeWordService() {
  if (Platform.OS !== 'android') return;
  try {
    NativeModules.WakeWordModule?.startService();
  } catch (e) {
    console.log('WakeWord service start error:', e);
  }
}

// Stop the wake word foreground service  
export function stopWakeWordService() {
  if (Platform.OS !== 'android') return;
  try {
    NativeModules.WakeWordModule?.stopService();
  } catch (e) {
    console.log('WakeWord service stop error:', e);
  }
}

// Listen for wake word detection
export function onWakeWordDetected(callback: () => void) {
  if (Platform.OS !== 'android') return () => {};
  const subscription = DeviceEventEmitter.addListener('WakeWordDetected', callback);
  return () => subscription.remove();
}
