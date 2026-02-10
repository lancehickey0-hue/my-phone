import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import {
  addSpeechListener,
  isNativeSpeechRecognitionAvailable,
  requestSpeechRecognitionPermissionsAsync,
  startSpeechRecognition,
  stopSpeechRecognition,
} from '../../src/lib/speechRecognition';

import Card from '../../src/components/Card';
import PrimaryButton from '../../src/components/PrimaryButton';
import { colors } from '../../src/theme/colors';
import { api, apiPath } from '../../src/lib/api';
import { useDeviceStore } from '../../src/stores/deviceStore';
import { useLocatorStore } from '../../src/stores/locatorStore';

const schema = z.object({
  enabled: z.boolean(),
  wake_phrase: z.string().min(3, 'Too short'),
  stop_phrase: z.string().min(2, 'Too short'),
});

type FormValues = z.infer<typeof schema>;

function normalize(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function LocatorScreen() {
  const insets = useSafeAreaInsets();
  const { deviceId } = useDeviceStore();
  const { settings, setSettings, isAlerting, setIsAlerting, transcript, setTranscript } = useLocatorStore();

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micGranted, setMicGranted] = useState<boolean | null>(null);

  const cameraRef = useRef<CameraView>(null);
  const [torchOn, setTorchOn] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const [recognizing, setRecognizing] = useState(false);

  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, reset, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      enabled: true,
      wake_phrase: 'my phone where are you',
      stop_phrase: "i've found you",
    },
  });

  const enabled = watch('enabled');
  const wakePhraseRaw = watch('wake_phrase');
  const stopPhraseRaw = watch('stop_phrase');
  const wakePhrase = useMemo(() => normalize(wakePhraseRaw), [wakePhraseRaw]);
  const stopPhrase = useMemo(() => normalize(stopPhraseRaw), [stopPhraseRaw]);

  useEffect(() => {
    if (!deviceId) return;
    let mounted = true;
    (async () => {
      try {
        setLoadingSettings(true);
        const res = await api.get(apiPath(`/locator/settings/${deviceId}`));
        if (!mounted) return;
        setSettings(res.data);
        reset({
          enabled: res.data.enabled,
          wake_phrase: res.data.wake_phrase,
          stop_phrase: res.data.stop_phrase,
        });
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load settings');
      } finally {
        if (mounted) setLoadingSettings(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [deviceId, reset, setSettings]);

  useEffect(() => {
    // request mic permission
    (async () => {
      const perm = await Audio.requestPermissionsAsync();
      setMicGranted(perm.granted);
    })();
  }, []);

  useEffect(() => {
    const subResult = addSpeechListener('result', (event: any) => {
      const best = event?.results?.[0]?.transcript ?? '';
      if (best) setTranscript(best);
    });

    const subError = addSpeechListener('error', (event: any) => {
      setError(`Speech error: ${event?.error ?? 'unknown'}`);
      setRecognizing(false);
    });

    return () => {
      try {
        subResult?.remove?.();
        subError?.remove?.();
      } catch {
        // ignore
      }
    };
  }, [setTranscript]);

  useEffect(() => {
    if (!enabled) return;
    if (!transcript) return;

    const t = normalize(transcript);

    if (!isAlerting && t.includes(wakePhrase)) {
      startAlert().catch((e) => setError(e?.message ?? 'Failed to start alert'));
    }

    if (isAlerting && t.includes(stopPhrase)) {
      stopAlert().catch((e) => setError(e?.message ?? 'Failed to stop alert'));
    }
  }, [enabled, isAlerting, stopPhrase, transcript, wakePhrase]);

  async function startRecognition() {
    try {
      setError(null);
      const p = await requestSpeechRecognitionPermissionsAsync();
      if (!p.granted) {
        setError('Speech recognition permission not granted');
        setMicGranted(false);
        return;
      }
      setMicGranted(true);
      setRecognizing(true);
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
      } as any);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to start listening');
      setRecognizing(false);
    }
  }

  async function stopRecognition() {
    try {
      ExpoSpeechRecognitionModule.stop();
    } finally {
      setRecognizing(false);
    }
  }

  async function loadSound() {
    if (soundRef.current) return soundRef.current;
    const { sound } = await Audio.Sound.createAsync(require('../../assets/sounds/chime.wav'), {
      shouldPlay: false,
      isLooping: true,
      volume: 1.0,
    });
    soundRef.current = sound;
    return sound;
  }

  async function startAlert() {
    setError(null);

    if (!camPerm?.granted) {
      const r = await requestCamPerm();
      if (!r.granted) {
        setError('Camera permission is required for flashlight');
      }
    }

    const sound = await loadSound();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      interruptionModeIOS: 1,
      interruptionModeAndroid: 1,
      playThroughEarpieceAndroid: false,
    });

    setIsAlerting(true);
    setTorchOn(true);
    await sound.playAsync();
  }

  async function stopAlert() {
    setError(null);
    setTorchOn(false);
    setIsAlerting(false);
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
      } catch {
        // ignore
      }
    }
  }

  async function onSave(values: FormValues) {
    if (!deviceId) return;
    try {
      setSaving(true);
      setError(null);
      const res = await api.put(apiPath(`/locator/settings/${deviceId}`), {
        enabled: values.enabled,
        wake_phrase: values.wake_phrase,
        stop_phrase: values.stop_phrase,
      });
      setSettings(res.data);
      reset({
        enabled: res.data.enabled,
        wake_phrase: res.data.wake_phrase,
        stop_phrase: res.data.stop_phrase,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => undefined);
    };
  }, []);

  const dismissKeyboard = () => Keyboard.dismiss();

  return (
    <Pressable style={{ flex: 1 }} onPress={dismissKeyboard}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { paddingTop: insets.top + 8 }]}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View style={styles.header}>
            <Text style={styles.title}>Phone Locator</Text>
            <Text style={styles.subtitle}>
              Foreground listening (MVP). Say your wake phrase to start the alert.
            </Text>
          </View>

          <Card style={{ marginTop: 16 }}>
            <Text style={styles.cardTitle}>Listening</Text>
            <Text style={styles.cardHint}>
              Microphone: {micGranted === null ? 'Checking…' : micGranted ? 'Granted' : 'Not granted'}
            </Text>
            <Text style={styles.cardHint}>
              Camera (torch): {camPerm?.granted ? 'Granted' : 'Not granted'}
            </Text>

            <View style={styles.row}>
              <PrimaryButton
                title={recognizing ? 'Listening…' : 'Start listening'}
                onPress={startRecognition}
                disabled={recognizing}
                style={{ flex: 1 }}
              />
              <View style={{ width: 12 }} />
              <PrimaryButton
                title="Stop"
                onPress={stopRecognition}
                disabled={!recognizing}
                variant="secondary"
                style={{ width: 110 }}
              />
            </View>

            <Text style={[styles.cardHint, { marginTop: 12 }]}>Heard: {transcript ? `“${transcript}”` : '—'}</Text>
          </Card>

          <Card style={{ marginTop: 16 }}>
            <Text style={styles.cardTitle}>Commands</Text>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Enable locator</Text>
              <Controller
                control={control}
                name="enabled"
                render={({ field: { value, onChange } }) => (
                  <Pressable
                    onPress={() => onChange(!value)}
                    style={[styles.toggle, value ? styles.toggleOn : styles.toggleOff]}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: value }}
                  >
                    <Text style={styles.toggleText}>{value ? 'On' : 'Off'}</Text>
                  </Pressable>
                )}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Wake phrase</Text>
              <Controller
                control={control}
                name="wake_phrase"
                render={({ field: { value, onChange }, fieldState }) => (
                  <>
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      placeholder="e.g. My Phone, where are you"
                      placeholderTextColor={colors.subtext}
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                    />
                    {!!fieldState.error?.message && (
                      <Text style={styles.error}>{fieldState.error.message}</Text>
                    )}
                    <Text style={styles.cardHint}>Normalized match: “{normalize(value)}”</Text>
                  </>
                )}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>Stop phrase</Text>
              <Controller
                control={control}
                name="stop_phrase"
                render={({ field: { value, onChange }, fieldState }) => (
                  <>
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      placeholder="e.g. I've found you"
                      placeholderTextColor={colors.subtext}
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                    />
                    {!!fieldState.error?.message && (
                      <Text style={styles.error}>{fieldState.error.message}</Text>
                    )}
                    <Text style={styles.cardHint}>Normalized match: “{normalize(value)}”</Text>
                  </>
                )}
              />
            </View>

            <PrimaryButton
              title={loadingSettings ? 'Loading…' : saving ? 'Saving…' : 'Save commands'}
              onPress={handleSubmit(onSave)}
              loading={saving}
              disabled={!deviceId || loadingSettings}
              style={{ marginTop: 14 }}
            />

            {!!error && <Text style={[styles.error, { marginTop: 10 }]}>{error}</Text>}
          </Card>

          <Card style={{ marginTop: 16 }}>
            <Text style={styles.cardTitle}>Alert</Text>
            <Text style={styles.cardHint}>
              You chose “best effort” override: plays in silent mode where allowed, plus flashlight.
            </Text>

            <View style={styles.row}>
              <PrimaryButton
                title={isAlerting ? 'Alert running' : 'Test alert'}
                onPress={startAlert}
                disabled={isAlerting}
                style={{ flex: 1 }}
              />
              <View style={{ width: 12 }} />
              <PrimaryButton
                title="Stop alert"
                onPress={stopAlert}
                variant="danger"
                disabled={!isAlerting}
                style={{ width: 130 }}
              />
            </View>

            <View style={{ height: 12 }} />
            <View style={styles.cameraWrap}>
              {/* CameraView is used only to control torch (needs device, not simulator) */}
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                enableTorch={torchOn}
              />
              <View style={styles.cameraOverlay}>
                <Text style={styles.cameraHint}>Flashlight {torchOn ? 'On' : 'Off'}</Text>
              </View>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: 8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 6,
    color: colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  cardHint: {
    marginTop: 6,
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  toggle: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: 'rgba(46,209,255,0.18)',
  },
  toggleOff: {
    backgroundColor: colors.card2,
  },
  toggleText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  cameraWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card2,
    height: 170,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cameraHint: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
});
