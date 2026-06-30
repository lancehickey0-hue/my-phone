import { useMutation, useQuery } from 'convex/react';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import { api } from '../../convex/_generated/api';
import { deviceEmojis, type DeviceType } from '../../src/lib/deviceIcons';
import { borderRadius, colors, spacing } from '../../src/lib/theme';
import type { Id } from '../../convex/_generated/dataModel';

type RemoteAction = 'alarm' | 'lock' | 'unlock' | 'stop_alarm';

export default function MapTab() {
  const devices = useQuery(api.devices.list) ?? [];
  const triggerAlarm = useMutation(api.devices.triggerAlarm);
  const stopAlarm = useMutation(api.devices.stopAlarm);
  const lockDevice = useMutation(api.devices.lockDevice);
  const unlockDevice = useMutation(api.devices.unlockDevice);

  const [selectedDeviceId, setSelectedDeviceId] = useState<Id<'devices'> | null>(null);
  const [actionLoading, setActionLoading] = useState<RemoteAction | null>(null);
  const mapRef = useRef<MapView>(null);

  const selectedDevice = devices.find((d) => d._id === selectedDeviceId);
  const devicesWithLocation = devices.filter((d) => d.lastLatitude && d.lastLongitude);

  const handleSelectDevice = useCallback((deviceId: Id<'devices'>) => {
    setSelectedDeviceId(deviceId);
    const device = devices.find((d) => d._id === deviceId);
    if (device?.lastLatitude && device?.lastLongitude && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: device.lastLatitude,
        longitude: device.lastLongitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 600);
    }
  }, [devices]);

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

  const handleDirections = useCallback(() => {
    if (!selectedDevice?.lastLatitude || !selectedDevice?.lastLongitude) {
      Alert.alert('No Location', 'This device has no location data yet.');
      return;
    }
    const { lastLatitude: lat, lastLongitude: lng, name } = selectedDevice;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(name)})`)
    );
  }, [selectedDevice]);

  const formatLastSeen = (ts?: number) => {
    if (!ts) return 'Never';
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  };

  // Default region — US center, or first device with location
  const initialRegion = devicesWithLocation[0]
    ? {
        latitude: devicesWithLocation[0].lastLatitude!,
        longitude: devicesWithLocation[0].lastLongitude!,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : { latitude: 37.7749, longitude: -122.4194, latitudeDelta: 10, longitudeDelta: 10 };

  return (
    <View style={styles.container}>
      {/* ─── Real Map ─────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        customMapStyle={darkMapStyle}
        showsUserLocation
        showsMyLocationButton
      >
        {devicesWithLocation.map((device) => (
          <React.Fragment key={device._id}>
            <Marker
              coordinate={{
                latitude: device.lastLatitude!,
                longitude: device.lastLongitude!,
              }}
              onPress={() => handleSelectDevice(device._id)}
              title={device.name}
              description={device.isAlarmActive ? '🔔 ALARM ACTIVE' : formatLastSeen(device.lastSeenAt)}
            >
              <View style={[
                styles.markerBubble,
                device.isAlarmActive && styles.markerBubbleAlarm,
                device._id === selectedDeviceId && styles.markerBubbleSelected,
              ]}>
                <Text style={styles.markerEmoji}>{deviceEmojis[device.type as DeviceType]}</Text>
              </View>
            </Marker>

            {device.isAlarmActive && (
              <Circle
                center={{ latitude: device.lastLatitude!, longitude: device.lastLongitude! }}
                radius={80}
                fillColor="rgba(239,68,68,0.12)"
                strokeColor="rgba(239,68,68,0.5)"
                strokeWidth={2}
              />
            )}
          </React.Fragment>
        ))}
      </MapView>

      {/* Badges overlay */}
      <View style={[styles.trackingBadge, { pointerEvents: 'none' }]}>
        <View style={styles.trackingDot} />
        <Text style={styles.trackingText}>LIVE</Text>
      </View>
      <View style={[styles.countBadge, { pointerEvents: 'none' }]}>
        <Text style={styles.countText}>
          {devicesWithLocation.length}/{devices.length} located
        </Text>
      </View>

      {/* ─── Bottom Panel ─────────────────────────────────────────── */}
      <ScrollView style={styles.bottomPanel} contentContainerStyle={styles.bottomContent}>
        {/* Device chips */}
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

        {/* Selected device controls */}
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
                    mapRef.current?.animateToRegion({
                      latitude: selectedDevice.lastLatitude,
                      longitude: selectedDevice.lastLongitude,
                      latitudeDelta: 0.005,
                      longitudeDelta: 0.005,
                    }, 600);
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

  map: { height: '44%' },

  markerBubble: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bgCard,
    borderWidth: 2, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  markerBubbleAlarm: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  markerBubbleSelected: { borderColor: colors.gold, borderWidth: 3, transform: [{ scale: 1.2 }] },
  markerEmoji: { fontSize: 20 },

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

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0d0d12' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#71717a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#06060a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a24' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#13131a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#252530' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#040408' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
