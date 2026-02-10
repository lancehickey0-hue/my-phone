import { create } from 'zustand';

type DeviceState = {
  deviceId: string | null;
  setDeviceId: (id: string) => void;
};

export const useDeviceStore = create<DeviceState>((set) => ({
  deviceId: null,
  setDeviceId: (id) => set({ deviceId: id }),
}));
