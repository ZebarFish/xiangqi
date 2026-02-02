
export enum Side {
  RED = 'RED',
  BLACK = 'BLACK'
}

export enum PieceType {
  GENERAL = 'GENERAL', // 帅/将
  ADVISOR = 'ADVISOR', // 士/仕
  ELEPHANT = 'ELEPHANT', // 相/象
  HORSE = 'HORSE', // 马
  CHARIOT = 'CHARIOT', // 车
  CANNON = 'CANNON', // 炮
  SOLDIER = 'SOLDIER' // 兵/卒
}

export interface Position {
  x: number; // 0-8
  y: number; // 0-9
}

export interface Piece {
  id: string;
  type: PieceType;
  side: Side;
  position: Position;
  dead?: boolean;
}

export interface Move {
  from: Position;
  to: Position;
  capturedId?: string;
  notation?: string;
  ts: number; // Timestamp for timer logic
}

export interface UserProfile {
  id: string;
  name: string;
}

export interface PlayerState extends UserProfile {
  timeouts: number; // Count timeouts
  joined: boolean;
}

export interface GamePlayers {
  red: PlayerState | null;
  black: PlayerState | null;
  spectators: UserProfile[];
}

export interface GameMeta {
  last_move_ts: number;
  undo_requester: Side | null; // Side requesting undo
  helper_id: string | null; // ID of spectator allowed to move
}

export interface OnlinePayload {
  pieces: Piece[];
  turn: Side;
  last_move: Move | null;
  history: Move[]; // Full history required for Undo
  winner: string | null;
  players: GamePlayers;
  meta: GameMeta;
}

export type GameMode = 'local' | 'online';
export type PlayerRole = Side | 'SPECTATOR';
