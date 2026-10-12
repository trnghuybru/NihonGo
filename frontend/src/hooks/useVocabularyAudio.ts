import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AudioReplay } from '../services/audioReplay';
import { vocabularyService } from '../services/vocabularyService';

export function useVocabularyAudio(scope: string) {
  const player = useRef<AudioReplay | null>(null);
  const generation = useRef(0);
  const active = useRef<string | null>(null);
  const [wordId, setWordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    wordId: string;
    message: string;
  } | null>(null);
  const stop = useCallback(() => {
    generation.current += 1;
    player.current?.stop();
    active.current = null;
    setWordId(null);
    setLoading(false);
  }, []);
  useEffect(() => {
    stop();
    setError(null);
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
  }, [scope, stop]);
  const toggle = useCallback(
    async (id: string) => {
      const previous = active.current;
      stop();
      setError(null);
      if (previous === id) return;
      const current = generation.current;
      active.current = id;
      setWordId(id);
      setLoading(true);
      try {
        const response = await vocabularyService.audioPlayback(id);
        if (current !== generation.current) return;
        const started = await player.current?.play(response.url, () => {
          if (current === generation.current) stop();
        });
        if (current === generation.current) {
          if (!started) throw new Error('Audio unavailable');
          setLoading(false);
        }
      } catch {
        if (current === generation.current) {
          stop();
          setError({
            wordId: id,
            message: 'Không phát được âm thanh. Nhấn loa để thử lại.',
          });
        }
      }
    },
    [stop],
  );
  return { wordId, loading, error, toggle, stop };
}
