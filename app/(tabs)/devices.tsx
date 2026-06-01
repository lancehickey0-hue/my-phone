import { useMutation, useQuery } from 'convex/react';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../../convex/_generated/api';
import { type Id } from '../../convex/_generated/dataModel';
import { deviceEmojis, deviceLabels, type DeviceType } from '../../src/lib/deviceIcons';
import { borderRadius, colors, fontSize, spacing } from '../../src/lib/theme';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';

const DEVICE_TYPES: DeviceType[] = ['phone', 'tablet', 'laptop', 'earbuds', 'watch'];

export default function DevicesTab() {
  const devices = useQuery(api.devices.list) ?? [];
  const addDevice = useMutation(api.devices.add);
  const removeDevice = useMutation(api.devices.remove);
  const triggerAlarm = useMutation(api.devices.triggerAlarm);
  const stopAlarm = useMutation(api.devices.stopAlarm);
  const lockDevice = useMutation(api.devices.lockDevice);
  const unlockDevice = useMutation(api.devices.unlockDevice);
  const registerPhysicalDevice = useMutation(api.devices.registerPhysicalDevice);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceType, setNewDeviceType] = useState<DeviceType>('phone');

  async function handleAddDevice() {
    if (!newDeviceName.trim()) return;
    try {
      await addDevice({ name: newDeviceName.trim(), type: newDeviceType });
      setNewDeviceName('');
      setShowAddModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  function handleRemoveDevice(id: Id<'devices'>, name: string) {
    Alert.alert('Remove Device', `Remove "${name}" from your account?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeDevice({ deviceId: id }),
      },
    ]);
  }

  function timeAgo(ts: number) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {devices.length} Device{devices.length !== 1 ? 's' : ''}
          </Text>
          <Pressable style={styles.addBtn} onPress={() => setShowAddModal(true)}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </Pressable>
        </View>

        {/* Device List */}
        {devices.map((device) => (
          <View key={device._id} style={[styles.deviceCard, device.isAlarmActive && styles.deviceCardAlarm]}>
            <View style={styles.deviceTop}>
              <Text style={styles.deviceEmoji}>{deviceEmojis[device.type as DeviceType]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.deviceMeta}>
                  {deviceLabels[device.type as DeviceType]} · {device.lastSeenAt ? timeAgo(device.lastSeenAt) : 'Never seen'}
                </Text>
              </View>
              <View
                style={[
                  styles.statusDot,
                  device.isAlarmActive
                    ? { backgroundColor: colors.danger }
                    : device.status === 'connected'
                      ? { backgroundColor: colors.success }
                      : { backgroundColor: colors.textMuted },
                ]}
              />
            </View>

            {/* Location */}
            {device.lastLocationName && (
              <Text style={styles.locationText}>📍 {device.lastLocationName}</Text>
            )}

            {/* Actions */}
            <View style={styles.actionRow}>
              {device.isAlarmActive ? (
                <Pressable
                  style={[styles.actionBtn, styles.actionSuccess]}
                  onPress={() => stopAlarm({ deviceId: device._id })}
                >
                  <Text style={styles.actionSuccessText}>🔕 Stop Alarm</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.actionBtn, styles.actionDanger]}
                  onPress={() => triggerAlarm({ deviceId: device._id })}
                >
                  <Text style={styles.actionDangerText}>🔔 Alarm</Text>
                </Pressable>
              )}

              {device.isLocked ? (
                <Pressable
                  style={[styles.actionBtn, styles.actionGold]}
                  onPress={() => unlockDevice({ deviceId: device._id })}
                >
                  <Text style={styles.actionGoldText}>🔓 Unlock</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.actionBtn, styles.actionWarning]}
                  onPress={() => lockDevice({ deviceId: device._id })}
                >
                  <Text style={styles.actionWarningText}>🔒 Lock</Text>
                </Pressable>
              )}

              {!(device as any).physicalDeviceId && (
                <Pressable
                  style={[styles.actionBtn, styles.actionSetDevice]}
                  onPress={async () => {
                    try {
                      let physicalDeviceId = Application.androidId ?? '';
                      if (!physicalDeviceId) {
                        const stored = await SecureStore.getItemAsync('device_uuid');
                        if (stored) {
                          physicalDeviceId = stored;
                        } else {
                          const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                            const r = Math.random() * 16 | 0;
                            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                          });
                          await SecureStore.setItemAsync('device_uuid', uuid);
                          physicalDeviceId = uuid;
                        }
                      }
                      await registerPhysicalDevice({ deviceId: device._id, physicalDeviceId });
                      Alert.alert('✅ Done', `This device is now "${device.name}".`);
                    } catch (e: any) {
                      Alert.alert('Error', e.message);
                    }
                  }}
                >
                  <Text style={styles.actionSetDeviceText}>📱 Mine</Text>
                </Pressable>
              )}

              <Pressable
                style={[styles.actionBtn, styles.actionMuted]}
                onPress={() => handleRemoveDevice(device._id, device.name)}
              >
                <Text style={styles.actionMutedText}>✕</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Device Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Device</Text>

            <TextInput
              style={styles.input}
              placeholder="Device name (e.g. iPhone 15 Pro)"
              placeholderTextColor={colors.textMuted}
              value={newDeviceName}
              onChangeText={setNewDeviceName}
              autoFocus
            />

            <Text style={styles.typeLabel}>Device Type</Text>
            <View style={styles.typeRow}>
              {DEVICE_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[styles.typeBtn, newDeviceType === type && styles.typeBtnActive]}
                  onPress={() => setNewDeviceType(type)}
                >
                  <Text style={styles.typeEmoji}>{deviceEmojis[type]}</Text>
                  <Text
                    style={[styles.typeText, newDeviceType === type && styles.typeTextActive]}
                  >
                    {deviceLabels[type]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => { setShowAddModal(false); setNewDeviceName(''); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={handleAddDevice}>
                <Text style={styles.confirmBtnText}>Add Device</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg },

  actionSetDevice: { borderColor: colors.goldBorder, backgroundColor: colors.goldDim },
  actionSetDeviceText: { color: colors.gold, fontWeight: '600', fontSize: fontSize.sm },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  addBtn: {
    backgroundColor: colors.goldDim,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  addBtnText: { color: colors.gold, fontWeight: '600', fontSize: fontSize.sm },

  // Device Card
  deviceCard: {
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceCardAlarm: { borderColor: colors.danger + '60', backgroundColor: colors.dangerDim },
  deviceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  deviceEmoji: { fontSize: 32 },
  deviceName: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  deviceMeta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  locationText: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm, marginLeft: 44 },

  // Actions
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flex: 1, borderRadius: borderRadius.sm, paddingVertical: spacing.sm, alignItems: 'center', borderWidth: 1 },
  actionDanger: { borderColor: colors.danger + '40', backgroundColor: colors.dangerDim },
  actionDangerText: { color: colors.danger, fontWeight: '600', fontSize: fontSize.sm },
  actionSuccess: { borderColor: colors.success + '40', backgroundColor: colors.successDim },
  actionSuccessText: { color: colors.success, fontWeight: '600', fontSize: fontSize.sm },
  actionGold: { borderColor: colors.goldBorder, backgroundColor: colors.goldDim },
  actionGoldText: { color: colors.gold, fontWeight: '600', fontSize: fontSize.sm },
  actionWarning: { borderColor: colors.warning + '40', backgroundColor: colors.warningDim },
  actionWarningText: { color: colors.warning, fontWeight: '600', fontSize: fontSize.sm },
  actionMuted: { flex: 0, width: 40, borderColor: colors.border, backgroundColor: 'transparent' },
  actionMutedText: { color: colors.textMuted, fontWeight: '600', fontSize: fontSize.md },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xxl,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gold, marginBottom: spacing.lg },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeLabel: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeBtn: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  typeBtnActive: { borderColor: colors.gold, backgroundColor: colors.goldDim },
  typeEmoji: { fontSize: 20, marginBottom: 4 },
  typeText: { fontSize: fontSize.xs, color: colors.textMuted },
  typeTextActive: { color: colors.gold },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl },
  cancelBtn: { flex: 1, padding: spacing.md, borderRadius: borderRadius.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { color: colors.textMuted, fontWeight: '600' },
  confirmBtn: { flex: 1, padding: spacing.md, borderRadius: borderRadius.sm, alignItems: 'center', backgroundColor: colors.gold },
  confirmBtnText: { color: colors.bgPrimary, fontWeight: '700' },
});
