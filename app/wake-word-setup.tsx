import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  NativeModules,
  NativeEventEmitter,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';

const { WakeWordModule } = NativeModules;

const CONVEX_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL || 'https://cheery-buffalo-947.convex.site';

function logStep(message: string) {
  fetch(`${CONVEX_SITE_URL}/logDebug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'permissions', message }),
  }).catch(() => {});
}

export default function WakeWordSetupScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'downloading' | 'ready' | 'error'>('checking');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    checkAndSetup();
  }, []);

  async function requestAllPermissions() {
    logStep('start');

    // Notifications + Microphone + Phone State + Location — all fire
    // concurrently as one group via Promise.allSettled below. Location's
    // own foreground→background pair stays sequential internally, since
    // Android requires that specific ordering.
    const tasks: Promise<void>[] = [
      (async () => {
        try {
          logStep('notifications: requesting');
          await Notifications.requestPermissionsAsync();
          logStep('notifications: done');
        } catch (e) {
          console.warn('[Permissions] Notifications request failed:', e);
          logStep('notifications: FAILED ' + (e as any)?.message);
        }
      })(),

      (async () => {
        if (Platform.OS !== 'android') return;
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
          logStep('mic: FAILED ' + (e as any)?.message);
        }
      })(),

      (async () => {
        if (Platform.OS !== 'android') return;
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
          logStep('phone_state: FAILED ' + (e as any)?.message);
        }
      })(),

      (async () => {
        try {
          logStep('location_foreground: requesting');
          const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
          logStep('location_foreground: done, status=' + fgStatus);
          if (fgStatus === 'granted') {
            logStep('location_background: requesting');
            const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
            logStep('location_background: done, status=' + bgStatus);
          }
        } catch (e) {
          console.warn('[Permissions] Location request failed:', e);
          logStep('location: FAILED ' + (e as any)?.message);
        }
      })(),
    ];

    await Promise.allSettled(tasks);

    // Device Admin runs AFTER the group above settles, not concurrently
    // with it. It's fundamentally different from the rest: it launches a
    // whole separate full-screen system Activity via startActivity(), not
    // a runtime permission dialog callback — firing it at the same moment
    // as 4 other things all competing for the current Activity's attention
    // is a much bigger collision risk than the others.
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
        logStep('device_admin: FAILED ' + (e as any)?.message);
      }
    }

    logStep('requestAllPermissions: finished');
  }

  async function checkAndSetup() {
    try {
      await requestAllPermissions();

      if (!WakeWordModule) {
        router.replace('/auth');
        return;
      }

      const micGranted =
        Platform.OS !== 'android' ||
        (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO));

      if (!micGranted) {
        router.replace('/auth');
        return;
      }

      const ready = await WakeWordModule.isModelReady();
      if (ready) {
        setStatus('ready');
        await SecureStore.setItemAsync('wake_word_setup_done', 'true');
        setTimeout(() => router.replace('/auth'), 1000);
      } else {
        setStatus('downloading');
        const emitter = new NativeEventEmitter(WakeWordModule);
        const progressSub = emitter.addListener('VoskDownloadProgress', (p: number) => setProgress(p));
        WakeWordModule.downloadModel()
          .then(async () => {
            progressSub.remove();
            setStatus('ready');
            await SecureStore.setItemAsync('wake_word_setup_done', 'true');
            setTimeout(() => router.replace('/auth'), 1500);
          })
          .catch((err: { message: string }) => {
            progressSub.remove();
            setStatus('error');
            setError(err.message ?? 'Download failed');
          });
      }
    } catch (e: any) {
      router.replace('/auth');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🎙️</Text>
      <Text style={styles.title}>Wake Word Setup</Text>

      {status === 'checking' && (
        <ActivityIndicator color="#D4A843" size="large" style={{ marginTop: 24 }} />
      )}

      {status === 'downloading' && (
        <>
          <Text style={styles.subtitle}>Downloading voice model ({progress}%)</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.hint}>
            One-time download ~50MB{'\n'}
            Enables "Hey My-Phone" detection{'\n'}
            Works offline, screen off, always on
          </Text>
        </>
      )}

      {status === 'ready' && (
        <>
          <Text style={styles.ready}>✅ Voice model ready!</Text>
          <Text style={styles.subtitle}>Starting wake word detection...</Text>
        </>
      )}

      {status === 'error' && (
        <>
          <Text style={styles.errorText}>⚠️ Download failed</Text>
          <Text style={styles.hint}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={checkAndSetup}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
          <Pressable style={styles.skipBtn} onPress={() => router.replace('/auth')}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </>
      )}
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
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 16 },
  progressBar: {
    width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4, marginTop: 16, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#D4A843', borderRadius: 4 },
  hint: {
    fontSize: 13, color: 'rgba(255,255,255,0.35)',
    textAlign: 'center', marginTop: 16, lineHeight: 20,
  },
  ready: { fontSize: 18, fontWeight: '700', color: '#4ade80', marginTop: 24 },
  errorText: { fontSize: 18, fontWeight: '700', color: '#ef4444', marginTop: 24 },
  retryBtn: {
    marginTop: 24, backgroundColor: '#D4A843',
    paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12,
  },
  retryText: { color: '#06060A', fontWeight: '700', fontSize: 16 },
  skipBtn: { marginTop: 12 },
  skipText: { color: 'rgba(255,255,255,0.35)', fontSize: 14 },
});
