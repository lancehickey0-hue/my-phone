import Constants from 'expo-constants';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

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

// Add token to requests
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors (unauthorized)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export function apiPath(path: string) {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `/api${clean}`;
}

// Authentication functions
export const login = async (email: string, password: string) => {
  try {
    const response = await api.post(apiPath('/auth/login'), { email, password });
    const { token, user } = response.data;
    
    useAuthStore.getState().setToken(token);
    useAuthStore.getState().setUser(user);
    
    return { success: true, user };
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

export const signup = async (email: string, password: string) => {
  try {
    const response = await api.post(apiPath('/auth/signup'), { email, password });
    const { token, user } = response.data;
    
    useAuthStore.getState().setToken(token);
    useAuthStore.getState().setUser(user);
    
    return { success: true, user };
  } catch (error) {
    console.error('Signup error:', error);
    throw error;
  }
};