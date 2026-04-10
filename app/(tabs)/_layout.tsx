import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
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

export default function TabsLayout() {
  return (
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
  );
}
