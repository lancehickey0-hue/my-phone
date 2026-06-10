import { Audio } from 'expo-av';

let soundObject: Audio.Sound | null = null;
let isPlaying = false;
let isStoppingAlarm = false; // Prevent concurrent stop operations

export async function startAlarm() {
  if (isPlaying) return;
  
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/sounds/alarm.mp3'),
      { shouldPlay: true, isLooping: true, volume: 1.0 }
    );

    // Double-check soundObject is still null (wasn't set concurrently)
    if (soundObject === null) {
      soundObject = sound;
      isPlaying = true;
    } else {
      // Race condition: another call set soundObject, unload this one
      try {
        await sound.unloadAsync();
      } catch (e) {
        console.warn('[AlarmManager] Failed to cleanup duplicate sound:', e);
      }
    }
  } catch (e) {
    console.error('[AlarmManager] Failed to play alarm:', e);
    isPlaying = false;
    soundObject = null;
  }
}

export async function stopAlarm() {
  // Prevent concurrent stop operations
  if (isStoppingAlarm || !soundObject) return;
  
  isStoppingAlarm = true;
  
  try {
    const currentSound = soundObject;
    
    // Clear references immediately to prevent concurrent operations
    soundObject = null;
    isPlaying = false;

    if (currentSound) {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    }
  } catch (e) {
    console.error('[AlarmManager] Failed to stop alarm:', e);
  } finally {
    isStoppingAlarm = false;
  }
}

export function isAlarmPlaying() {
  return isPlaying && soundObject !== null;
}

/**
 * Emergency cleanup - call this on app pause/background
 */
export async function emergencyStopAlarm() {
  try {
    if (soundObject) {
      await soundObject.stopAsync();
      await soundObject.unloadAsync();
    }
  } catch (e) {
    console.warn('[AlarmManager] Emergency stop failed:', e);
  } finally {
    soundObject = null;
    isPlaying = false;
    isStoppingAlarm = false;
  }
}
