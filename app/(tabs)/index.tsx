/**
 * Find — the home screen.
 *
 * Pick a device (chips), see it on the map, and do the one thing you most
 * likely came for: Ring it. Everything else (lock, directions) is one tap
 * below. Replaces the old Dashboard, Devices, Locate and Map tabs, which
 * all showed the same list with different buttons.
 */
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Icon } from '../../src/components/Icon';
import { Card, PrimaryButton, ScreenHeader, SecondaryButton, StatusPill } from '../../src/components/ui';
import { getCallerProof } from '../../src/lib/deviceIdentity';
import { MAP_HTML } from '../../src/lib/mapHtml';
import { colors, fonts } from '../../src/lib/theme';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function timeAgo(ts?: number): string {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

function pinLabel(name: string): string {
  const ch = (name.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase();
  return ch;
}

export default function FindScreen() {
  const router = useRouter();
  const devices = useQuery(api.devices.list);
  const triggerAlarm = useMutation(api.devices.triggerAlarm);
  const stopAlarm = useMutation(api.devices.stopAlarm);
  const lockDevice = useMutation(api.devices.lockDevice);
  const unlockDevice = useMutation(api.devices.unlockDevice);

  const physicalId = (globalThis as any).__myPhoneDeviceId as string | undefined;
  const [selectedId, setSelectedId] = useState<Id<'devices'> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const webviewRef = useRef<WebView>(null);
  const [, tick] = useState(0);

  // Re-render every 30s so "2 min ago" stays true.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Default selection: anything ringing first, else a device that isn't
  // the one in your hand (that's the one you'd be looking for).
  useEffect(() => {
    if (!devices?.length) return;
    if (selectedId && devices.some((d) => d._id === selectedId)) return;
    const pick =
      devices.find((d) => d.isAlarmActive) ??
      devices.find((d) => d.physicalDeviceId !== physicalId) ??
      devices[0];
    setSelectedId(pick._id);
  }, [devices, selectedId, physicalId]);

  const selected = devices?.find((d) => d._id === selectedId);
  const isThisPhone = !!selected && !!physicalId && selected.physicalDeviceId === physicalId;
  const hasLocation = selected?.lastLatitude != null && selected?.lastLongitude != null;
  const online = !!selected?.lastSeenAt && Date.now() - selected.lastSeenAt < ONLINE_WINDOW_MS;

  const sendToMap = useCallback((msg: object) => {
    webviewRef.current?.injectJavaScript(`handleMessage(${JSON.stringify(JSON.stringify(msg))}); true;`);
  }, []);

  const markers = useMemo(
    () =>
      (devices ?? [])
        .filter((d) => d.lastLatitude != null && d.lastLongitude != null)
        .map((d) => ({
          id: d._id,
          lat: d.lastLatitude,
          lng: d.lastLongitude,
          label: pinLabel(d.name),
          alarm: d.isAlarmActive,
          selected: d._id === selectedId,
        })),
    [devices, selectedId],
  );

  useEffect(() => {
    if (mapReady) sendToMap({ type: 'updateMarkers', devices: markers });
  }, [mapReady, markers, sendToMap]);

  // Center on the selected device when it changes.
  useEffect(() => {
    if (mapReady && selected && hasLocation) {
      sendToMap({ type: 'centerOn', lat: selected.lastLatitude, lng: selected.lastLongitude, zoom: 16 });
    }
  }, [mapReady, selectedId, hasLocation]);

  // Blue dot for where you are.
  useEffect(() => {
    if (!mapReady) return;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getLastKnownPositionAsync();
        if (pos) sendToMap({ type: 'setUserLocation', lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {}
    })();
  }, [mapReady, sendToMap]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      Alert.alert("That didn't work", e?.data ?? e?.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const openDirections = () => {
    if (!selected || !hasLocation) return;
    const dest = `${selected.lastLatitude},${selected.lastLongitude}`;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=walking`);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Find"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add or manage devices"
            onPress={() => router.push('/manage-devices')}
            style={styles.roundBtn}
          >
            <Icon name="plus" size={20} />
          </Pressable>
        }
      />

      {devices === undefined ? null : devices.length === 0 ? (
        <View style={{ paddingHorizontal: 20 }}>
          <Card>
            <Text style={styles.cardTitle}>Setting up this phone…</Text>
            <Text style={styles.muted}>It will show up here in a moment. Sign in on your other phones to see them here too.</Text>
          </Card>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {devices.map((d) => {
              const active = d._id === selectedId;
              return (
                <Pressable
                  key={d._id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setSelectedId(d._id)}
                  style={[styles.chip, active && styles.chipActive, d.isAlarmActive && !active && styles.chipAlarm]}
                >
                  {d.isAlarmActive && <View style={styles.chipDot} />}
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.mapWrap}>
            <WebView
              ref={webviewRef}
              source={{ html: MAP_HTML }}
              style={styles.map}
              onMessage={(e) => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data);
                  if (msg.type === 'ready') setMapReady(true);
                  else if (msg.type === 'selectDevice') setSelectedId(msg.deviceId);
                } catch {}
              }}
              originWhitelist={['*']}
              javaScriptEnabled
            />
            {!hasLocation && selected && (
              <View style={styles.mapOverlay} pointerEvents="none">
                <Text style={styles.mapOverlayText}>No location for {selected.name} yet</Text>
              </View>
            )}
          </View>

          {selected && (
            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              {selected.isAlarmActive ? (
                <Card style={styles.alarmCard}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.cardTitle}>Ringing now</Text>
                      <Text style={styles.muted}>{selected.name} is playing a loud alarm and is locked. Listen for it.</Text>
                    </View>
                    <StatusPill tone="alarm" label="Ringing" />
                  </View>
                  {isThisPhone ? (
                    <Text style={styles.muted}>Use your fingerprint or PIN on the lock screen to stop it.</Text>
                  ) : (
                    <PrimaryButton
                      tone="light"
                      label="I found it — stop ringing"
                      loading={busy === 'stop'}
                      onPress={() => run('stop', async () => stopAlarm({ deviceId: selected._id, ...(await getCallerProof()) }))}
                    />
                  )}
                  {hasLocation && !isThisPhone && <SecondaryButton icon="navigate" label="Get directions" onPress={openDirections} />}
                </Card>
              ) : (
                <Card style={{ gap: 16 }}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{selected.name}</Text>
                      <Text style={styles.muted} numberOfLines={2}>
                        {isThisPhone
                          ? 'The phone in your hand'
                          : `${selected.lastLocationName || (hasLocation ? 'On the map' : 'Location not known yet')} · ${timeAgo(selected.lastSeenAt)}`}
                      </Text>
                    </View>
                    <StatusPill tone={online ? 'online' : 'offline'} label={online ? 'Online' : 'Offline'} />
                  </View>

                  {isThisPhone ? (
                    <Text style={styles.muted}>
                      To find this phone, open My-Phone on another phone, or say "{(selected as any).customWakePhrase || selected.wakePhrase}" near it.
                    </Text>
                  ) : (
                    <>
                      <PrimaryButton
                        icon="bell"
                        label="Ring it"
                        loading={busy === 'ring'}
                        onPress={() => run('ring', () => triggerAlarm({ deviceId: selected._id }))}
                      />
                      <View style={styles.twoUp}>
                        {selected.isLocked ? (
                          <SecondaryButton
                            icon="unlock"
                            label="Unlock"
                            loading={busy === 'lock'}
                            style={{ flex: 1 }}
                            onPress={() => run('lock', async () => unlockDevice({ deviceId: selected._id, ...(await getCallerProof()) }))}
                          />
                        ) : (
                          <SecondaryButton
                            icon="lock"
                            label="Lock it"
                            loading={busy === 'lock'}
                            style={{ flex: 1 }}
                            onPress={() => run('lock', () => lockDevice({ deviceId: selected._id }))}
                          />
                        )}
                        <SecondaryButton
                          icon="navigate"
                          label="Directions"
                          disabled={!hasLocation}
                          style={{ flex: 1 }}
                          onPress={openDirections}
                        />
                      </View>
                    </>
                  )}
                </Card>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  roundBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },

  chips: { paddingHorizontal: 20, paddingBottom: 14, gap: 8 },
  chip: { height: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: colors.borderLight, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipAlarm: { borderColor: colors.danger },
  chipDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger },
  chipText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textSecondary },
  chipTextActive: { fontFamily: fonts.bold, color: colors.bgPrimary },

  mapWrap: { marginHorizontal: 20, flex: 1, minHeight: 220, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', backgroundColor: '#12161C' },
  map: { flex: 1, backgroundColor: '#12161C' },
  mapOverlay: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' },
  mapOverlayText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.textSecondary, backgroundColor: 'rgba(10,10,14,0.85)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, overflow: 'hidden' },

  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.textPrimary },
  muted: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textMuted },
  twoUp: { flexDirection: 'row', gap: 10 },
  alarmCard: { gap: 16, borderWidth: 2, borderColor: colors.danger, paddingBottom: 20 },
});
