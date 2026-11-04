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
    setText('');
    setNotice('');
    setListening(false);
    setSubmitting(false);
    retryAnswer.current = null;
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
    setListening(true);
    speech.start({
      onText: value => {
        if (!disposed) setText(value);
      },
      onFinal: alternatives => {
        sendAnswer(alternatives);
      },
      onError: () => {
        fallback();
      },
      onEnd: () => {
        fallback();
      },
    });
    return () => {
      disposed = true;
      speech.close();
      retryAnswer.current = null;
    };
  }, [enabled, code, round, speech, retry, receive]);

  const finish = useCallback(() => {
    if (retryAnswer.current) retryAnswer.current();
    else if (listening) speech.stop();
    else setRetry(value => value + 1);
  }, [listening, speech]);
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
