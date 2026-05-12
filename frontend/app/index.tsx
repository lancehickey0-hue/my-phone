import React from 'react';
import { useAuthStore } from '../src/stores/authStore';
import { Redirect } from 'expo-router';

export default function Index() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return isAuthenticated ? <Redirect href="/(tabs)" /> : <Redirect href="/login" />;
}