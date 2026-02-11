import { create } from 'zustand';

export type AssistantVoice = {
  id: string; // expo-speech voice identifier when available
  label: string; // user-friendly display name
  rate: number;
  pitch: number;
};

type AssistantState = {
  voice: AssistantVoice | null;
  setVoice: (v: AssistantVoice) => void;
};

export const useAssistantStore = create<AssistantState>((set) => ({
  voice: null,
  setVoice: (v) => set({ voice: v }),
}));
