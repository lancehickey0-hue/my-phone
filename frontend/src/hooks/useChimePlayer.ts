import { useCallback, useEffect, useRef } from 'react';
import { useAudioPlayer } from 'expo-audio';

// A small looping chime player.
// - Uses expo-audio (SDK 54+)
// - Leans on native looping where available (player.loop = true)
// - Ensures playback starts at time 0 each time
export function useChimePlayer(source: number) {
  const player = useAudioPlayer(source, { updateInterval: 250, keepAudioSessionActive: true });
  const startedRef = useRef(false);

  const start = useCallback(async () => {
    if (!player.isLoaded) return;
    // ensure looping + restart
    player.loop = true;
    try {
      await player.seekTo(0);
    } catch {
      // ignore
    }
    player.play();
    startedRef.current = true;
  }, [player]);

  const stop = useCallback(() => {
    try {
      player.loop = false;
      player.pause();
    } catch {
      // ignore
    }
    startedRef.current = false;
  }, [player]);

  useEffect(() => {
    return () => {
      try {
        player.remove();
      } catch {
        // ignore
      }
    };
  }, [player]);

  return {
    player,
    start,
    stop,
    isLoaded: player.isLoaded,
    isPlaying: player.playing,
    started: startedRef.current,
  };
}
