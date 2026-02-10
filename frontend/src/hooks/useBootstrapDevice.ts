import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { api, apiPath } from '../lib/api';
import { getOrCreateDeviceId } from '../lib/device';
import { useDeviceStore } from '../stores/deviceStore';
import { useLocatorStore } from '../stores/locatorStore';

export function useBootstrapDevice() {
  const { deviceId, setDeviceId } = useDeviceStore();
  const { setSettings } = useLocatorStore();
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (deviceId) return;
        setBooting(true);
        const id = await getOrCreateDeviceId();
        if (!mounted) return;
        setDeviceId(id);

        const res = await api.post(apiPath('/devices/register'), {
          device_id: id,
          platform: Platform.OS,
        });
        if (!mounted) return;
        if (res?.data?.settings) setSettings(res.data.settings);
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to initialize device');
      } finally {
        if (mounted) setBooting(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { deviceId, booting, error };
}
