/**
 * This Phone — one checklist of everything that protects the phone you're
 * holding. Each row checks the REAL state (permission granted, PIN saved…)
 * and offers one "Turn on" button. The first unfinished item is
 * highlighted so there's never a question about what to do next.
 */
import { useQuery } from 'convex/react';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, NativeModules, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { api } from '../../convex/_generated/api';
import { Icon, type IconName } from '../../src/components/Icon';
import { Card, PrimaryButton, ScreenHeader } from '../../src/components/ui';
import { startBackgroundLocationTracking } from '../../src/lib/BackgroundLocation';
import { DeviceKey } from '../../src/native/DeviceKey';
import { colors, fonts } from '../../src/lib/theme';

const { WakeWordModule } = NativeModules;

type Item = {
  key: string;
  icon: IconName;
  title: string;
  why: string;
  doneText: string;
  done: boolean;
  action: () => void;
};

export default function ThisPhoneScreen() {
  const router = useRouter();
  const devices = useQuery(api.devices.list);
  const enrollments = useQuery(api.voiceEnrollment.listEnrollments) ?? [];
  const physicalId = (globalThis as any).__myPhoneDeviceId as string | undefined;
  const myDevice = devices?.find((d) => d.physicalDeviceId === physicalId);
  const unlock = useQuery(api.unlock.status, myDevice ? { deviceId: myDevice._id } : {});

  const [perm, setPerm] = useState({ mic: false, bgLocation: false, admin: false, battery: false, strongBio: false });

  const refresh = useCallback(async () => {
    try {
      const [mic, bg, admin, battery, strong] = await Promise.all([
        Platform.OS === 'android' ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO) : Promise.resolve(false),
        Location.getBackgroundPermissionsAsync().then((r) => r.status === 'granted').catch(() => false),
        WakeWordModule?.isDeviceAdminActive ? WakeWordModule.isDeviceAdminActive() : Promise.resolve(false),
        WakeWordModule?.isIgnoringBatteryOptimizations ? WakeWordModule.isIgnoringBatteryOptimizations() : Promise.resolve(true),
        DeviceKey.strongBiometric().then((s) => s === 'available').catch(() => false),
      ]);
      setPerm({ mic, bgLocation: bg, admin, battery, strongBio: strong });
    } catch {}
  }, []);

  // Re-check whenever the tab is shown or the user comes back from Settings.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const enrolled = !!myDevice && enrollments.some((e: any) => e.deviceId === myDevice._id && e.isEnrolled);
  const unlockDone = !!unlock?.hasPin && (!!unlock?.hasKey || !perm.strongBio);
  const phrase = (myDevice as any)?.customWakePhrase || myDevice?.wakePhrase || 'Hey, My-Phone, where are you?';

  const turnOnLocation = async () => {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return openSettings('location');
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status === 'granted') {
      await startBackgroundLocationTracking();
      refresh();
    } else {
      openSettings('location');
    }
  };

  const openSettings = (what: string) => {
    Alert.alert(
      'One more step in Settings',
      what === 'location'
        ? 'Tap Permissions → Location → "Allow all the time".'
        : 'Tap Permissions → Microphone → "Allow".',
      [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
    );
  };

  const items: Item[] = [
    {
      key: 'unlock',
      icon: 'fingerprint',
      title: 'Fingerprint & PIN',
      why: 'So only you can stop the alarm.',
      doneText: unlock?.hasKey ? 'Fingerprint on · PIN backup set' : 'PIN set',
      done: unlockDone,
      action: () => router.push('/biometric-setup'),
    },
    {
      key: 'voice',
      icon: 'mic',
      title: `Voice: "${phrase.replace(/[,?]/g, '').replace(/\s+/g, ' ').slice(0, 32)}"`,
      why: 'Say it out loud and this phone rings, even if it\'s on silent.',
      doneText: 'Listening · trained to your voice',
      done: perm.mic && enrolled,
      action: async () => {
        if (!perm.mic && Platform.OS === 'android') {
          const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          if (r !== PermissionsAndroid.RESULTS.GRANTED) return openSettings('mic');
          refresh();
        }
        if (myDevice) router.push({ pathname: '/voice-setup', params: { deviceId: myDevice._id } });
      },
    },
    {
      key: 'location',
      icon: 'pin',
      title: 'Location',
      why: 'So you can see this phone on the map when it\'s lost.',
      doneText: 'On, even when the app is closed',
      done: perm.bgLocation,
      action: turnOnLocation,
    },
    {
      key: 'lock',
      icon: 'lock',
      title: 'Remote lock',
      why: 'So you can lock this phone from your other phone.',
      doneText: 'You can lock this phone from anywhere',
      done: perm.admin,
      action: () => WakeWordModule?.requestDeviceAdmin?.(),
    },
    {
      key: 'battery',
      icon: 'refresh',
      title: 'Keep running in the background',
      why: 'Stops your phone\'s battery saver from switching My-Phone off.',
      doneText: 'My-Phone stays on',
      done: perm.battery,
      action: () => WakeWordModule?.requestIgnoreBatteryOptimizations?.(),
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const next = items.find((i) => !i.done);

  return (
    <View style={styles.container}>
      <ScreenHeader title="This Phone" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}>
        <Card style={styles.summary}>
          <Progress done={doneCount} total={items.length} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.summaryTitle}>
              {doneCount === items.length ? "You're protected" : doneCount >= items.length - 1 ? 'Almost protected' : 'Not protected yet'}
            </Text>
            <Text style={styles.muted}>
              {next ? 'Turn on the highlighted item below.' : 'Everything is on. Nothing to do.'}
            </Text>
          </View>
        </Card>

        {items.map((it) => {
          const isNext = next?.key === it.key;
          return (
            <Card key={it.key} highlight={isNext} style={styles.item}>
              <View style={styles.itemTop}>
                <View style={[styles.bubble, it.done ? styles.bubbleDone : null]}>
                  <Icon name={it.done ? 'check' : it.icon} size={20} color={it.done ? colors.successText : colors.gold} strokeWidth={it.done ? 2.6 : 2} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.itemTitle}>{it.title}</Text>
                  <Text style={styles.muted}>{it.done ? it.doneText : it.why}</Text>
                </View>
              </View>
              {!it.done && (
                isNext
                  ? <PrimaryButton size="md" label="Turn on" onPress={it.action} />
                  : <PrimaryButton size="md" tone="light" label="Turn on" onPress={it.action} style={{ backgroundColor: colors.bgElevated }} />
              )}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${done} of ${total} protections on`}>
      <Svg width={64} height={64} style={{ position: 'absolute' }}>
        <Circle cx={32} cy={32} r={r} stroke={colors.track} strokeWidth={7} fill="none" />
        <Circle
          cx={32} cy={32} r={r} stroke={colors.gold} strokeWidth={7} fill="none"
          strokeDasharray={`${(c * done) / total} ${c}`} strokeLinecap="round"
          transform="rotate(-90 32 32)"
        />
      </Svg>
      <Text style={{ fontFamily: fonts.extrabold, fontSize: 16, color: colors.textPrimary }}>{done}/{total}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  summaryTitle: { fontFamily: fonts.extrabold, fontSize: 19, color: colors.textPrimary },
  muted: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textMuted },
  item: { gap: 12, padding: 16 },
  itemTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  bubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.goldDim, alignItems: 'center', justifyContent: 'center' },
  bubbleDone: { backgroundColor: colors.successDim },
  itemTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.textPrimary },
});
