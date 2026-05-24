import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import InfinityMark from '../../src/components/InfinityMark';

function HeaderLeft() {
  return <InfinityMark size={44} />;
}

function HomeIcon({ color, size }: { color: string; size: number }) {
  return <Ionicons name="home" size={size} color={color} />;
}

function LocatorIcon({ color, size }: { color: string; size: number }) {
  return <Ionicons name="locate" size={size} color={color} />;
}

function ChatIcon({ color, size }: { color: string; size: number }) {
  return <Ionicons name="chatbubble-ellipses" size={size} color={color} />;
}

function SettingsIcon({ color, size }: { color: string; size: number }) {
  return <Ionicons name="settings" size={size} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.subtext,
        headerTitleStyle: { fontWeight: '800' },
        headerLeft: () => <HeaderLeft />,
        headerLeftContainerStyle: { paddingLeft: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <HomeIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="locator"
        options={{
          title: 'Locator',
          tabBarIcon: ({ color, size }) => <LocatorIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => <ChatIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
cat > ~/downloads/my-phone-native/app/\(tabs\)/_layout.tsx << 'EOF'
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { Text, AppState } from 'react-native';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { colors } from '../../src/lib/theme';

function TabIcon({ emoji, focused, isInfinity }: { emoji: string; focused: boolean; isInfinity?: boolean }) {
  if (isInfinity) {
    return (
      <Text style={{ fontSize: 26, opacity: focused ? 1 : 0.5, color: focused ? colors.gold : colors.textMuted, fontWeight: '300' }}>∞</Text>
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

    // Send heartbeat immediately
    devices.forEach(device => {
      heartbeat({ deviceId: device._id }).catch(() => {});
    });

    // Then every 30 seconds
    const interval = setInterval(() => {
      devices.forEach(device => {
        heartbeat({ deviceId: device._id }).catch(() => {});
      });
    }, 30000);

    // Mark offline when app backgrounds
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
