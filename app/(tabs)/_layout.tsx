import { Tabs } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Image, Text, AppState, Platform } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { api } from '../../convex/_generated/api';
import { AlarmWatcher } from '../../src/lib/AlarmWatcher';
import { colors } from '../../src/lib/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function TabIcon({ emoji, focused, isInfinity }: { emoji: string; focused: boolean; isInfinity?: boolean }) {
  if (isInfinity) {
    return (
      <Image
        source={require('../../assets/images/infinity-logo.png')}
        style={{
          width: 30,
          height: 15,
          opacity: focused ? 1 : 0.5,
          tintColor: focused ? colors.gold : colors.textMuted,
        }}
        resizeMode="contain"
      />
    );
  }
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );
}

function HeartbeatManager() {
  const devices = useQuery(api.devices.list) ?? [];
  const heartbeat = useMutation(api.devices.heartbeat);
  const markOffline = useMutation(api.devices.markOffline);
  const updateLocation = useMutation(api.devices.updateLocation);
  const registerPhysicalDevice = useMutation(api.devices.registerPhysicalDevice);

  // Register push notification token and link to the physical device record
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: 'a57089db-f8e0-4314-888b-29c19c9665cb',
        });
        const expoPushToken = tokenData.data;

        const physicalId = (globalThis as any).__myPhoneDeviceId;
        if (!physicalId || devices.length === 0) return;

        const myDevice = devices.find((d) => d.physicalDeviceId === physicalId);
        if (myDevice && myDevice.expoPushToken !== expoPushToken) {
          await registerPhysicalDevice({
            deviceId: myDevice._id,
            physicalDeviceId: physicalId,
            expoPushToken,
          });
        }
      } catch (e) {
        console.warn('[PushToken] Failed to register:', e);
      }
    })();
  }, [devices.length]);

  // GPS location tracking — update this device's location in Convex
  useEffect(() => {
    let locationSub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      let physicalId = (globalThis as any).__myPhoneDeviceId;
      let attempts = 0;
      while (!physicalId && attempts < 20 && !cancelled) {
        await new Promise((r) => setTimeout(r, 500));
        physicalId = (globalThis as any).__myPhoneDeviceId;
        attempts++;
      }
      if (!physicalId || cancelled) return;

      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;

        if (devices.length === 0) return;
        const myDevice = devices.find((d) => d.physicalDeviceId === physicalId);
        if (!myDevice) return;

        locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000,
            distanceInterval: 20,
          },
          async (loc) => {
            try {
              let locationName: string | undefined;
              try {
                const [place] = await Location.reverseGeocodeAsync({
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                });
                if (place) {
                  locationName = [place.street, place.city, place.region]
                    .filter(Boolean)
                    .join(', ');
                }
              } catch (_) {}

              await updateLocation({
                deviceId: myDevice._id,
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                locationName,
              });
            } catch (e) {
              console.warn('[Location] updateLocation failed:', e);
            }
          }
        );
      } catch (e) {
        console.warn('[Location] watchPositionAsync failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      locationSub?.remove();
    };
  }, [devices.length]);

  // Heartbeat every 30s + mark offline on background
useEffect(() => {
  const physicalId = (globalThis as any).__myPhoneDeviceId;
  const myDevice = devices.find((d) => d.physicalDeviceId === physicalId);
  if (!myDevice) return;

  heartbeat({ deviceId: myDevice._id }).catch(() => {});

  const interval = setInterval(() => {
    heartbeat({ deviceId: myDevice._id }).catch(() => {});
  }, 30000);

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      markOffline({ deviceId: myDevice._id }).catch(() => {});
    } else if (state === 'active') {
      heartbeat({ deviceId: myDevice._id }).catch(() => {});
    }
  });

  return () => {
    clearInterval(interval);
    subscription.remove();
  };
 }, [devices.length]);

 return null;
}

export default function TabsLayout() {
  return (
    <>
      <HeartbeatManager />
      <AlarmWatcher />
      <Tabs
        screenOptions={{
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.bgPrimary,
            shadowColor: 'transparent',
            elevation: 0,
          },
          headerTitleStyle: {
            color: colors.gold,
            fontWeight: '700',
            fontSize: 18,
          },
          tabBarStyle: {
            backgroundColor: colors.bgCard,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 85,
            paddingBottom: 25,
            paddingTop: 8,
          },
          tabBarActiveTintColor: colors.gold,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="devices"
          options={{
            title: 'Devices',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📱" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="locate"
          options={{
            title: 'Locate',
            tabBarIcon: ({ focused }) => <TabIcon emoji="∞" focused={focused} isInfinity />,
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: 'Map',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
          }}
        />
      </Tabs>
    </>
  );
}
