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
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  useEffect(() => {
    let mounted = true;
    let retryTimeout: NodeJS.Timeout | null = null;

    const bootstrap = async () => {
      try {
        if (!mounted) return;
        
        if (deviceId) {
          setError(null);
          return;
        }

        setBooting(true);
        setError(null);

        const id = await getOrCreateDeviceId();
        if (!mounted) return;

        setDeviceId(id);

        try {
          const res = await api.post(apiPath('/devices/register'), {
            device_id: id,
            platform: Platform.OS,
          });
          
          if (!mounted) return;
          
          if (res?.data?.settings) {
            setSettings(res.data.settings);
          }
          
          setError(null);
          setRetryCount(0); // Reset retry count on success
        } catch (apiError: any) {
          if (!mounted) return;
          
          const errorMessage = apiError?.message ?? 'Failed to register device';
          console.error('[useBootstrapDevice] Device registration failed:', errorMessage);
          
          // Retry with exponential backoff if device registration fails
          if (retryCount < maxRetries) {
            const backoffDelay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            console.warn(`[useBootstrapDevice] Retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
            
            setRetryCount(retryCount + 1);
            retryTimeout = setTimeout(() => {
              if (mounted) {
                bootstrap();
              }
            }, backoffDelay);
          } else {
            setError(`Device registration failed after ${maxRetries} attempts: ${errorMessage}`);
          }
        }
      } catch (e: any) {
        if (!mounted) return;
        
        const errorMessage = e?.message ?? 'Failed to initialize device';
        console.error('[useBootstrapDevice] Bootstrap failed:', errorMessage);
        setError(errorMessage);
        
        // Don't retry on device ID generation failures
        setBooting(false);
      } finally {
        if (mounted) {
          setBooting(false);
        }
      }
    };

    bootstrap();

    return () => {
      mounted = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
    // Only run on mount - deviceId is in dependency but we check it internally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { deviceId, booting, error };
}
