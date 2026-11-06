import type { Socket } from 'socket.io-client';
import * as Keychain from 'react-native-keychain';
import { authenticatedRequest } from './authService';
import { apiBaseUrl } from '../config/api';
export type GameMode = 'write' | 'read';
export type GamePlayer = {
  id: string;
  name: string;
  ready: boolean;
  left: boolean;
  score: number;
  submitted: boolean;
};
export type GameAttempt = {
  user_id: string;
  answer: string;
  answer_reading?: string | null;
  correct: boolean;
  rank: number | null;
  points: number;
  sequence: number;
  response_ms?: number | null;
  spoken_ms?: number | null;
  buzz_ms?: number | null;
};
export type GameResult = {
  word: string;
  reading: string;
  meaning: string;
  technical_error?: string | null;
};
export type GameRoom = {
  id: string;
  code: string;
  host_id: string;
  mode: GameMode;
  version: number;
  phase:
    | 'waiting'
    | 'countdown'
    | 'question'
    | 'reading'
    | 'judging'
    | 'results'
    | 'finished'
    | 'closed';
  level: string;
  source: 'jlpt' | 'lesson';
  lesson_id: string | null;
  question_count: number;
  seconds: number;
  number: number;
  round_id: string | null;
  deadline: number | null;
  server_time: number;
  holder: string | null;
  voice_ready: boolean;
  recognizer?: 'browser' | 'cloud';
  players: GamePlayer[];
  question: { word: string; reading?: string; meaning?: string } | null;
  result: GameResult | null;
  attempts: GameAttempt[];
  history: (GameResult & { number: number; attempts: GameAttempt[] })[];
};
export type GameCatalog = {
  level: string;
  available_count: number;
  lessons: {
    id: string;
    title: string;
    textbook: string;
    word_count: number;
  }[];
  page: number;
  total_pages: number;
  read_available: boolean;
};
export type GameConfig = {
  mode: GameMode;
  level: string;
  source: 'jlpt' | 'lesson';
  lesson_id?: string;
  question_count: number;
  seconds: number;
};
export const gameService = {
  catalog: (level: string, page = 1) =>
    authenticatedRequest<GameCatalog>(
      `/games/catalog?level=${level}&page=${page}`,
    ),
  create: (config: GameConfig) =>
    authenticatedRequest<GameRoom>('/games/rooms', config),
  join: (code: string) =>
    authenticatedRequest<GameRoom>(`/games/rooms/${code}/join`, {}),
  snapshot: (code: string) =>
    authenticatedRequest<GameRoom>(`/games/rooms/${code}`),
  action: (
    code: string,
    action:
      | 'ready'
      | 'start'
      | 'answer'
      | 'buzz'
      | 'finish-reading'
      | 'speech-answer'
      | 'leave',
    data: unknown = {},
  ) => authenticatedRequest<GameRoom>(`/games/rooms/${code}/${action}`, data),
  audio: (code: string) =>
    authenticatedRequest<{ url: string; token: string }>(
      `/games/rooms/${code}/audio`,
      {},
    ),
  reading: (code: string, roundId: string, text: string) =>
    authenticatedRequest<{ reading: string }>(
      `/games/rooms/${code}/speech-preview`,
      {
        round_id: roundId,
        text,
      },
    ),
  async watch(
    code: string,
    onChange: () => void,
    onConnection: (connected: boolean) => void,
  ): Promise<() => void> {
    const { io } = await import('socket.io-client');
    let closed = false;
    const socket: Socket = io(`${apiBaseUrl()}/games`, {
      autoConnect: false,
      reconnection: true,
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      auth: async callback => {
        try {
          const value = await authenticatedRequest<{ ticket: string }>(
            '/games/socket-ticket',
            {},
          );
          if (!closed) callback(value);
        } catch {
          onConnection(false);
        }
      },
    });
    socket.on('connect', () => {
      onConnection(true);
      socket.emit('subscribe', { code }, (response: { ok: boolean }) => {
        if (response?.ok) onChange();
        else onConnection(false);
      });
    });
    socket.on('room_changed', (value: { code: string }) => {
      if (value.code === code) onChange();
    });
    socket.on('disconnect', () => onConnection(false));
    socket.on('connect_error', () => onConnection(false));
    socket.connect();
    return () => {
      closed = true;
      socket.removeAllListeners();
      socket.disconnect();
    };
  },
  async saveRoom(userId: string, code: string | null) {
    const service = `com.nihongoflow.game.${userId}`;
    if (code) await Keychain.setGenericPassword('room', code, { service });
    else await Keychain.resetGenericPassword({ service });
  },
  async savedRoom(userId: string) {
    const value = await Keychain.getGenericPassword({
      service: `com.nihongoflow.game.${userId}`,
    });
    return value ? value.password : null;
  },
};
