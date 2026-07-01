import { useMutation, useQuery } from 'convex/react';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { api } from '../../convex/_generated/api';
import { deviceEmojis, type DeviceType } from '../../src/lib/deviceIcons';
import { borderRadius, colors, spacing } from '../../src/lib/theme';
import type { Id } from '../../convex/_generated/dataModel';

type RemoteAction = 'alarm' | 'lock' | 'unlock' | 'stop_alarm';

const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #0d0d12; }
    .device-pin {
      width: 40px; height: 40px; border-radius: 20px;
      background: #17171f; border: 2px solid #d4af37;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    }
    .device-pin.alarm { border-color: #ef4444; background: rgba(239,68,68,0.15); }
    .device-pin.selected { border-width: 3px; border-color: #d4af37; transform: scale(1.15); }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { zoomControl: true }).setView([37.7749, -122.4194], 4);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    let markers = {};
    let routeLine = null;
    let userMarker = null;

    function post(msg) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }

    function updateMarkers(devices) {
      const seen = new Set();
      devices.forEach(function(d) {
        if (d.lat == null || d.lng == null) return;
        seen.add(d.id);
        const icon = L.divIcon({
          className: '',
          html: '<div class="device-pin' + (d.alarm ? ' alarm' : '') + (d.selected ? ' selected' : '') + '">' + d.emoji + '</div>',
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
        if (markers[d.id]) {
          markers[d.id].setLatLng([d.lat, d.lng]);
          markers[d.id].setIcon(icon);
        } else {
          const m = L.marker([d.lat, d.lng], { icon: icon }).addTo(map);
          m.on('click', function() { post({ type: 'selectDevice', deviceId: d.id }); });
          markers[d.id] = m;
        }
      });
      Object.keys(markers).forEach(function(id) {
        if (!seen.has(id)) { map.removeLayer(markers[id]); delete markers[id]; }
      });
    }

    function centerOn(lat, lng, zoom) {
      map.setView([lat, lng], zoom || 15, { animate: true });
    }

    function fitAll(points) {
      if (!points.length) return;
      const bounds = L.latLngBounds(points.map(function(p) { return [p.lat, p.lng]; }));
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    function setUserLocation(lat, lng) {
      if (userMarker) {
        userMarker.setLatLng([lat, lng]);
      } else {
        userMarker = L.circleMarker([lat, lng], {
          radius: 7, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.8, weight: 2,
        }).addTo(map);
      }
    }

    function drawRoute(coords) {
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      if (!coords || !coords.length) return;
      routeLine = L.polyline(coords, { color: '#8B5CF6', weight: 4, opacity: 0.85 }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    }

    function clearRoute() {
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    }

    document.addEventListener('message', function(e) { handleMessage(e.data); });
    window.addEventListener('message', function(e) { handleMessage(e.data); });

    function handleMessage(data) {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'updateMarkers') updateMarkers(msg.devices);
        else if (msg.type === 'centerOn') centerOn(msg.lat, msg.lng, msg.zoom);
        else if (msg.type === 'fitAll') fitAll(msg.points);
        else if (msg.type === 'setUserLocation') setUserLocation(msg.lat, msg.lng);
        else if (msg.type === 'drawRoute') drawRoute(msg.coords);
        else if (msg.type === 'clearRoute') clearRoute();
      } catch (err) {}
    }

    post({ type: 'ready' });
  </script>
</body>
</html>
`;

export default function MapTab() {
  const devices = useQuery(api.devices.list) ?? [];
  const triggerAlarm = useMutation(api.devices.triggerAlarm);
  const stopAlarm = useMutation(api.devices.stopAlarm);
  const lockDevice = useMutation(api.devices.lockDevice);
  const unlockDevice = useMutation(api.devices.unlockDevice);

  const [selectedDeviceId, setSelectedDeviceId] = useState<Id<'devices'> | null>(null);
  const [actionLoading, setActionLoading] = useState<RemoteAction | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const webviewRef = useRef<WebView>(null);

  const selectedDevice = devices.find((d) => d._id === selectedDeviceId);
  const devicesWithLocation = devices.filter((d) => d.lastLatitude && d.lastLongitude);

  const sendToMap = useCallback((msg: object) => {
    webviewRef.current?.injectJavaScript(
      `handleMessage(${JSON.stringify(JSON.stringify(msg))}); true;`
    );
  }, []);

  // Get user's own location once, for the blue dot + routing origin
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    })();
  }, []);

  useEffect(() => {
    if (mapReady && userLocation) {
      sendToMap({ type: 'setUserLocation', lat: userLocation.latitude, lng: userLocation.longitude });
    }
  }, [mapReady, userLocation, sendToMap]);

  // Push device markers into the map whenever devices or selection changes
  useEffect(() => {
    if (!mapReady) return;
    sendToMap({
      type: 'updateMarkers',
      devices: devicesWithLocation.map((d) => ({
        id: d._id,
        lat: d.lastLatitude,
        lng: d.lastLongitude,
        emoji: deviceEmojis[d.type as DeviceType],
        alarm: d.isAlarmActive,
        selected: d._id === selectedDeviceId,
      })),
    });
  }, [mapReady, devicesWithLocation, selectedDeviceId, sendToMap]);

  // Initial fit-to-bounds once markers first load
  useEffect(() => {
    if (mapReady && devicesWithLocation.length > 0) {
      sendToMap({
        type: 'fitAll',
        points: devicesWithLocation.map((d) => ({ lat: d.lastLatitude, lng: d.lastLongitude })),
      });
    }
  }, [mapReady, devicesWithLocation.length]);

  const handleSelectDevice = useCallback((deviceId: Id<'devices'>) => {
    setSelectedDeviceId(deviceId);
    const device = devices.find((d) => d._id === deviceId);
    if (device?.lastLatitude && device?.lastLongitude) {
      sendToMap({ type: 'centerOn', lat: device.lastLatitude, lng: device.lastLongitude, zoom: 16 });
    }
  }, [devices, sendToMap]);

  const handleWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ready') setMapReady(true);
      else if (msg.type === 'selectDevice') handleSelectDevice(msg.deviceId);
    } catch {}
  }, [handleSelectDevice]);

  const handleAction = useCallback(async (action: RemoteAction) => {
    if (!selectedDeviceId) return;
    setActionLoading(action);
    try {
      switch (action) {
        case 'alarm':     await triggerAlarm({ deviceId: selectedDeviceId }); break;
        case 'stop_alarm': await stopAlarm({ deviceId: selectedDeviceId }); break;
        case 'lock':      await lockDevice({ deviceId: selectedDeviceId }); break;
        case 'unlock':    await unlockDevice({ deviceId: selectedDeviceId }); break;
      }
    } catch {
      Alert.alert('Error', `Failed to ${action.replace('_', ' ')} device.`);
    } finally {
      setActionLoading(null);
    }
  }, [selectedDeviceId, triggerAlarm, stopAlarm, lockDevice, unlockDevice]);

  // Free OSRM routing — walking directions from user's location to the device
  const handleDirections = useCallback(async () => {
    if (!selectedDevice?.lastLatitude || !selectedDevice?.lastLongitude) {
      Alert.alert('No Location', 'This device has no location data yet.');
      return;
    }
    if (!userLocation) {
      Alert.alert('Location Needed', 'Enable location permissions to get walking directions.');
      return;
    }
    try {
      const url = `https://router.project-osrm.org/route/v1/foot/${userLocation.longitude},${userLocation.latitude};${selectedDevice.lastLongitude},${selectedDevice.lastLatitude}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      const coords = data?.routes?.[0]?.geometry?.coordinates;
      if (!coords) {
        Alert.alert('No Route Found', 'Could not calculate a walking route.');
        return;
      }
      const latLngCoords = coords.map(([lng, lat]: [number, number]) => [lat, lng]);
      sendToMap({ type: 'drawRoute', coords: latLngCoords });
    } catch {
      Alert.alert('Error', 'Failed to fetch directions. Check your connection.');
    }
  }, [selectedDevice, userLocation, sendToMap]);

  const formatLastSeen = (ts?: number) => {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  };

  return (
    <View style={styles.container}>
      {/* ─── Interactive Map ──────────────────────────────────────── */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webviewRef}
          source={{ html: MAP_HTML }}
          style={styles.map}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
        />

        <View style={[styles.trackingBadge, { pointerEvents: 'none' }]}>
          <View style={styles.trackingDot} />
          <Text style={styles.trackingText}>LIVE</Text>
        </View>
        <View style={[styles.countBadge, { pointerEvents: 'none' }]}>
          <Text style={styles.countText}>
            {devicesWithLocation.length}/{devices.length} located
          </Text>
        </View>
      </View>

      {/* ─── Bottom Panel ─────────────────────────────────────────── */}
      <ScrollView style={styles.bottomPanel} contentContainerStyle={styles.bottomContent}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <View style={styles.chipRow}>
            {devices.map((device) => (
              <Pressable
                key={device._id}
                style={[
                  styles.chip,
                  device._id === selectedDeviceId && styles.chipSelected,
                  device.isAlarmActive && styles.chipAlarm,
                ]}
                onPress={() => handleSelectDevice(device._id)}
              >
                <Text style={styles.chipEmoji}>{deviceEmojis[device.type as DeviceType]}</Text>
                <Text style={[styles.chipName, device._id === selectedDeviceId && styles.chipNameSelected]} numberOfLines={1}>
                  {device.name}
                </Text>
                {device.isAlarmActive && <Text style={styles.chipAlarmIcon}>🚨</Text>}
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {selectedDevice && (
          <View style={styles.controlCard}>
            <View style={styles.controlHeader}>
              <Text style={styles.controlEmoji}>{deviceEmojis[selectedDevice.type as DeviceType]}</Text>
              <View style={styles.controlInfo}>
                <Text style={styles.controlName}>{selectedDevice.name}</Text>
                <Text style={styles.controlMeta}>
                  {selectedDevice.lastLocationName || 'Location updating...'} · {formatLastSeen(selectedDevice.lastSeenAt)}
                </Text>
              </View>
              <StatusBadge device={selectedDevice} />
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Coordinates</Text>
                <Text style={styles.statValue}>
                  {selectedDevice.lastLatitude
                    ? `${selectedDevice.lastLatitude.toFixed(4)}, ${selectedDevice.lastLongitude?.toFixed(4)}`
                    : '—'}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Battery</Text>
                <Text style={[styles.statValue, selectedDevice.batteryLevel != null && selectedDevice.batteryLevel < 20 && styles.statValueDanger]}>
                  {selectedDevice.batteryLevel != null ? `${selectedDevice.batteryLevel}%` : '—'}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Status</Text>
                <Text style={styles.statValue}>
                  {selectedDevice.isAlarmActive ? '🔔 Alarm' : selectedDevice.isLocked ? '🔒 Locked' : '✅ OK'}
                </Text>
              </View>
            </View>

            <Text style={styles.controlSectionTitle}>Remote Controls</Text>
            <View style={styles.actionGrid}>
              {selectedDevice.isAlarmActive ? (
                <ActionButton icon="🔕" label="Stop Alarm" color={colors.success} bgColor={colors.successDim}
                  loading={actionLoading === 'stop_alarm'} onPress={() => handleAction('stop_alarm')} />
              ) : (
                <ActionButton icon="🚨" label="Sound Alarm" color={colors.danger} bgColor={colors.dangerDim}
                  loading={actionLoading === 'alarm'}
                  onPress={() => Alert.alert('Trigger Alarm?',
                    `This will sound a loud alarm on ${selectedDevice.name} and lock it.`,
                    [{ text: 'Cancel', style: 'cancel' }, { text: 'Trigger', style: 'destructive', onPress: () => handleAction('alarm') }]
                  )} />
              )}

              {selectedDevice.isLocked ? (
                <ActionButton icon="🔓" label="Unlock" color={colors.gold} bgColor={colors.goldDim}
                  loading={actionLoading === 'unlock'} onPress={() => handleAction('unlock')} />
              ) : (
                <ActionButton icon="🔒" label="Lock Device" color={colors.warning} bgColor={colors.warningDim}
                  loading={actionLoading === 'lock'} onPress={() => handleAction('lock')} />
              )}

              <ActionButton icon="🧭" label="Get Directions" color="#8B5CF6" bgColor="rgba(139,92,246,0.15)"
                loading={false} onPress={handleDirections} />

              <ActionButton icon="📍" label="Center on Map" color={colors.info} bgColor={colors.infoDim}
                loading={false}
                onPress={() => {
                  if (selectedDevice.lastLatitude && selectedDevice.lastLongitude) {
                    sendToMap({ type: 'centerOn', lat: selectedDevice.lastLatitude, lng: selectedDevice.lastLongitude, zoom: 16 });
                  } else {
                    Alert.alert('No Location', 'This device has no location data yet.');
                  }
                }} />
            </View>
          </View>
        )}

        {!selectedDevice && devices.length > 0 && (
          <View style={styles.selectPrompt}>
            <Text style={styles.selectPromptText}>Tap a device pin or chip above to see controls</Text>
          </View>
        )}

        {devices.length === 0 && (
          <View style={styles.selectPrompt}>
            <Text style={styles.selectPromptText}>Add devices to see them on the map</Text>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

function StatusBadge({ device }: { device: { isAlarmActive: boolean; isLocked: boolean; status: string } }) {
  const isAlarm = device.isAlarmActive;
  const isLocked = device.isLocked;
  const isConnected = device.status === 'connected';
  return (
    <View style={[statusStyles.badge,
      isAlarm ? statusStyles.alarm : isLocked ? statusStyles.locked : isConnected ? statusStyles.connected : statusStyles.disconnected]}>
      <Text style={[statusStyles.text,
        isAlarm ? statusStyles.alarmText : isLocked ? statusStyles.lockedText : isConnected ? statusStyles.connectedText : statusStyles.disconnectedText]}>
        {isAlarm ? '🔔 ALARM' : isLocked ? '🔒 LOCKED' : isConnected ? '● Online' : '○ Offline'}
      </Text>
    </View>
  );
}

const statusStyles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  text: { fontSize: 11, fontWeight: '700' },
  alarm: { backgroundColor: colors.dangerDim },
  alarmText: { color: colors.danger },
  locked: { backgroundColor: colors.warningDim },
  lockedText: { color: colors.warning },
  connected: { backgroundColor: colors.successDim },
  connectedText: { color: colors.success },
  disconnected: { backgroundColor: 'rgba(255,255,255,0.05)' },
  disconnectedText: { color: colors.textMuted },
});

function ActionButton({ icon, label, color, bgColor, loading, onPress }: {
  icon: string; label: string; color: string; bgColor: string; loading: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[actionStyles.btn, { backgroundColor: bgColor, borderColor: color + '30' }]}
      onPress={onPress} disabled={loading} activeOpacity={0.7}>
      <Text style={actionStyles.icon}>{loading ? '⏳' : icon}</Text>
      <Text style={[actionStyles.label, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const actionStyles = StyleSheet.create({
  btn: { width: '48%', flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, gap: 10, marginBottom: 10 },
  icon: { fontSize: 22 },
  label: { fontSize: 14, fontWeight: '700' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },

  mapContainer: { height: '44%' },
  map: { flex: 1, backgroundColor: '#0d0d12' },

  trackingBadge: {
    position: 'absolute', top: 16, left: 16,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, gap: 6,
  },
  trackingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  trackingText: { fontSize: 11, fontWeight: '800', color: colors.success, letterSpacing: 1 },
  countBadge: {
    position: 'absolute', top: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  countText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },

  bottomPanel: { flex: 1 },
  bottomContent: { padding: spacing.lg },

  chipScroll: { marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, gap: 6 },
  chipSelected: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  chipAlarm: { borderColor: colors.danger },
  chipEmoji: { fontSize: 16 },
  chipName: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, maxWidth: 100 },
  chipNameSelected: { color: colors.gold },
  chipAlarmIcon: { fontSize: 12 },

  controlCard: { backgroundColor: colors.bgCard, borderRadius: borderRadius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  controlHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  controlEmoji: { fontSize: 32 },
  controlInfo: { flex: 1 },
  controlName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  controlMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  statsRow: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  statItem: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10 },
  statLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  statValueDanger: { color: colors.danger },

  controlSectionTitle: { fontSize: 13, fontWeight: '700', color: colors.gold, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },

  selectPrompt: { backgroundColor: colors.bgCard, borderRadius: borderRadius.md, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  selectPromptText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});