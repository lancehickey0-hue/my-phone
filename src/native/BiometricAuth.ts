import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricType = 'face_id' | 'touch_id' | 'fingerprint' | 'iris' | 'none';

export interface BiometricCapability {
  isAvailable: boolean;
  biometricType: BiometricType;
  isEnrolled: boolean;
  securityLevel: 'strong' | 'weak' | 'none';
}

export interface AuthResult {
  success: boolean;
  error?: string;
  errorCode?: 'user_cancel' | 'lockout' | 'not_enrolled' | 'not_available' | 'system_error';
}

export class BiometricAuth {
  static async getCapabilities(): Promise<BiometricCapability> {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let biometricType: BiometricType = 'none';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometricType = 'face_id';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometricType = 'fingerprint';
    }

    const level = await LocalAuthentication.getEnrolledLevelAsync();

    return {
      isAvailable: hasHardware,
      biometricType,
      isEnrolled,
      securityLevel: level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG
        ? 'strong'
        : level === LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK
          ? 'weak'
          : 'none',
    };
  }

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

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware) return { success: false, error: 'No biometric hardware available', errorCode: 'not_available' };
      if (!isEnrolled) return { success: false, error: 'No biometrics enrolled', errorCode: 'not_enrolled' };

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel,
        fallbackLabel,
        disableDeviceFallback,
      });

      if (result.success) return { success: true };

      const error = (result as any).error as string;
      let errorCode: AuthResult['errorCode'] = 'system_error';
      if (error === 'user_cancel' || error === 'SystemCancel') errorCode = 'user_cancel';
      else if (error === 'lockout' || error === 'lockout_permanent') errorCode = 'lockout';

      return { success: false, error, errorCode };
    } catch (e: any) {
      return { success: false, error: e.message, errorCode: 'system_error' };
    }
  }

  static async authenticateForUnlock(deviceName: string): Promise<AuthResult> {
    return this.authenticate({
      promptMessage: `Unlock ${deviceName}`,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
  }

  static getBiometricLabel(type: BiometricType): string {
    switch (type) {
      case 'face_id': return 'Face ID';
      case 'touch_id': return 'Touch ID';
      case 'fingerprint': return 'Fingerprint';
      case 'iris': return 'Iris';
      default: return 'Biometric';
    }
  }

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
