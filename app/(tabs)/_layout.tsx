import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { Image, Text, AppState } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { AlarmWatcher } from '../../src/lib/AlarmWatcher';
import { colors } from '../../src/lib/theme';

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

  useEffect(() => {
    if (devices.length === 0) return;

    devices.forEach(device => {
      heartbeat({ deviceId: device._id }).catch(() => {});
    });

    const interval = setInterval(() => {
      devices.forEach(device => {
        heartbeat({ deviceId: device._id }).catch(() => {});
      });
    }, 30000);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        devices.forEach(device => {
          markOffline({ deviceId: device._id }).catch(() => {});
        });
      } else if (state === 'active') {
        devices.forEach(device => {
          heartbeat({ deviceId: device._id }).catch(() => {});
        });
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
