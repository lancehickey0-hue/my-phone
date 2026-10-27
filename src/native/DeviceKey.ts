import { NativeModules, Platform } from 'react-native';

// JS side of plugins/wake-word/DeviceKeyModule.kt — the hardware-backed key
// that signs unlock challenges after a strong biometric check.

const { DeviceKeyModule } = NativeModules;

export type StrongBiometric = 'available' | 'not_enrolled' | 'unavailable';

export type SignErrorCode =
  | 'no_key'
  | 'key_invalidated'
  | 'use_pin'
  | 'user_cancel'
  | 'lockout'
  | 'no_activity'
  | 'sign_failed'
  | 'unsupported';

export class SignError extends Error {
  constructor(public code: SignErrorCode, message: string) {
    super(message);
  }
}

export const DeviceKey = {
  isSupported(): boolean {
    return Platform.OS === 'android' && !!DeviceKeyModule;
  },

  async strongBiometric(): Promise<StrongBiometric> {
    if (!this.isSupported()) return 'unavailable';
    return DeviceKeyModule.isStrongBiometricAvailable();
  },

  async hasKey(): Promise<boolean> {
    if (!this.isSupported()) return false;
    return DeviceKeyModule.hasKey();
  },

  // Returns base64 SPKI public key to register with the server.
  async createKey(): Promise<string> {
    if (!this.isSupported()) throw new SignError('unsupported', 'Not supported on this device');
    return DeviceKeyModule.createKey();
  },

  async deleteKey(): Promise<void> {
    if (this.isSupported()) await DeviceKeyModule.deleteKey();
  },

  // Shows the system fingerprint/face prompt and signs the challenge.
  async sign(challenge: string, title: string, subtitle: string): Promise<string> {
    if (!this.isSupported()) throw new SignError('unsupported', 'Not supported on this device');
    try {
      return await DeviceKeyModule.sign(challenge, title, subtitle);
    } catch (e: any) {
      throw new SignError((e?.code as SignErrorCode) ?? 'sign_failed', e?.message ?? 'Unlock failed');
    }
  },
};
