/**
 * BiometricAuth — Native biometric authentication module
 *
 * Wraps expo-local-authentication for Face ID / Touch ID / Fingerprint.
 * Used for:
 *   1. Lockout screen unlock (after alarm triggered)
 *   2. App login (optional biometric login)
 *   3. Sensitive actions (e.g., removing a device, changing settings)
 *
 * Platform support:
 *   iOS: Face ID (iPhone X+), Touch ID (iPhone 5s–8)
 *   Android: Fingerprint, Face recognition, Iris (device dependent)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type BiometricType = 'face_id' | 'touch_id' | 'fingerprint' | 'iris' | 'none';

export interface BiometricCapability {
  isAvailable: boolean;
  biometricType: BiometricType;
  isEnrolled: boolean; // User has set up biometrics on the device
  securityLevel: 'strong' | 'weak' | 'none'; // Android security classification
}

export interface AuthResult {
  success: boolean;
  error?: string;
  errorCode?: 'user_cancel' | 'lockout' | 'not_enrolled' | 'not_available' | 'system_error';
}

// ─── Biometric Auth ─────────────────────────────────────────────────────────

export class BiometricAuth {
  /**
   * Check what biometric capabilities the device supports.
   */
  static async getCapabilities(): Promise<BiometricCapability> {
    // In production: use expo-local-authentication
    // import * as LocalAuthentication from 'expo-local-authentication';
    //
    // const hasHardware = await LocalAuthentication.hasHardwareAsync();
    // const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    // const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    //
    // Map types:
    //   LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION → 'face_id'
    //   LocalAuthentication.AuthenticationType.FINGERPRINT → 'fingerprint' / 'touch_id'
    //   LocalAuthentication.AuthenticationType.IRIS → 'iris'

    // Simulated
    return {
      isAvailable: true,
      biometricType: 'face_id',
      isEnrolled: true,
      securityLevel: 'strong',
    };
  }

  /**
   * Authenticate the user with biometrics.
   * Shows the native biometric prompt.
   */
  static async authenticate(options?: {
    promptMessage?: string;
    cancelLabel?: string;
    fallbackLabel?: string;
    disableDeviceFallback?: boolean;
  }): Promise<AuthResult> {
    const {
      promptMessage = 'Verify your identity',
      cancelLabel = 'Cancel',
      fallbackLabel = 'Use Passcode',
      disableDeviceFallback = false,
    } = options ?? {};

    // In production:
    // const result = await LocalAuthentication.authenticateAsync({
    //   promptMessage,
    //   cancelLabel,
    //   fallbackLabel,
    //   disableDeviceFallback,
    // });
    //
    // return {
    //   success: result.success,
    //   error: result.error,
    //   errorCode: mapErrorCode(result.error),
    // };

    // Simulated: always succeed after brief delay
    await new Promise((r) => setTimeout(r, 800));
    return { success: true };
  }

  /**
   * Authenticate specifically for lockout unlock.
   * Uses a more urgent prompt and doesn't allow fallback to passcode.
   */
  static async authenticateForUnlock(deviceName: string): Promise<AuthResult> {
    return this.authenticate({
      promptMessage: `Unlock ${deviceName}`,
      cancelLabel: 'Cancel',
      disableDeviceFallback: true, // Must use biometrics, no passcode fallback
    });
  }

  /**
   * Get a user-friendly label for the biometric type.
   */
  static getBiometricLabel(type: BiometricType): string {
    switch (type) {
      case 'face_id': return 'Face ID';
      case 'touch_id': return 'Touch ID';
      case 'fingerprint': return 'Fingerprint';
      case 'iris': return 'Iris';
      default: return 'Biometric';
    }
  }

  /**
   * Get the icon/emoji for the biometric type.
   */
  static getBiometricIcon(type: BiometricType): string {
    switch (type) {
      case 'face_id': return '👤';
      case 'touch_id': return '👆';
      case 'fingerprint': return '👆';
      case 'iris': return '👁️';
      default: return '🔐';
    }
  }
}
