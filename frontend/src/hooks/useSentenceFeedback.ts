import { useCallback, useEffect, useRef, useState } from 'react';
import { SentenceFeedback, speakingService } from '../services/speakingService';
import { errorMessage } from './useSpeakingScenarios';

export function useSentenceFeedback(sessionId: string) {
  const [states, setStates] = useState<Record<string, SentenceFeedback>>({});
  const cached = useRef<Record<string, SentenceFeedback>>({});
  const pending = useRef(new Set<string>());
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    cached.current = {};
    pending.current.clear();
    setStates({});
    return () => {
      generation.current += 1;
    };
  }, [sessionId]);
  const request = useCallback(
    async (id: string) => {
      if (pending.current.has(id) || cached.current[id]?.status === 'completed')
        return;
      const current = generation.current;
      const publish = (value: SentenceFeedback) => {
        if (current !== generation.current) return;
        cached.current[id] = value;
        setStates(previous => ({ ...previous, [id]: value }));
      };
      pending.current.add(id);
      publish({ status: 'processing', result: null });
      try {
        const deadline = Date.now() + 120000;
        while (current === generation.current) {
          const value = await speakingService.messageFeedback(sessionId, id);
          publish(value);
          if (value.status !== 'processing') break;
          if (Date.now() >= deadline)
            throw new Error('Nhận xét đang mất nhiều thời gian. Hãy thử lại.');
          await new Promise<void>(resolve => setTimeout(resolve, 2000));
        }
      } catch (failure) {
        publish({
          status: 'failed',
          result: null,
          error: errorMessage(failure),
        });
      } finally {
        if (current === generation.current) pending.current.delete(id);
      }
    },
    [sessionId],
  );
  return { states, request };
}
