import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { NativeModules,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../../convex/_generated/api';
import { deviceEmoji, type DeviceType } from '../../src/lib/deviceIcons';
import { borderRadius, colors, fontSize, spacing } from '../../src/lib/theme';

export default function DashboardTab() {
  const devices = useQuery(api.devices.list) ?? [];
  const profile = useQuery(api.profiles.current);
  const activityLog = useQuery(api.profiles.getActivityLog) ?? [];
  const enrollments = useQuery(api.voiceEnrollment.listEnrollments) ?? [];
  const router = useRouter();

  useEffect(() => {
    const { WakeWordModule } = NativeModules;
    if (!WakeWordModule) return;
    WakeWordModule.isModelReady().then((ready) => {
      if (!ready) router.replace('/wake-word-setup');
    }).catch(() => {});
  }, []);


  const trainedCount = enrollments.filter((e) => e.isEnrolled).length;

  const stats = {
    total: devices.length,
    trained: trainedCount,
    alarming: devices.filter((d) => d.isAlarmActive).length,
    locked: devices.filter((d) => d.isLocked).length,
  };

  const recentActivity = activityLog.slice(0, 5);

  // Build a map of deviceId -> enrollment for quick lookup
  const enrollmentMap = new Map(
    enrollments.map((e) => [e.deviceId, e])
  );

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => {}} tintColor={colors.gold} />}
    >
      {/* Stats Row */}
      <View style={styles.statsRow}>
        {[
          { label: 'Devices', value: stats.total, emoji: '📱' },
          { label: 'Trained', value: stats.trained, emoji: '🟢' },
          { label: 'Alarms', value: stats.alarming, emoji: '🔔', highlight: stats.alarming > 0 },
          { label: 'Locked', value: stats.locked, emoji: '🔒' },
        ].map((stat) => (
          <View key={stat.label} style={[styles.statCard, stat.highlight && styles.statCardDanger]}>
            <Text style={styles.statEmoji}>{stat.emoji}</Text>
            <Text style={[styles.statValue, stat.highlight && styles.statValueDanger]}>
              {stat.value}
            </Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Voice Locator Card — branded logo */}
      <Pressable
        style={styles.voiceCard}
        onPress={() => router.push('/locate')}
      >
        <View style={styles.voiceCardInner}>
          <Image
            source={require('../../assets/images/infinity-logo.png')}
            style={styles.voiceLogoImage}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.voiceTitle}>Voice Locator</Text>
            <Text style={styles.voiceSubtitle}>
              {trainedCount > 0
                ? 'Per-device wake phrases active'
                : 'Set up voice recognition →'}
            </Text>
          </View>
          {trainedCount > 0 && (
            <View style={styles.voiceActiveIndicator}>
              <Text style={{ fontSize: 10, color: colors.success }}>●</Text>
              <Text style={styles.voiceActiveText}>{trainedCount}/{devices.length}</Text>
            </View>
          )}
        </View>
      </Pressable>

      {/* Device Cards */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Devices</Text>
        <Pressable onPress={() => router.push('/devices')}>
          <Text style={styles.seeAllLink}>See All →</Text>
        </Pressable>
      </View>

      {devices.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEmoji}>📱</Text>
          <Text style={styles.emptyText}>No devices yet</Text>
          <Pressable style={styles.addButton} onPress={() => router.push('/devices')}>
            <Text style={styles.addButtonText}>+ Add Device</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.deviceGrid}>
          {devices.slice(0, 4).map((device) => {
            const enrollment = enrollmentMap.get(device._id);
            const isTrained = enrollment?.isEnrolled ?? false;
            const wakePhrase = device.customWakePhrase || device.wakePhrase;

            return (
              <Pressable
                key={device._id}
                style={[
                  styles.deviceCard,
                  device.isAlarmActive && styles.deviceCardAlarm,
                  device.isLocked && styles.deviceCardLocked,
                ]}
                onPress={() => router.push({ pathname: '/voice-setup', params: { deviceId: device._id } })}
              >
                <View style={styles.deviceHeader}>
                  <Text style={styles.deviceEmoji}>
                    {deviceEmoji(device.type as DeviceType)}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      device.isAlarmActive
                        ? styles.statusAlarm
                        : device.status === 'connected'
                          ? styles.statusConnected
                          : styles.statusDisconnected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        device.isAlarmActive
                          ? styles.statusTextAlarm
                          : device.status === 'connected'
                            ? styles.statusTextConnected
                            : styles.statusTextDisconnected,
                      ]}
                    >
                      {device.isAlarmActive ? '🔔 ALARM' : device.status === 'connected' ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.deviceName} numberOfLines={1}>
                  {device.name}
                </Text>
                {/* Per-device wake phrase status */}
                {wakePhrase ? (
                  <Text style={[styles.deviceWakePhrase, isTrained && styles.deviceWakePhraseTrained]} numberOfLines={1}>
                    {isTrained ? '✓' : '○'} "{wakePhrase.replace(', where are you?', '').replace(/"/g, '')}"
                  </Text>
                ) : (
                  <Text style={styles.deviceType}>{device.type}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: spacing.xxl }]}>Recent Activity</Text>
          <View style={styles.activityList}>
            {recentActivity.map((log) => (
              <View key={log._id} style={styles.activityItem}>
                <Text style={styles.activityText}>{log.details}</Text>
                <Text style={styles.activityTime}>{timeAgo(log.timestamp)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Spacer for tab bar */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg },

  // Stats
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statCardDanger: { borderColor: colors.danger + '40' },
  statEmoji: { fontSize: 18, marginBottom: spacing.xs },
  statValue: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary },
  statValueDanger: { color: colors.danger },
  statLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  // Voice Locator
  voiceCard: {
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  voiceCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  voiceLogoImage: { width: 36, height: 18 },
  voiceTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.gold },
  voiceSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  voiceActiveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voiceActiveText: { fontSize: fontSize.xs, color: colors.success },

  // Section
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gold },
  seeAllLink: { fontSize: fontSize.sm, color: colors.gold },

  // Empty
  emptyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.lg,
    padding: spacing.xxxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.lg },
  addButton: {
    backgroundColor: colors.goldDim,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  addButtonText: { color: colors.gold, fontWeight: '600', fontSize: fontSize.sm },

  // Device Grid
  deviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  deviceCard: {
    width: '48.5%',
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceCardAlarm: { borderColor: colors.danger + '60', backgroundColor: colors.dangerDim },
  deviceCardLocked: { borderColor: colors.warning + '40' },
  deviceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  deviceEmoji: { fontSize: 24 },
  statusBadge: { borderRadius: borderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  statusConnected: { backgroundColor: colors.successDim },
  statusDisconnected: { backgroundColor: 'rgba(255,255,255,0.05)' },
  statusAlarm: { backgroundColor: colors.dangerDim },
  statusText: { fontSize: fontSize.xs, fontWeight: '600' },
  statusTextConnected: { color: colors.success },
  statusTextDisconnected: { color: colors.textMuted },
  statusTextAlarm: { color: colors.danger },
  deviceName: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  deviceType: { fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'capitalize', marginTop: 2 },
  deviceWakePhrase: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  deviceWakePhraseTrained: { color: colors.gold },
  deviceLastSeen: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },

  // Activity
  activityList: {
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activityText: { fontSize: fontSize.sm, color: colors.textSecondary, flex: 1 },
  activityTime: { fontSize: fontSize.xs, color: colors.textMuted, marginLeft: spacing.sm },
});
