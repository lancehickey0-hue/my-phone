import { Audio } from 'expo-av';

let soundObject: Audio.Sound | null = null;
let isPlaying = false;

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

    soundObject = sound;
    isPlaying = true;
  } catch (e) {
    console.error('Failed to play alarm:', e);
  }
}

export async function stopAlarm() {
  if (!soundObject) return;
  
  try {
    await soundObject.stopAsync();
    await soundObject.unloadAsync();
    soundObject = null;
    isPlaying = false;
  } catch (e) {
    console.error('Failed to stop alarm:', e);
  }
}

export function isAlarmPlaying() {
  return isPlaying;
}
