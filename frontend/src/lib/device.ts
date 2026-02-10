import * as Crypto from 'expo-crypto';
import { getJson, setJson } from './storage';

const DEVICE_ID_KEY = 'myphone_device_id_v1';

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getJson<string>(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await setJson(DEVICE_ID_KEY, id);
  return id;
}
