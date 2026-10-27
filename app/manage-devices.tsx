/**
 * Manage devices — rename, remove, and "this is my phone".
 *
 * There's no manual "add device" form any more: a phone adds itself the
 * moment you sign in to My-Phone on it (convex/deviceAuth.claimThisDevice).
 * Ringing/locking lives on the Find tab only, so it's never duplicated here.
 */
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Icon } from '../src/components/Icon';
import { Card, PrimaryButton, SecondaryButton, TextButton } from '../src/components/ui';
import { getOrCreateDeviceSecret, getPhysicalDeviceId } from '../src/lib/deviceIdentity';
import { colors, fonts } from '../src/lib/theme';

export default function ManageDevicesScreen() {
  const router = useRouter();
  const devices = useQuery(api.devices.list);
  const profile = useQuery(api.profiles.current);
  const removeDevice = useMutation(api.devices.remove);
  const renameDevice = useMutation(api.devices.update);
  const registerPhysicalDevice = useMutation(api.devices.registerPhysicalDevice);

  const [physicalId, setPhysicalId] = useState('');
  const [editingId, setEditingId] = useState<Id<'devices'> | null>(null);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    getPhysicalDeviceId().then(setPhysicalId).catch(() => {});
  }, []);

  const thisPhoneLinked = !!devices?.some((d) => d.physicalDeviceId === physicalId);

  const saveName = async () => {
    if (!editingId) return;
    const name = draftName.trim();
    if (!name) return;
    try {
      await renameDevice({ deviceId: editingId, name });
      setEditingId(null);
    } catch (e: any) {
      Alert.alert("Couldn't rename", e?.data ?? e?.message ?? 'Please try again.');
    }
  };

  const confirmRemove = (id: Id<'devices'>, name: string) => {
    Alert.alert(`Remove ${name}?`, 'It will disappear from your map. If you sign in on it again, it comes back.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeDevice({ deviceId: id }).catch((e: any) => Alert.alert("Couldn't remove", e?.data ?? e?.message)),
      },
    ]);
  };

  const claim = async (id: Id<'devices'>, name: string, alreadyLinked: boolean) => {
    const doIt = async () => {
      try {
        const deviceSecret = await getOrCreateDeviceSecret();
        await registerPhysicalDevice({ deviceId: id, physicalDeviceId: physicalId, deviceSecret });
      } catch (e: any) {
        Alert.alert("That didn't work", e?.data ?? e?.message ?? 'Please try again.');
      }
    };
    if (alreadyLinked) {
      Alert.alert(`Is this phone "${name}"?`, `"${name}" is linked to a different phone right now. Switch it to this one?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, switch', onPress: doIt },
      ]);
    } else {
      doIt();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.roundBtn}>
          <Icon name="chevron-left" size={20} />
        </Pressable>
        <Text style={styles.topTitle} accessibilityRole="header">Your devices</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 8 }}>
          <Text style={styles.cardTitle}>Add another phone</Text>
          <Text style={styles.muted}>
            Install My-Phone on it and sign in with this same account. It shows up here by itself.
            {profile ? ` (${devices?.length ?? 0} of ${profile.maxDevices} used)` : ''}
          </Text>
        </Card>

        {(devices ?? []).map((d) => {
          const mine = !!physicalId && d.physicalDeviceId === physicalId;
          const editing = editingId === d._id;
          return (
            <Card key={d._id} style={{ gap: 14 }}>
              {editing ? (
                <>
                  <TextInput
                    value={draftName}
                    onChangeText={setDraftName}
                    autoFocus
                    maxLength={40}
                    style={styles.input}
                    placeholder="Name"
                    placeholderTextColor={colors.textMuted}
                    onSubmitEditing={saveName}
                    accessibilityLabel="Device name"
                  />
                  <View style={styles.twoUp}>
                    <SecondaryButton label="Cancel" onPress={() => setEditingId(null)} style={{ flex: 1 }} />
                    <PrimaryButton size="md" label="Save" onPress={saveName} style={{ flex: 1 }} />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.rowTop}>
                    <View style={styles.iconBubble}>
                      <Icon name="phone" size={20} color={colors.gold} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{d.name}</Text>
                      <Text style={styles.muted}>{mine ? 'This phone' : d.physicalDeviceId ? 'Linked' : 'Not set up on a phone yet'}</Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <TextButton label="Rename" onPress={() => { setEditingId(d._id); setDraftName(d.name); }} />
                    {!mine && !thisPhoneLinked && physicalId ? (
                      <TextButton label="This is my phone" onPress={() => claim(d._id, d.name, !!d.physicalDeviceId)} />
                    ) : null}
                    <TextButton label="Remove" muted onPress={() => confirmRemove(d._id, d.name)} />
                  </View>
                </>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  topBar: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 12 },
  roundBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.textPrimary },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 19, color: colors.textPrimary },
  muted: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textMuted },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBubble: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.goldDim, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -16 },
  twoUp: { flexDirection: 'row', gap: 10 },
  input: {
    height: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.bgElevated,
    color: colors.textPrimary, fontFamily: fonts.semibold, fontSize: 17, paddingHorizontal: 16,
  },
});
