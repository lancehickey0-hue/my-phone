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

export default function WakeWordSetupScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'downloading' | 'ready' | 'error'>('checking');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    checkAndSetup();
  }, []);

  async function requestAllPermissions() {
    // 1. Notifications
    try {
      await Notifications.requestPermissionsAsync();
    } catch (e) {
      console.warn('[Permissions] Notifications request failed:', e);
    }

    // 2. Microphone + phone state (Android 14 requires RECORD_AUDIO granted
    // before startForeground() can be called with foregroundServiceType="microphone").
    if (Platform.OS === 'android') {
      try {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'My-Phone needs microphone access to detect your wake word in the background.',
            buttonPositive: 'Allow',
            buttonNegative: 'Skip',
          }
        );
      } catch (e) {
        console.warn('[Permissions] Mic request failed:', e);
      }

      try {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
          {
            title: 'Phone State Permission',
            message: 'My-Phone needs this to pause voice detection during calls.',
            buttonPositive: 'Allow',
            buttonNegative: 'Skip',
          }
        );
      } catch (e) {
        console.warn('[Permissions] Phone state request failed:', e);
      }
    }

    // 3. Location — foreground first, background second (Android requires
    // these to be requested as two separate steps, never together).
    try {
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus === 'granted') {
        await Location.requestBackgroundPermissionsAsync();
      }
    } catch (e) {
      console.warn('[Permissions] Location request failed:', e);
    }
  }

  async function checkAndSetup() {
    try {
      await requestAllPermissions();

      if (!WakeWordModule) {
        router.replace('/(tabs)');
        return;
      }

      const micGranted =
        Platform.OS !== 'android' ||
        (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO));

      if (!micGranted) {
        router.replace('/(tabs)');
        return;
      }

      const ready = await WakeWordModule.isModelReady();
      if (ready) {
        setStatus('ready');
        WakeWordModule.startService();
        await SecureStore.setItemAsync('wake_word_setup_done', 'true');
        setTimeout(() => router.replace('/(tabs)'), 1000);
      } else {
        setStatus('downloading');
        const emitter = new NativeEventEmitter(WakeWordModule);
        const progressSub = emitter.addListener('VoskDownloadProgress', (p: number) => setProgress(p));
        WakeWordModule.downloadModel()
          .then(async () => {
            progressSub.remove();
            setStatus('ready');
            await SecureStore.setItemAsync('wake_word_setup_done', 'true');
            setTimeout(() => router.replace('/(tabs)'), 1500);
          })
          .catch((err: { message: string }) => {
            progressSub.remove();
            setStatus('error');
            setError(err.message ?? 'Download failed');
          });
      }
    } catch (e: any) {
      router.replace('/(tabs)');
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
          <Pressable style={styles.skipBtn} onPress={() => router.replace('/(tabs)')}>
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
