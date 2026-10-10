import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AudioReplay } from '../services/audioReplay';
import { speakingService } from '../services/speakingService';

export function useAudioReplay(sessionId: string) {
  const player = useRef<AudioReplay | null>(null);
  const generation = useRef(0);
  const active = useRef<string | null>(null);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const stop = useCallback(() => {
    generation.current += 1;
    player.current?.stop();
    active.current = null;
    setMessageId(null);
    setLoading(false);
  }, []);
  useEffect(() => {
    const instance = new AudioReplay();
    player.current = instance;
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active') stop();
    });
    return () => {
      generation.current += 1;
      active.current = null;
      player.current = null;
      instance.close().catch(() => undefined);
      subscription.remove();
    };
  }, [sessionId, stop]);
  const toggle = useCallback(
    async (id: string, assetId: string, normalizeMicrophone = false) => {
      const previous = active.current;
      stop();
      setError('');
      if (previous === id) return;
      const current = generation.current;
      active.current = id;
      setMessageId(id);
      setLoading(true);
      try {
        const response = await speakingService.audioPlayback(
          sessionId,
          assetId,
        );
        if (current !== generation.current) return;
        await player.current?.play(
          response.url,
          () => {
            if (current === generation.current) stop();
          },
          normalizeMicrophone,
        );
        if (current === generation.current) setLoading(false);
      } catch {
        if (current === generation.current) {
          stop();
          setError('Không nghe lại được bản thu. Vui lòng thử lại.');
        }
      }
    },
    [sessionId, stop],
  );
  return { messageId, loading, error, toggle, stop };
}
