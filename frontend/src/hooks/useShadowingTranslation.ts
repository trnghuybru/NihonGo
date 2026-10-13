import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  shadowingService,
  ShadowingTranslation,
} from '../services/shadowingService';

export function useShadowingTranslation(
  jobId: string | undefined,
  enabled: boolean,
) {
  const [data, setData] = useState<ShadowingTranslation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const retryTranslation = useCallback(() => setRetry(value => value + 1), []);
  useEffect(() => {
    setData(null);
    setError('');
    setRetry(0);
  }, [jobId]);
  useEffect(() => {
    if (!jobId || !enabled) {
      setLoading(false);
      return;
    }
    let disposed = false;
    let foreground = AppState.currentState !== 'background';
    let timer: ReturnType<typeof setTimeout>;
    let first = true;
    setLoading(true);
    setError('');
    const poll = async () => {
      if (disposed) return;
      if (!foreground) {
        timer = setTimeout(poll, 3000);
        return;
      }
      try {
        let result = await shadowingService.translation(jobId);
        if (disposed) return;
        if (
          result.status === 'not_requested' ||
          (first && retry > 0 && result.status === 'failed')
        ) {
          result = await shadowingService.requestTranslation(jobId);
          if (disposed) return;
        }
        first = false;
        setData(result);
        setLoading(false);
        if (result.status === 'queued' || result.status === 'translating') {
          timer = setTimeout(poll, 3000);
        }
      } catch (failure) {
        if (!disposed) {
          setLoading(false);
          setError(
            failure instanceof Error
              ? failure.message
              : 'Không tải được bản dịch.',
          );
        }
      }
    };
    poll();
    const listener = AppState.addEventListener('change', state => {
      foreground = state === 'active';
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      listener.remove();
    };
  }, [jobId, enabled, retry]);
  return { data, loading, error, retry: retryTranslation };
}
