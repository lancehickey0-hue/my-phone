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
import { Logo, PrimaryButton, TextButton } from '../src/components/ui';
import { colors, fonts } from '../src/lib/theme';

const { WakeWordModule } = NativeModules;

const CONVEX_SITE_URL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL || 'https://cheery-buffalo-947.convex.site';

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
      logStep('location_foreground: requesting');
      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      logStep('location_foreground: done, status=' + fgStatus);
      if (fgStatus === 'granted') {
        logStep('location_background: requesting');
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
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
    try {
      await requestLocationPermission();

      if (!WakeWordModule) {
        router.replace('/auth');
        return;
      }

      const ready = await WakeWordModule.isModelReady();
      if (ready) {
        await ensureSpeakerModel();
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
            await ensureSpeakerModel();
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
      <Logo width={140} />
      <Text style={styles.title}>Setting up My-Phone</Text>

      {status === 'checking' && (
        <>
          <Text style={styles.subtitle}>
            If your phone asks about location, choose <Text style={styles.strong}>"Allow all the time"</Text>. That's how you'll find it on the map.
          </Text>
          <ActivityIndicator color={colors.gold} size="large" style={{ marginTop: 24 }} />
        </>
      )}

      {status === 'downloading' && (
        <>
          <Text style={styles.subtitle}>Getting voice recognition ready… {progress}%</Text>
          <View style={styles.progressBar} accessibilityLabel={`${progress} percent`}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.hint}>One-time download. After this it works offline, even with the screen off.</Text>
        </>
      )}

      {status === 'ready' && <Text style={styles.ready}>Ready ✓</Text>}

      {status === 'error' && (
        <>
          <Text style={styles.errorText}>The download didn't finish</Text>
          <Text style={styles.hint}>Check your internet connection and try again.</Text>
          <PrimaryButton label="Try again" onPress={checkAndSetup} style={{ alignSelf: 'stretch', marginTop: 24 }} />
          <TextButton label="Skip for now" muted onPress={() => router.replace('/auth')} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontFamily: fonts.extrabold, fontSize: 30, color: colors.textPrimary, textAlign: 'center', marginTop: 8 },
  subtitle: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 27, color: colors.textSecondary, textAlign: 'center' },
  strong: { fontFamily: fonts.extrabold, color: colors.textPrimary },
  progressBar: { width: '100%', height: 10, backgroundColor: colors.track, borderRadius: 5, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 5 },
  hint: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  ready: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.successText, marginTop: 16 },
  errorText: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.dangerText, marginTop: 16, textAlign: 'center' },
});
