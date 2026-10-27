/**
 * Settings — account, devices, and the few things you'd ever change.
 * Grouped, plain labels, one tap each. Protection setup lives on the
 * This Phone tab, not here, so there's one obvious place for it.
 */
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../convex/_generated/api';
import { Card, ListRow, PrimaryButton, ScreenHeader, SectionLabel } from '../../src/components/ui';
import { colors, fonts } from '../../src/lib/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useQuery(api.auth.currentUser);
  const profile = useQuery(api.profiles.current);
  const subscription = useQuery(api.billing.getSubscription);
  const devices = useQuery(api.devices.list);
  const setFinderMessage = useMutation(api.profiles.setFinderMessage);
  const { signOut } = useAuthActions();

  const [finderDraft, setFinderDraft] = useState('');
  const [finderSaved, setFinderSaved] = useState(false);
  useEffect(() => {
    if (profile?.finderMessage !== undefined) setFinderDraft(profile.finderMessage ?? '');
  }, [profile?.finderMessage]);

  const planDetail = !profile
    ? ''
    : profile.subscriptionStatus === 'trial'
      ? `Free trial${subscription?.status === 'trial' ? ` · ${subscription.trialDaysRemaining} days left` : ''}`
      : profile.subscriptionStatus === 'active'
        ? 'Active'
        : profile.subscriptionStatus === 'expired'
          ? 'Expired — tap to renew'
          : 'Cancelled';

  const saveFinder = async () => {
    try {
      await setFinderMessage({ message: finderDraft });
      setFinderSaved(true);
      setTimeout(() => setFinderSaved(false), 2000);
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.data ?? e?.message ?? 'Please try again.');
    }
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out?', "This phone will stop being protected until you sign in again.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/auth'); } },
    ]);

  const redoSetup = () =>
    Alert.alert('Run setup again?', 'This walks you through the permission steps again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Run setup',
        onPress: async () => {
          await SecureStore.deleteItemAsync('wake_word_setup_done');
          router.replace('/wake-word-setup');
        },
      },
    ]);

  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin';

  return (
    <View style={styles.container}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card style={styles.account}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || user?.email || 'U').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name} numberOfLines={1}>{user?.name || 'Your account'}</Text>
            <Text style={styles.muted} numberOfLines={1}>{user?.email}</Text>
          </View>
        </Card>

        <SectionLabel>Your phones</SectionLabel>
        <Card style={styles.group}>
          <ListRow
            icon="phone"
            title="Your devices"
            detail={devices ? `${devices.length} ${devices.length === 1 ? 'phone' : 'phones'} · rename or remove` : undefined}
            onPress={() => router.push('/manage-devices')}
          />
        </Card>

        <SectionLabel>If someone finds your phone</SectionLabel>
        <Card style={{ gap: 12 }}>
          <Text style={styles.muted}>Shown on the lock screen while the alarm is on, so an honest person can return it.</Text>
          <TextInput
            value={finderDraft}
            onChangeText={(t) => { setFinderDraft(t); setFinderSaved(false); }}
            placeholder="e.g. Please call 555-0100"
            placeholderTextColor={colors.textMuted}
            maxLength={160}
            multiline
            style={styles.input}
            accessibilityLabel="Message for whoever finds your phone"
          />
          <PrimaryButton size="md" label={finderSaved ? 'Saved ✓' : 'Save message'} onPress={saveFinder} />
        </Card>

        <SectionLabel>Account</SectionLabel>
        <Card style={styles.group}>
          <ListRow icon="card" title="Plan" detail={planDetail} onPress={() => router.push('/subscription')} />
          {isAdmin && (
            <>
              <View style={styles.divider} />
              <ListRow icon="users" title="Manage users" onPress={() => router.push('/manage-users')} />
            </>
          )}
          <View style={styles.divider} />
          <ListRow icon="list" title="Activity history" detail="Alarms, locks and unlocks" onPress={() => router.push('/activity-log')} />
        </Card>

        <SectionLabel>Help</SectionLabel>
        <Card style={styles.group}>
          <ListRow icon="refresh" title="Run setup again" detail="If something isn't working" onPress={redoSetup} />
          <View style={styles.divider} />
          <ListRow icon="logout" title="Sign out" onPress={confirmSignOut} danger />
        </Card>

        <Text style={styles.version}>My-Phone 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  account: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.onGold },
  name: { fontFamily: fonts.extrabold, fontSize: 19, color: colors.textPrimary },
  muted: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textMuted },
  group: { padding: 0, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 70 },
  input: {
    minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.bgElevated,
    color: colors.textPrimary, fontFamily: fonts.medium, fontSize: 17, paddingHorizontal: 16, paddingVertical: 12, textAlignVertical: 'top',
  },
  version: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 28 },
});
