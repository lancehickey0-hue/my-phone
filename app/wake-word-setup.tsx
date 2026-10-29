import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  NativeModules,
  NativeEventEmitter,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { startBackgroundLocationTracking } from '../src/lib/BackgroundLocation';

const { WakeWordModule } = NativeModules;

const CONVEX_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL || 'https://cheery-buffalo-947.convex.site';

// Android sometimes never answers a permission request (another dialog in
// the way, two requests at once, OEM quirks), and the promise then hangs
// forever. Every request here gets a deadline so setup always moves on.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label + ' timed out')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// Guards against this screen running setup twice at the same time (e.g. if
// it's ever mounted twice). Reset when a run finishes so Retry still works.
let setupRunning = false;

function logStep(message: string, level: string = 'info') {
  fetch(`${CONVEX_SITE_URL}/logDebug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'permissions', message, level }),
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

  async function requestLocationPermission() {
    logStep('start');

    // Location runs first and alone in this screen, deliberately. It used
    // to run fourth in a chain of four sequential permission dialogs
    // (notifications -> mic -> phone_state -> location), and on some
    // Android devices requestForegroundPermissionsAsync() would hang
    // indefinitely — never resolving or rejecting — when fired after other
    // permission dialogs earlier in the same session. This is a documented
    // expo-location/Android issue, not something specific to this app's
    // code. Running it first, alone, before anything else has touched the
    // permission dialog queue, avoids that failure mode. notifications,
    // mic, phone_state, and device_admin now happen post-login instead, in
    // device-setup.tsx.
    try {
      // Check first: no dialog needed if it's already granted.
      let fgStatus = (await withTimeout(Location.getForegroundPermissionsAsync(), 5000, 'location_foreground check')).status;
      if (fgStatus !== 'granted') {
        logStep('location_foreground: requesting');
        fgStatus = (await withTimeout(Location.requestForegroundPermissionsAsync(), 30000, 'location_foreground')).status;
      }
      logStep('location_foreground: done, status=' + fgStatus);
      if (fgStatus === 'granted') {
        let bgStatus = (await withTimeout(Location.getBackgroundPermissionsAsync(), 5000, 'location_background check')).status;
        if (bgStatus !== 'granted') {
          logStep('location_background: requesting');
          // On Android 11+ this sends the user to Settings ("Allow all the
          // time"); if they never come back, don't block the model download.
          bgStatus = (await withTimeout(Location.requestBackgroundPermissionsAsync(), 60000, 'location_background')).status;
        }
        logStep('location_background: done, status=' + bgStatus);
        if (bgStatus === 'granted') {
          await startBackgroundLocationTracking();
        }
      }
    } catch (e) {
      console.warn('[Permissions] Location request failed:', e);
      logStep('location: FAILED ' + (e as any)?.message, 'error');
    }

    logStep('requestLocationPermission: finished');
  }

  // Non-fatal by design: speaker verification is additive on top of
  // keyword-based wake-word detection, not a hard dependency. If this
  // fails (offline, storage full, etc.), wake-word matching still works
  // exactly as before -- just without the "actually your voice" check.
  async function ensureSpeakerModel(): Promise<void> {
    try {
      const spkReady = await WakeWordModule.isSpeakerModelReady();
      if (spkReady) return;
      await WakeWordModule.downloadSpeakerModel();
    } catch (e) {
      console.warn('[Setup] Speaker model download failed (non-fatal):', e);
    }
  }

  async function checkAndSetup() {
    if (setupRunning) {
      logStep('checkAndSetup: already running, skipped duplicate');
      return;
    }
    setupRunning = true;
    setStatus('checking');
    setError('');
    try {
      await requestLocationPermission();

      if (!WakeWordModule) {
        setupRunning = false;
        router.replace('/auth');
        return;
      }

      const ready = await withTimeout<boolean>(WakeWordModule.isModelReady(), 15000, 'isModelReady');
      logStep('isModelReady: ' + ready);
      if (ready) {
        await ensureSpeakerModel();
        setStatus('ready');
        await SecureStore.setItemAsync('wake_word_setup_done', 'true');
        setupRunning = false;
        setTimeout(() => router.replace('/auth'), 1000);
      } else {
        setStatus('downloading');
        const emitter = new NativeEventEmitter(WakeWordModule);
        const progressSub = emitter.addListener('VoskDownloadProgress', (p: number) => setProgress(p));
        WakeWordModule.downloadModel()
          .then(async () => {
            progressSub.remove();
            await ensureSpeakerModel();
            setStatus('ready');
            await SecureStore.setItemAsync('wake_word_setup_done', 'true');
            setupRunning = false;
            setTimeout(() => router.replace('/auth'), 1500);
          })
          .catch((err: { message: string }) => {
            progressSub.remove();
            setupRunning = false;
            logStep('downloadModel FAILED: ' + (err?.message ?? 'unknown'), 'error');
            setStatus('error');
            setError(err.message ?? 'Download failed');
          });
      }
    } catch (e: any) {
      // Something hung or threw before the download could start. Show
      // Retry / Skip instead of silently skipping the voice model.
      setupRunning = false;
      logStep('checkAndSetup FAILED: ' + (e?.message ?? String(e)), 'error');
      setStatus('error');
      setError(e?.message ?? 'Setup could not finish');
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
          <Text style={styles.errorText}>⚠️ Setup didn't finish</Text>
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
