export type Role = 'CHASSEUR' | 'CHASSE';

export type GameState = 'LOBBY' | 'HEAD_START' | 'HUNTING' | 'ENDED';

export interface Location {
  latitude: number;
  longitude: number;
  timestamp?: number;
}

export interface Player {
  id: string;
  name: string;
  role: Role;
  is_host: boolean;
  is_connected: boolean;
  location?: Location;
}

export interface Room {
  code: string;
  state: GameState;
  players: Record<string, Player>;
  created_at: number;
  start_time?: number;
  head_start_duration: number;
  reveal_interval: number;
}

export interface ChasseReveal {
  player_id: string;
  player_name: string;
  latitude: number;
  longitude: number;
  timestamp: number;
}

export type WSAction =
  | 'JOIN_ROOM'
  | 'LEAVE_ROOM'
  | 'START_GAME'
  | 'UPDATE_LOCATION'
  | 'ROOM_STATE'
  | 'GAME_STARTED'
  | 'TIMER_TICK'
  | 'LOCATION_REVEAL'
  | 'ERROR'
  | 'PONG'
  | 'PING';

export interface WSMessage {
  action: WSAction;
  payload?: any;
}
