import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { JapaneseSpeech } from '../services/japaneseSpeech';
import { AudioReplay } from '../services/audioReplay';
import { vocabularyService } from '../services/vocabularyService';

let currentStop: (() => void) | undefined;

export function useVocabularyAudio(scope: string) {
  const player = useRef<AudioReplay | null>(null);
  const speech = useRef<JapaneseSpeech | null>(null);
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
    if (active.current) speech.current?.stop();
    if (currentStop === stop) currentStop = undefined;
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
    const speaker = new JapaneseSpeech();
    speech.current = speaker;
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active') stop();
    });
    return () => {
      generation.current += 1;
      if (active.current) speaker.stop();
      if (currentStop === stop) currentStop = undefined;
      active.current = null;
      player.current = null;
      instance.close().catch(() => undefined);
      subscription.remove();
    };
  }, [scope, stop]);
  const toggle = useCallback(
    async (id: string, word?: string, reading?: string, hasAudio = true) => {
      const previous = active.current;
      stop();
      setError(null);
      if (previous === id) return;
      currentStop?.();
      currentStop = stop;
      const current = generation.current;
      active.current = id;
      setWordId(id);
      setLoading(true);
      try {
        const complete = () => {
          if (current === generation.current) stop();
        };
        if (hasAudio) {
          try {
            const response = await vocabularyService.audioPlayback(id);
            if (current !== generation.current) return;
            const started = await player.current?.play(response.url, complete);
            if (current !== generation.current) return;
            if (started) {
              setLoading(false);
              return;
            }
          } catch (audioError) {
            if (!word) throw audioError;
          }
        }
        if (current !== generation.current) return;
        const text = reading?.trim() || word?.trim();
        if (!text)
          throw new Error('Không phát được âm thanh. Nhấn loa để thử lại.');
        await speech.current?.speak(text, complete, () => {
          if (current !== generation.current) return;
          stop();
          setError({
            wordId: id,
            message: 'Không phát được giọng đọc. Nhấn loa để thử lại.',
          });
        });
        if (current === generation.current) setLoading(false);
      } catch (cause) {
        if (current === generation.current) {
          stop();
          setError({
            wordId: id,
            message:
              cause instanceof Error
                ? cause.message
                : 'Không phát được âm thanh. Nhấn loa để thử lại.',
          });
        }
      }
    },
    [stop],
  );
  return { wordId, loading, error, toggle, stop };
}
