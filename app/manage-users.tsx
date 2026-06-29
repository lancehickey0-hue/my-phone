import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { borderRadius, colors, fontSize, spacing } from '../src/lib/theme';

const ROLE_LABELS: Record<string, string> = {
  owner: '👑 Owner',
  admin: '🛡️ Admin',
  user: '👤 User',
};

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function ManageUsersScreen() {
  const router = useRouter();
  const users = useQuery(api.profiles.listAllUsers) ?? [];
  const myProfile = useQuery(api.profiles.current);
  const updateRole = useMutation(api.profiles.updateUserRole);

  function handleRoleChange(userId: Id<'users'>, currentRole: string, name: string) {
    if (myProfile?.role !== 'owner') return;
    if (currentRole === 'owner') return;

    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const label = newRole === 'admin' ? '🛡️ Admin' : '👤 User';

    Alert.alert(
      'Change Role',
      `Set ${name || 'this user'} to ${label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => updateRole({ targetUserId: userId, newRole }).catch(() => {}),
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Manage Users</Text>
        <Text style={styles.count}>{users.length} member{users.length !== 1 ? 's' : ''}</Text>
      </View>

      {users.map((u) => (
        <View key={u.userId} style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(u.name || u.email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{u.name || '—'}</Text>
              <Text style={styles.userEmail}>{u.email || '—'}</Text>
              <Text style={styles.userMeta}>
                {u.deviceCount} device{u.deviceCount !== 1 ? 's' : ''} · Joined {timeAgo(u.joinedAt)}
              </Text>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <View style={[
              styles.pill,
              u.subscriptionStatus === 'active' ? styles.pillActive
                : u.subscriptionStatus === 'trial' ? styles.pillTrial
                : styles.pillExpired,
            ]}>
              <Text style={styles.pillText}>{u.subscriptionStatus}</Text>
            </View>

            {u.role === 'owner' ? (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{ROLE_LABELS[u.role]}</Text>
              </View>
            ) : myProfile?.role === 'owner' ? (
              <Pressable
                style={styles.roleBtn}
                onPress={() => handleRoleChange(u.userId, u.role, u.name || '')}
              >
                <Text style={styles.roleBtnText}>{ROLE_LABELS[u.role]} ›</Text>
              </Pressable>
            ) : (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{ROLE_LABELS[u.role]}</Text>
              </View>
            )}
          </View>
        </View>
      ))}

      {users.length === 0 && (
        <Text style={styles.empty}>No users found.</Text>
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

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  avatarText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gold },
  userName: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  userEmail: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  userMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  pill: { borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: 3 },
  pillActive: { backgroundColor: colors.successDim },
  pillTrial: { backgroundColor: colors.warningDim },
  pillExpired: { backgroundColor: 'rgba(255,255,255,0.06)' },
  pillText: { fontSize: fontSize.xs, color: colors.textPrimary, fontWeight: '600' },

  roleBadge: {
    backgroundColor: colors.goldDim,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  roleBadgeText: { fontSize: fontSize.xs, color: colors.gold, fontWeight: '600' },

  roleBtn: {
    backgroundColor: colors.goldDim,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  roleBtnText: { fontSize: fontSize.xs, color: colors.gold, fontWeight: '600' },

  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
});
