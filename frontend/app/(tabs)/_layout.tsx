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
