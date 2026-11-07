import type { CastleBattle, CastleEvent, Commander, Side } from './engine';
import type { CastleWord } from './data';
export type CastleMember = Commander & {
  id: string;
  ready: boolean;
  left: boolean;
};
export type CastleFrame = Pick<
  CastleBattle,
  | 'phase'
  | 'now'
  | 'round'
  | 'deadline'
  | 'startedAt'
  | 'finishedAt'
  | 'resolutionAt'
  | 'winner'
  | 'reason'
  | 'hitStopUntil'
  | 'troops'
  | 'question'
> & {
  players: [CastleMember, CastleMember];
  events: (CastleEvent & { seq: number })[];
  mistakes: CastleWord[];
};
export type CastleRoom = {
  game: 'castle';
  id: string;
  code: string;
  host_id: string;
  version: number;
  phase: 'waiting' | CastleFrame['phase'] | 'closed';
  level: string;
  source: 'starter' | 'lesson';
  topic: string;
  lesson_id: string | null;
  round_seconds: 8 | 9 | 10;
  players: CastleMember[];
  me: Side;
  frame: CastleFrame | null;
  server_time: number;
};
export type CastleRoomConfig = {
  level: string;
  source: 'starter' | 'lesson';
  topic?: string;
  lesson_id?: string;
  round_seconds: 8 | 9 | 10;
};
