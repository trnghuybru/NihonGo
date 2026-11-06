import { useCallback, useEffect, useRef, useState } from 'react';
import { createGameSpeech } from '../services/gameSpeech';
import { gameService, GameRoom } from '../services/gameService';

export function useGameReading(
  room: GameRoom | null,
  userId: string,
  micActive: boolean,
  receive: (room: GameRoom) => void,
) {
  const [speech] = useState(createGameSpeech);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const retryAnswer = useRef<(() => void) | null>(null);
  const finishAnswer = useRef<(() => void) | null>(null);
  const code = room?.code,
    round = room?.round_id;
  const enabled = Boolean(
    speech.supported &&
      micActive &&
      room?.recognizer === 'browser' &&
      room?.phase === 'reading' &&
      room.holder === userId,
  );

  useEffect(() => {
    let disposed = false;
    let pending = false;
    let latestText = '';
    let previewTimer: ReturnType<typeof setTimeout> | null = null;
    setText('');
    setNotice('');
    setListening(false);
    setSubmitting(false);
    retryAnswer.current = null;
    finishAnswer.current = null;
    if (!enabled || !code || !round) {
      speech.close();
      return;
    }
    const fallback = async () => {
      if (disposed || pending) return;
      pending = true;
      setListening(false);
      setSubmitting(true);
      speech.close();
      setNotice('Đang chuyển sang nhận dạng dự phòng…');
      const send = async () => {
        try {
          const next = await gameService.action(code, 'finish-reading', {
            round_id: round,
            fallback: true,
          });
          if (!disposed) receive(next);
        } catch {
          if (!disposed) {
            pending = false;
            setSubmitting(false);
            setNotice('Chưa kết nối được. Bấm thử lại.');
            retryAnswer.current = () => {
              pending = false;
              fallback();
            };
          }
        }
      };
      await send();
    };
    const sendAnswer = async (alternatives: string[]) => {
      if (disposed || pending) return;
      pending = true;
      speech.close();
      setListening(false);
      setSubmitting(true);
      try {
        const next = await gameService.action(code, 'speech-answer', {
          round_id: round,
          alternatives,
        });
        if (!disposed) receive(next);
      } catch {
        if (!disposed) {
          pending = false;
          setSubmitting(false);
          setNotice('Chưa gửi được kết quả. Bấm thử lại.');
          retryAnswer.current = () => {
            sendAnswer(alternatives);
          };
        }
      }
    };
    const completeOrFallback = () => {
      if (latestText) sendAnswer([latestText.slice(0, 100)]);
      else fallback();
    };
    finishAnswer.current = () => {
      // The player explicitly confirms the displayed text. Some browsers never
      // emit a final result after stop(), so do not discard usable interim text.
      if (latestText) sendAnswer([latestText.slice(0, 100)]);
      else speech.stop();
    };
    setListening(true);
    speech.start({
      onText: value => {
        if (!disposed) {
          latestText = value.trim();
          if (previewTimer) clearTimeout(previewTimer);
          const normalized = latestText
            .normalize('NFKC')
            .replace(/[\u30a1-\u30f6]/g, char =>
              String.fromCharCode(char.charCodeAt(0) - 0x60),
            );
          if (/^[\u3041-\u3096ー\s。、！？!?]*$/.test(normalized)) {
            setText(normalized);
          } else {
            setText('');
            const requested = latestText;
            previewTimer = setTimeout(() => {
              if (disposed || pending) return;
              gameService
                .reading(code, round, requested.slice(0, 100))
                .then(result => {
                  if (!disposed && latestText === requested)
                    setText(result.reading);
                })
                .catch(() => {
                  /* Display conversion must never block grading. */
                });
            }, 250);
          }
        }
      },
      onFinal: alternatives => {
        sendAnswer(alternatives);
      },
      onError: () => {
        completeOrFallback();
      },
      onEnd: () => {
        completeOrFallback();
      },
    });
    return () => {
      disposed = true;
      if (previewTimer) clearTimeout(previewTimer);
      speech.close();
      retryAnswer.current = null;
      finishAnswer.current = null;
    };
  }, [enabled, code, round, speech, retry, receive]);

  const finish = useCallback(() => {
    if (retryAnswer.current) retryAnswer.current();
    else if (listening) finishAnswer.current?.();
    else setRetry(value => value + 1);
  }, [listening]);
  return {
    supported: speech.supported,
    enabled,
    text,
    listening,
    submitting,
    notice,
    finish,
  };
}
