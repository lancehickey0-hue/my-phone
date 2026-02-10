import { create } from 'zustand';

export type LocatorSettings = {
  enabled: boolean;
  wake_phrase: string;
  stop_phrase: string;
};

type LocatorState = {
  settings: LocatorSettings | null;
  setSettings: (s: LocatorSettings) => void;
  isAlerting: boolean;
  setIsAlerting: (v: boolean) => void;
  transcript: string;
  setTranscript: (t: string) => void;
};

export const useLocatorStore = create<LocatorState>((set) => ({
  settings: null,
  setSettings: (s) => set({ settings: s }),
  isAlerting: false,
  setIsAlerting: (v) => set({ isAlerting: v }),
  transcript: '',
  setTranscript: (t) => set({ transcript: t }),
}));
