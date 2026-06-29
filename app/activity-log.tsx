import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../convex/_generated/api';
import { borderRadius, colors, fontSize, spacing } from '../src/lib/theme';

const ACTION_ICONS: Record<string, string> = {
  device_added: '➕',
  device_removed: '🗑️',
  alarm_triggered: '🔔',
  alarm_stopped: '🔕',
  device_locked: '🔒',
  device_unlocked: '🔓',
  voice_enrolled: '🎙️',
  biometric_registered: '🔐',
  biometric_unlock: '✅',
};

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ActivityLogScreen() {
  const router = useRouter();
  const logs = useQuery(api.activityLog.listRecent, { limit: 100 }) ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Activity Log</Text>
        <Text style={styles.count}>{logs.length} event{logs.length !== 1 ? 's' : ''}</Text>
      </View>

      {logs.map((log) => (
        <View key={log._id} style={styles.row}>
          <Text style={styles.icon}>{ACTION_ICONS[log.action] ?? '📋'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.action}>{log.action.replace(/_/g, ' ')}</Text>
            {log.details ? <Text style={styles.details}>{log.details}</Text> : null}
          </View>
          <Text style={styles.time}>{timeAgo(log.timestamp)}</Text>
        </View>
      ))}

      {logs.length === 0 && (
        <Text style={styles.empty}>No activity yet.</Text>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg },

  header: { marginBottom: spacing.xl },
  backBtn: { marginBottom: spacing.sm },
  backText: { color: colors.gold, fontSize: fontSize.md },
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  count: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { fontSize: 20, marginTop: 1 },
  action: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  details: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  time: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
});
