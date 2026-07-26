import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../../convex/_generated/api';
import { borderRadius, colors, fontSize, spacing } from '../../src/lib/theme';

export default function ProfileTab() {
  const user = useQuery(api.auth.currentUser);
  const profile = useQuery(api.profiles.current);
  const subscription = useQuery(api.billing.getSubscription);
  const voiceEnrollments = useQuery(api.voiceEnrollment.listEnrollments) ?? [];
  const biometricCreds = useQuery(api.biometric.listCredentials) ?? [];
  const pinStatus = useQuery(api.pin.status);
  const { signOut } = useAuthActions();
  const router = useRouter();

  const roleBadge =
    profile?.role === 'owner' ? '👑 Owner' : profile?.role === 'admin' ? '🛡️ Admin' : '👤 User';

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/auth'); } },
    ]);
  }

  function handleRedoDeviceSetup() {
    Alert.alert(
      'Redo Device Setup',
      'This re-runs mic, location, and device admin permission requests for this device — useful after an app update adds new setup steps. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            await SecureStore.deleteItemAsync('wake_word_setup_done');
            router.replace('/wake-word-setup');
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </Text>
        </View>
        <Text style={styles.userName}>{user?.name || 'User'}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{roleBadge}</Text>
        </View>
      </View>

      {/* Subscription */}
      <Pressable style={styles.card} onPress={() => router.push('/subscription')}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <Text style={styles.cardTitle}>Subscription</Text>
          <Text style={styles.chevron}>›</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status</Text>
          {profile ? (
            <View style={[styles.statusPill, profile.subscriptionStatus === 'trial' ? styles.statusTrial : profile.subscriptionStatus === 'active' ? styles.statusActive : styles.statusTrial]}>
              <Text style={styles.statusPillText}>
                {profile.subscriptionStatus === 'trial' ? '🟡 Trial' : profile.subscriptionStatus === 'active' ? '🟢 Active' : profile.subscriptionStatus === 'expired' ? '🔴 Expired' : '⏸️ Cancelled'}
              </Text>
            </View>
          ) : (
            <Text style={styles.infoValue}>—</Text>
          )}
        </View>
        {subscription && subscription.status === 'trial' && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Trial Remaining</Text>
            <Text style={[styles.infoValue, { color: subscription.trialDaysRemaining <= 3 ? colors.danger : colors.gold }]}>
              {subscription.trialDaysRemaining} days
            </Text>
          </View>
        )}
        {subscription && subscription.status === 'active' && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Current Price</Text>
            <Text style={styles.infoValue}>
              ${(subscription.currentPrice / 100).toFixed(2)}/mo
            </Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Max Devices</Text>
          <Text style={styles.infoValue}>{profile?.maxDevices ?? 10}</Text>
        </View>
        {(profile?.subscriptionStatus === 'trial' || profile?.subscriptionStatus === 'expired') && (
          <View style={styles.upgradeBanner}>
            <Text style={styles.upgradeText}>
              {profile.subscriptionStatus === 'trial' ? '⚡ Start at $2.99/mo' : '⚡ Resubscribe now'}
            </Text>
          </View>
        )}
      </Pressable>

      {/* Security Setup */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Security</Text>

        <Pressable style={styles.securityRow} onPress={() => router.push('/voice-setup')}>
          <Text style={styles.securityEmoji}>🎙️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.securityLabel}>Voice Recognition</Text>
            <Text style={styles.securityStatus}>
              {voiceEnrollments.filter(e => e.isEnrolled).length > 0
                ? `✅ ${voiceEnrollments.filter(e => e.isEnrolled).length} device${voiceEnrollments.filter(e => e.isEnrolled).length !== 1 ? 's' : ''} enrolled`
                : '⚠️ Not set up'}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable style={styles.securityRow} onPress={() => router.push('/biometric-setup')}>
          <Text style={styles.securityEmoji}>🔐</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.securityLabel}>Biometric Unlock</Text>
            <Text style={styles.securityStatus}>
              {biometricCreds.length > 0
                ? `✅ ${biometricCreds.length} credential${biometricCreds.length !== 1 ? 's' : ''} registered`
                : '⚠️ Not set up'}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable style={styles.securityRow} onPress={() => router.push('/pin-setup')}>
          <Text style={styles.securityEmoji}>🔢</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.securityLabel}>PIN Unlock</Text>
            <Text style={styles.securityStatus}>
              {pinStatus?.isSet ? '✅ PIN set' : '⚠️ Not set up'}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      {/* Admin */}
      {(profile?.role === 'owner' || profile?.role === 'admin') && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Admin</Text>
          <Pressable style={styles.menuRow} onPress={() => router.push('/manage-users')}>
            <Text style={styles.menuEmoji}>👥</Text>
            <Text style={styles.menuText}>Manage Users</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.menuRow} onPress={() => router.push('/activity-log')}>
            <Text style={styles.menuEmoji}>📊</Text>
            <Text style={styles.menuText}>Activity Log</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>
      )}

      {/* Device Setup */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device Setup</Text>
        <Pressable style={styles.menuRow} onPress={handleRedoDeviceSetup}>
          <Text style={styles.menuEmoji}>🔁</Text>
          <Text style={styles.menuText}>Redo Wake Word & Permissions Setup</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      {/* Sign Out */}
      <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      {/* App Info */}
      <Text style={styles.appVersion}>My-Phone v1.0.0</Text>
      <Text style={styles.appTagline}>🔒 Your devices. Your voice. Your security.</Text>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg },

  // Profile Header
  profileHeader: { alignItems: 'center', marginBottom: spacing.xxl, paddingTop: spacing.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { fontSize: fontSize.title, fontWeight: '800', color: colors.bgPrimary },
  userName: { fontSize: fontSize.xl, fontWeight: '700', color: colors.textPrimary },
  userEmail: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 },
  roleBadge: {
    backgroundColor: colors.goldDim,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  roleBadgeText: { fontSize: fontSize.sm, color: colors.gold, fontWeight: '600' },

  // Card
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.gold, marginBottom: spacing.md },

  // Info rows
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  infoLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  infoValue: { fontSize: fontSize.sm, color: colors.textPrimary, fontWeight: '600' },
  statusPill: { borderRadius: borderRadius.full, paddingHorizontal: spacing.md, paddingVertical: 3 },
  statusTrial: { backgroundColor: colors.warningDim },
  statusActive: { backgroundColor: colors.successDim },
  statusPillText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textPrimary },

  // Security
  securityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  securityEmoji: { fontSize: 24 },
  securityLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  securityStatus: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  chevron: { fontSize: fontSize.xl, color: colors.textMuted },

  // Menu
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  menuEmoji: { fontSize: 20 },
  menuText: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary },

  // Upgrade banner
  upgradeBanner: {
    backgroundColor: colors.goldDim,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  upgradeText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gold },

  // Sign Out
  signOutBtn: {
    backgroundColor: colors.dangerDim,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger + '30',
  },
  signOutText: { color: colors.danger, fontWeight: '600', fontSize: fontSize.md },

  // App Info
  appVersion: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
  appTagline: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
});
