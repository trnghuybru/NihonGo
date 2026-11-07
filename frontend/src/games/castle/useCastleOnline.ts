import { useCallback, useEffect, useRef, useState } from 'react';
import { gameService } from '../../services/gameService';
import { ApiError } from '../../services/apiClient';
import type { CastleRoom, CastleRoomConfig } from './online.types';

export function useCastleOnline(
  initialCode: string | undefined,
  receive: (room: CastleRoom) => void,
) {
  const [room, setRoom] = useState<CastleRoom | null>(null);
  const [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const current = useRef<CastleRoom | null>(null),
    target = useRef<string | null>(null),
    mounted = useRef(true);
  const receiver = useRef(receive);
  receiver.current = receive;
  const polling = useRef(false),
    again = useRef(false),
    lifecycle = useRef({ generation: 0 }).current;
  const accept = useCallback((next: CastleRoom) => {
    if (
      !mounted.current ||
      next.code !== target.current ||
      (current.current?.id === next.id &&
        current.current.version > next.version)
    )
      return;
    current.current = next;
    setRoom(next);
    setConnected(true);
    setError('');
    receiver.current(next);
  }, []);
  const refresh = useCallback(async () => {
    if (polling.current) {
      again.current = true;
      return;
    }
    const code = target.current;
    if (!code) return;
    polling.current = true;
    try {
      accept(await gameService.castleSnapshot(code));
    } catch (failure) {
      if (mounted.current && code === target.current) {
        setConnected(false);
        setError(
          failure instanceof Error
            ? failure.message
            : 'Mất kết nối phòng. Đang thử lại…',
        );
      }
    } finally {
      polling.current = false;
      if (again.current) {
        again.current = false;
        if (mounted.current && target.current === code) refresh();
      }
    }
  }, [accept]);
  const connect = useCallback(
    async (code: string) => {
      const clean = code.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(clean)) {
        setError('Bạn hãy nhập mã phòng gồm 6 ký tự.');
        return;
      }
      const request = ++lifecycle.generation;
      target.current = clean;
      current.current = null;
      setBusy(true);
      setError('');
      try {
        let next: CastleRoom;
        try {
          next = await gameService.castleSnapshot(clean);
        } catch (failure) {
          if (!(failure instanceof ApiError) || failure.status !== 403)
            throw failure;
          next = await gameService.castleAction(clean, 'join');
        }
        if (request === lifecycle.generation) {
          accept(next);
          return next;
        }
      } catch (failure) {
        if (mounted.current && request === lifecycle.generation) {
          target.current = null;
          setConnected(false);
          setError(
            failure instanceof Error
              ? failure.message
              : 'Không vào được phòng.',
          );
        }
      } finally {
        if (mounted.current && request === lifecycle.generation) setBusy(false);
      }
    },
    [accept, lifecycle],
  );
  const create = useCallback(
    async (config: CastleRoomConfig) => {
      const request = ++lifecycle.generation;
      setBusy(true);
      setError('');
      try {
        const next = await gameService.castleCreate(config);
        if (mounted.current && request === lifecycle.generation) {
          target.current = next.code;
          current.current = null;
          accept(next);
          return next;
        }
      } catch (failure) {
        if (mounted.current)
          setError(
            failure instanceof Error
              ? failure.message
              : 'Không tạo được phòng.',
          );
      } finally {
        if (mounted.current && request === lifecycle.generation) setBusy(false);
      }
    },
    [accept, lifecycle],
  );
  const action = useCallback(
    async (
      kind: 'ready' | 'start' | 'answer' | 'skill',
      data: unknown = {},
    ) => {
      const code = target.current;
      if (!code) return;
      setBusy(true);
      setError('');
      try {
        accept(await gameService.castleAction(code, kind, data));
      } catch (failure) {
        if (mounted.current) {
          if (!(failure instanceof ApiError) || failure.status !== 409)
            setError(
              failure instanceof Error
                ? failure.message
                : 'Chưa gửi được thao tác.',
            );
          refresh();
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [accept, refresh],
  );
  const leave = useCallback(async () => {
    const code = target.current;
    target.current = null;
    current.current = null;
    lifecycle.generation++;
    if (mounted.current) {
      setRoom(null);
      setConnected(false);
      setError('');
    }
    if (code) {
      try {
        await gameService.castleAction(code, 'leave');
      } catch {
        /* Mất mạng: server xử lý bỏ cuộc sau thời gian chờ. */
      }
    }
  }, [lifecycle]);
  useEffect(() => {
    mounted.current = true;
    if (initialCode) connect(initialCode);
    return () => {
      mounted.current = false;
      lifecycle.generation++;
      target.current = null;
    };
  }, [initialCode, connect, lifecycle]);
  const code = room?.code;
  const terminal = room?.phase === 'finished' || room?.phase === 'closed';
  useEffect(() => {
    if (!code || terminal) return;
    let stop: (() => void) | undefined,
      disposed = false;
    const timer = setInterval(() => refresh(), 750);
    gameService
      .watch(
        code,
        () => refresh(),
        available => {
          if (!available && !disposed) refresh();
        },
      )
      .then(close => {
        if (disposed) close();
        else stop = close;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      clearInterval(timer);
      stop?.();
    };
  }, [code, terminal, refresh]);
  return {
    room,
    connected,
    busy,
    error,
    create,
    connect,
    action,
    leave,
    refresh,
  };
}
