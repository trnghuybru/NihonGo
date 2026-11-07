import { authenticatedRequest } from './authService';
import type { LibraryGame } from '../screens/GameLibraryScreen';
export type SharedSettings = {
  level: string;
  source: 'starter' | 'jlpt' | 'lesson';
  topic: string;
  lesson_id: string | null;
  question_count: number;
  seconds: number;
};
export type SharedRoom = {
  id: string;
  code: string;
  host_id: string;
  version: number;
  phase: string;
  game: LibraryGame | null;
  selected_game: LibraryGame | null;
  settings: SharedSettings;
  members: { id: string; name: string; ready: boolean }[];
  round: number;
  read_available: boolean;
  configured: boolean;
};
export const sharedRoomService = {
  create: (game: LibraryGame | null, level: string) =>
    authenticatedRequest<SharedRoom>('/games/lobbies', { game, level }),
  snapshot: (code: string) =>
    authenticatedRequest<SharedRoom>(
      '/games/lobbies/' + encodeURIComponent(code),
    ),
  action: (
    code: string,
    action: 'join' | 'select' | 'ready' | 'start' | 'leave',
    data: unknown = {},
  ) =>
    authenticatedRequest<SharedRoom>(
      '/games/lobbies/' + encodeURIComponent(code) + '/' + action,
      data,
    ),
};
