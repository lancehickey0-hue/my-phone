import 'react-native-get-random-values';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Single source of truth for "which install is this" and "prove it".
// Previously this logic was copy-pasted into app/_layout.tsx,
// app/(tabs)/devices.tsx and src/lib/BackgroundLocation.ts.

const DEVICE_ID_KEY = 'device_uuid';
const DEVICE_SECRET_KEY = 'device_secret';

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomUuid(): string {
  const h = randomHex(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Stable per-install ID. A previously stored ID always wins, so existing
// installs keep the exact ID they already registered with. (The old code
// read `Application.androidId`, which doesn't exist in this Expo SDK, so
// every existing install is already on the stored UUID.) New installs
// prefer the Android ID, which survives an app reinstall.
export async function getPhysicalDeviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) return stored;

  let id = '';
  try {
    if (Platform.OS === 'android') {
      id = Application.getAndroidId() ?? '';
    } else if (Platform.OS === 'ios') {
      id = (await Application.getIosIdForVendorAsync()) ?? '';
    }
  } catch {
    id = '';
  }
  if (!id) id = randomUuid();

  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

// Read-only lookup for headless code (background location task). Never
// mints a new ID there — a background task inventing its own ID would
// create a phantom device that doesn't match what was registered.
export async function readPhysicalDeviceId(): Promise<string> {
  return (await SecureStore.getItemAsync(DEVICE_ID_KEY)) ?? '';
}

// 256-bit secret generated once per install, sent to the server when the
// install links itself, and presented on every headless HTTP call.
export async function getOrCreateDeviceSecret(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_SECRET_KEY);
  if (stored) return stored;
  const secret = randomHex(32);
  await SecureStore.setItemAsync(DEVICE_SECRET_KEY, secret);
  return secret;
}

export async function readDeviceSecret(): Promise<string> {
  return (await SecureStore.getItemAsync(DEVICE_SECRET_KEY)) ?? '';
}

export function defaultDeviceName(): string {
  return Platform.OS === 'ios' ? 'My iPhone' : 'My Phone';
}

// Proof that a remote stop/unlock is coming from THIS linked install (see
// assertRemoteCaller in convex/devices.ts). Spread into the mutation args.
export async function getCallerProof(): Promise<{
  callerPhysicalDeviceId?: string;
  callerDeviceSecret?: string;
}> {
  const [id, secret] = await Promise.all([readPhysicalDeviceId(), readDeviceSecret()]);
  return id && secret ? { callerPhysicalDeviceId: id, callerDeviceSecret: secret } : {};
}
