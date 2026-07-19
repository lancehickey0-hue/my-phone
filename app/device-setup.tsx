import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  NativeModules,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';

const { WakeWordModule } = NativeModules;

const CONVEX_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL || 'https://cheery-buffalo-947.convex.site';

function logStep(message: string, level: string = 'info') {
  fetch(`${CONVEX_SITE_URL}/logDebug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'permissions', message, level }),
  }).catch(() => {});
}

// Runs once, right after login. Requests everything that wasn't already
// requested pre-login in wake-word-setup.tsx (which now only handles
// location + the Vosk model download — see the comment there for why
// location was pulled out and put first, alone). These four dialogs stay
// together post-login since none of them individually caused the hanging
// issue location did; keeping them batched here matches the original
// sequential-dialog design (each awaited to completion before the next
// opens, since Android's Activity only has one pending permission slot at
// a time).
export default function DeviceSetupScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'requesting' | 'done'>('requesting');

  useEffect(() => {
    requestRemainingPermissions();
  }, []);

  async function requestRemainingPermissions() {
    logStep('device_setup: start');

    // 1. Notifications
    try {
      logStep('notifications: requesting');
      await Notifications.requestPermissionsAsync();
      logStep('notifications: done');
    } catch (e) {
      console.warn('[Permissions] Notifications request failed:', e);
      logStep('notifications: FAILED ' + (e as any)?.message, 'warn');
    }

    // 2. Microphone (Android 14 requires RECORD_AUDIO granted before
    // startForeground() can run with foregroundServiceType="microphone").
    // The actual startService() call is gated on this in (tabs)/_layout.tsx
    // rather than assumed from timing.
    if (Platform.OS === 'android') {
      try {
        logStep('mic: requesting');
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'My-Phone needs microphone access to detect your wake word in the background.',
            buttonPositive: 'Allow',
            buttonNegative: 'Skip',
          }
        );
        logStep('mic: done');
      } catch (e) {
        console.warn('[Permissions] Mic request failed:', e);
        logStep('mic: FAILED ' + (e as any)?.message, 'warn');
      }

      // 3. Phone state — pause voice detection during calls.
      try {
        logStep('phone_state: requesting');
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
          {
            title: 'Phone State Permission',
            message: 'My-Phone needs this to pause voice detection during calls.',
            buttonPositive: 'Allow',
            buttonNegative: 'Skip',
          }
        );
        logStep('phone_state: done');
      } catch (e) {
        console.warn('[Permissions] Phone state request failed:', e);
        logStep('phone_state: FAILED ' + (e as any)?.message, 'warn');
      }
    }

    // 4. Device Admin — runs last. It launches a whole separate full-screen
    // system Activity via startActivity(), not a runtime permission dialog
    // callback, so it must come after every dialog above has resolved.
    if (Platform.OS === 'android' && WakeWordModule?.isDeviceAdminActive) {
      try {
        logStep('device_admin: checking status');
        const alreadyAdmin = await WakeWordModule.isDeviceAdminActive();
        logStep('device_admin: already active = ' + alreadyAdmin);
        if (!alreadyAdmin) {
          logStep('device_admin: requesting');
          WakeWordModule.requestDeviceAdmin();
        }
      } catch (e) {
        console.warn('[Permissions] Device admin request failed:', e);
        logStep('device_admin: FAILED ' + (e as any)?.message, 'error');
      }
    }

    logStep('device_setup: finished');
    await SecureStore.setItemAsync('post_login_permissions_done', 'true');
    setStatus('done');
    router.replace('/(tabs)');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🔐</Text>
      <Text style={styles.title}>Finishing Setup</Text>
      <Text style={styles.subtitle}>A few more permissions to enable full functionality</Text>
      <ActivityIndicator color="#D4A843" size="large" style={{ marginTop: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#06060A',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#D4A843', marginBottom: 8 },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 8 },
});
