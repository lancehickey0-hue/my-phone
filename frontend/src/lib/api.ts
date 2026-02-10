import Constants from 'expo-constants';
import axios from 'axios';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;

// In this template, EXPO_PUBLIC_BACKEND_URL points to the same origin as the Expo tunnel preview.
// Kubernetes ingress routes /api/* to the backend.
const baseURL: string =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  extra.EXPO_PUBLIC_BACKEND_URL ||
  extra.EXPO_BACKEND_URL ||
  '';

if (!baseURL) {
  // eslint-disable-next-line no-console
  console.warn('Backend baseURL missing. Ensure EXPO_PUBLIC_BACKEND_URL is set.');
}

export const api = axios.create({
  baseURL,
  timeout: 20000,
});

export function apiPath(path: string) {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `/api${clean}`;
}
