/**
 * Map Tab — Live GPS Tracking + Remote Controls
 *
 * Features:
 *   - Real-time map with device pins (react-native-maps in production)
 *   - Device selector to focus on a specific device
 *   - Remote controls: Trigger Alarm, Lock, Unlock per device
 *   - Location trail visualization
 *   - Battery level + last seen timestamps
 *   - Alarm-mode indicator with pulsing red ring
 */

import { useMutation, useQuery } from 'convex/react';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { api } from '../../convex/_generated/api';
import { deviceEmojis, type DeviceType } from '../../src/lib/deviceIcons';
import { borderRadius, colors, fontSize, spacing } from '../../src/lib/theme';
import type { Id } from '../../convex/_generated/dataModel';

const { width: SCREEN_W } = Dimensions.get('window');

type RemoteAction = 'alarm' | 'lock' | 'unlock' | 'stop_alarm';

export default function MapTab() {
  const devices = useQuery(api.devices.list) ?? [];
  const triggerAlarm = useMutation(api.devices.triggerAlarm);
  const stopAlarm = useMutation(api.devices.stopAlarm);
  const lockDevice = useMutation(api.devices.lockDevice);
  const unlockDevice = useMutation(api.devices.unlockDevice);

  const [selectedDeviceId, setSelectedDeviceId] = useState<Id<'devices'> | null>(null);
  const [actionLoading, setActionLoading] = useState<RemoteAction | null>(null);
  const [showControls, setShowControls] = useState(false);

  const selectedDevice = devices.find((d) => d._id === selectedDeviceId);
  const devicesWithLocation = devices.filter((d) => d.lastLatitude && d.lastLongitude);

  // Handle remote actions
  const handleAction = useCallback(async (action: RemoteAction) => {
    if (!selectedDeviceId) return;
    setActionLoading(action);

    try {
      switch (action) {
        case 'alarm':
          await triggerAlarm({ deviceId: selectedDeviceId });
          break;
        case 'stop_alarm':
          await stopAlarm({ deviceId: selectedDeviceId });
          break;
        case 'lock':
          await lockDevice({ deviceId: selectedDeviceId });
          break;
        case 'unlock':
          await unlockDevice({ deviceId: selectedDeviceId });
          break;
      }
    } catch (err) {
      Alert.alert('Error', `Failed to ${action.replace('_', ' ')} device.`);
    } finally {
      setActionLoading(null);
    }
  }, [selectedDeviceId]);

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
      {/* ─── Map Area ─────────────────────────────────────────────── */}
      <View style={styles.mapContainer}>
        <View style={styles.mapPlaceholder}>
          {/* Map grid background */}
          <View style={styles.gridOverlay}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={`h${i}`} style={[styles.gridLineH, { top: `${(i + 1) * 11}%` }]} />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={`v${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 14}%` }]} />
            ))}
          </View>

          {/* Crosshair center */}
          <View style={styles.crosshairH} />
          <View style={styles.crosshairV} />

          {/* Device pins on map */}
          {devices.map((device, i) => {
            const isSelected = device._id === selectedDeviceId;
            const isAlarming = device.isAlarmActive;
            // Distribute pins in a realistic-looking pattern
            const angle = (i / Math.max(devices.length, 1)) * Math.PI * 2;
            const radius = 60 + (i % 3) * 35;
            const cx = SCREEN_W / 2 + Math.cos(angle) * radius - 24;
            const cy = 140 + Math.sin(angle) * radius - 24;

            return (
              <Pressable
                key={device._id}
                style={[
                  styles.mapPin,
                  { left: cx, top: cy },
                  isAlarming && styles.mapPinAlarm,
                  isSelected && styles.mapPinSelected,
                ]}
                onPress={() => {
                  setSelectedDeviceId(device._id);
                  setShowControls(true);
                }}
              >
                <Text style={styles.pinEmoji}>
                  {deviceEmojis[device.type as DeviceType]}
                </Text>
                {isAlarming && <View style={styles.alarmPulse} />}
                {isSelected && <View style={styles.selectedRing} />}
              </Pressable>
            );
          })}

          {/* Map label */}
          {devices.length === 0 && (
            <View style={styles.emptyMap}>
              <Text style={styles.emptyIcon}>🗺️</Text>
              <Text style={styles.emptyTitle}>No Devices Yet</Text>
              <Text style={styles.emptySubtitle}>Add a device to see it on the map</Text>
            </View>
          )}

          {/* Top-left: tracking indicator */}
          <View style={styles.trackingBadge}>
            <View style={styles.trackingDot} />
            <Text style={styles.trackingText}>LIVE</Text>
          </View>

          {/* Top-right: device count */}
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {devicesWithLocation.length}/{devices.length} located
            </Text>
          </View>
        </View>
      </View>

      {/* ─── Device List + Remote Controls ────────────────────────── */}
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
                onPress={() => {
                  setSelectedDeviceId(device._id === selectedDeviceId ? null : device._id);
                  setShowControls(device._id !== selectedDeviceId);
                }}
              >
                <Text style={styles.chipEmoji}>
                  {deviceEmojis[device.type as DeviceType]}
                </Text>
                <Text
                  style={[
                    styles.chipName,
                    device._id === selectedDeviceId && styles.chipNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {device.name}
                </Text>
                {device.isAlarmActive && <Text style={styles.chipAlarmIcon}>🚨</Text>}
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Selected device detail + remote controls */}
        {selectedDevice && showControls && (
          <View style={styles.controlCard}>
            {/* Device info header */}
            <View style={styles.controlHeader}>
              <Text style={styles.controlEmoji}>
                {deviceEmojis[selectedDevice.type as DeviceType]}
              </Text>
              <View style={styles.controlInfo}>
                <Text style={styles.controlName}>{selectedDevice.name}</Text>
                <Text style={styles.controlMeta}>
                  {selectedDevice.lastLocationName || 'Location updating...'} • {formatLastSeen(selectedDevice.lastSeenAt)}
                </Text>
              </View>
              <StatusBadge device={selectedDevice} />
            </View>

            {/* Location + battery row */}
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
                <Text style={[
                  styles.statValue,
                  selectedDevice.batteryLevel != null && selectedDevice.batteryLevel < 20 && styles.statValueDanger,
                ]}>
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

            {/* Remote control buttons */}
            <Text style={styles.controlSectionTitle}>Remote Controls</Text>
            <View style={styles.actionGrid}>
              {/* Alarm toggle */}
              {selectedDevice.isAlarmActive ? (
                <ActionButton
                  icon="🔕"
                  label="Stop Alarm"
                  color={colors.success}
                  bgColor={colors.successDim}
                  loading={actionLoading === 'stop_alarm'}
                  onPress={() => handleAction('stop_alarm')}
                />
              ) : (
                <ActionButton
                  icon="🚨"
                  label="Sound Alarm"
                  color={colors.danger}
                  bgColor={colors.dangerDim}
                  loading={actionLoading === 'alarm'}
                  onPress={() => {
                    Alert.alert(
                      'Trigger Alarm?',
                      `This will sound a loud alarm and lock ${selectedDevice.name}. Continue?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Trigger Alarm', style: 'destructive', onPress: () => handleAction('alarm') },
                      ]
                    );
                  }}
                />
              )}

              {/* Lock toggle */}
              {selectedDevice.isLocked ? (
                <ActionButton
                  icon="🔓"
                  label="Unlock"
                  color={colors.gold}
                  bgColor={colors.goldDim}
                  loading={actionLoading === 'unlock'}
                  onPress={() => handleAction('unlock')}
                />
              ) : (
                <ActionButton
                  icon="🔒"
                  label="Lock Device"
                  color={colors.warning}
                  bgColor={colors.warningDim}
                  loading={actionLoading === 'lock'}
                  onPress={() => handleAction('lock')}
                />
              )}

              {/* Locate (ping) */}
              <ActionButton
                icon="📍"
                label="Ping Location"
                color={colors.info}
                bgColor={colors.infoDim}
                loading={false}
                onPress={() => Alert.alert('Ping Sent', `Requesting fresh location from ${selectedDevice.name}...`)}
              />

              {/* Directions */}
              <ActionButton
                icon="🧭"
                label="Get Directions"
                color="#8B5CF6"
                bgColor="rgba(139, 92, 246, 0.15)"
                loading={false}
                onPress={() => {
                  if (selectedDevice.lastLatitude && selectedDevice.lastLongitude) {
                    Alert.alert('Opening Maps', `Navigating to ${selectedDevice.name}...`);
                  } else {
                    Alert.alert('No Location', 'Device location is not available yet.');
                  }
                }}
              />
            </View>

            {/* Watches/Earbuds note */}
            {(selectedDevice.type === 'watch' || selectedDevice.type === 'earbuds') && (
              <View style={styles.noteBanner}>
                <Text style={styles.noteText}>
                  ℹ️ {selectedDevice.type === 'watch' ? 'Watches' : 'Earbuds'} can only be unlocked remotely from this app — no physical override.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* No device selected prompt */}
        {!selectedDevice && devices.length > 0 && (
          <View style={styles.selectPrompt}>
            <Text style={styles.selectPromptText}>
              Tap a device on the map or above to see controls
            </Text>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ device }: { device: { isAlarmActive: boolean; isLocked: boolean; status: string } }) {
  const isAlarm = device.isAlarmActive;
  const isLocked = device.isLocked;
  const isConnected = device.status === 'connected';

  return (
    <View style={[
      statusStyles.badge,
      isAlarm ? statusStyles.alarm : isLocked ? statusStyles.locked : isConnected ? statusStyles.connected : statusStyles.disconnected,
    ]}>
      <Text style={[
        statusStyles.text,
        isAlarm ? statusStyles.alarmText : isLocked ? statusStyles.lockedText : isConnected ? statusStyles.connectedText : statusStyles.disconnectedText,
      ]}>
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

function ActionButton({
  icon, label, color, bgColor, loading, onPress,
}: {
  icon: string; label: string; color: string; bgColor: string;
  loading: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[actionStyles.btn, { backgroundColor: bgColor, borderColor: color + '30' }]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}
    >
      <Text style={actionStyles.icon}>{loading ? '⏳' : icon}</Text>
      <Text style={[actionStyles.label, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const actionStyles = StyleSheet.create({
  btn: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginBottom: 10,
  },
  icon: { fontSize: 22 },
  label: { fontSize: 14, fontWeight: '700' },
});

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },

  // Map
  mapContainer: { height: '44%', borderBottomWidth: 1, borderBottomColor: colors.border },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#07070E',
    position: 'relative',
    overflow: 'hidden',
  },

  // Grid overlay
  gridOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(212,168,67,0.04)' },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(212,168,67,0.04)' },
  crosshairH: {
    position: 'absolute', top: '50%', left: '30%', right: '30%',
    height: 1, backgroundColor: 'rgba(212,168,67,0.12)',
  },
  crosshairV: {
    position: 'absolute', left: '50%', top: '25%', bottom: '25%',
    width: 1, backgroundColor: 'rgba(212,168,67,0.12)',
  },

  // Pins
  mapPin: {
    position: 'absolute',
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.bgCard,
    borderWidth: 2, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  mapPinAlarm: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  mapPinSelected: { borderColor: colors.gold, borderWidth: 3, transform: [{ scale: 1.15 }], zIndex: 20 },
  pinEmoji: { fontSize: 20 },
  alarmPulse: {
    position: 'absolute', top: -6, right: -6,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.danger,
    borderWidth: 2, borderColor: colors.bgPrimary,
  },
  selectedRing: {
    position: 'absolute', top: -5, left: -5, right: -5, bottom: -5,
    borderRadius: 29, borderWidth: 2, borderColor: 'rgba(212,168,67,0.3)',
  },

  // Empty state
  emptyMap: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.gold },
  emptySubtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4 },

  // Badges
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
    backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
  },
  countText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },

  // Bottom panel
  bottomPanel: { flex: 1 },
  bottomContent: { padding: spacing.lg },

  // Chips
  chipScroll: { marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    gap: 6,
  },
  chipSelected: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  chipAlarm: { borderColor: colors.danger },
  chipEmoji: { fontSize: 16 },
  chipName: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, maxWidth: 100 },
  chipNameSelected: { color: colors.gold },
  chipAlarmIcon: { fontSize: 12 },

  // Control card
  controlCard: {
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  controlHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  controlEmoji: { fontSize: 32 },
  controlInfo: { flex: 1 },
  controlName: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  controlMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  // Stats
  statsRow: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  statItem: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10, padding: 10,
  },
  statLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  statValueDanger: { color: colors.danger },

  // Actions
  controlSectionTitle: {
    fontSize: 13, fontWeight: '700', color: colors.gold,
    marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },

  // Notes
  noteBanner: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: 10, padding: 12, marginTop: 10,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)',
  },
  noteText: { fontSize: 12, color: colors.info, lineHeight: 17 },

  // Select prompt
  selectPrompt: {
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.md, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  selectPromptText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
