export type Role = 'CHASSEUR' | 'CHASSE';

export type GameState = 'LOBBY' | 'HEAD_START' | 'HUNTING' | 'ENDED';

export type RoleMode = 'FREE' | 'HOST' | 'RANDOM';

export type GameMode = 'TIMER' | 'INFECTED';

export type PlayerStatus = 'ACTIVE' | 'SPECTATOR';

export interface Location {
  latitude: number;
  longitude: number;
  timestamp?: number;
}

export interface PlayerStats {
  captures_count: number;
  times_captured: number;
  successful_risks: number;
  survived_seconds: number;
}

export interface PlayerRiskState {
  used_in_current_ping_cycle: boolean;
  is_active: boolean;
  remaining_seconds: number;
  activated_at: number | null;
  expires_at: number | null;
}

export interface Player {
  id: string;
  name: string;
  role: Role;
  initial_role?: Role;
  status?: PlayerStatus;
  is_host: boolean;
  is_connected: boolean;
  score_total?: number;
  score_current_round?: number;
  captured_by?: string | null;
  proximity_alert?: boolean;
  stats?: PlayerStats;
  risk_state?: PlayerRiskState;
  location?: Location;
}

export interface RoomConfig {
  game_mode: GameMode;
  game_duration_seconds: number;
  head_start_duration: number;
  reveal_interval: number;
  initial_hunters_count: number;
  role_assignment: RoleMode;
  anonymous_markers: boolean;
  risk_survival_duration: number;
  ping_fuzz_radius_meters: number;
  proximity_alert_meters: number;
  final_sprint_enabled: boolean;
}

export interface MapMarker {
  player_id: string;
  player_name: string;
  display_name?: string;
  role?: Role;
  latitude: number;
  longitude: number;
  timestamp: number;
  last_updated?: number;
  source?: 'PING' | 'RISK_TAKEN';
}

export type ChasseReveal = MapMarker;

export interface RoundSummaryScore {
  player_id: string;
  name: string;
  initial_role: Role;
  final_role: Role;
  status: PlayerStatus;
  score_round: number;
  score_total: number;
  captures_count: number;
  successful_risks: number;
}

export interface RoundSummary {
  round_number: number;
  game_mode: GameMode;
  winner_team: 'CHASSE' | 'CHASSEUR' | 'NONE';
  reason: string;
  duration_seconds: number;
  mvp_player_id: string | null;
  mvp_player_name: string | null;
  mvp_score_round: number;
  scoreboard: RoundSummaryScore[];
}

export interface RoomEvent {
  type: string;
  message: string;
  timestamp: number;
}

export interface Room {
  code: string;
  state: GameState;
  host_id?: string;
  round_number?: number;
  players: Record<string, Player>;
  created_at: number;
  start_time?: number;
  head_start_duration: number;
  reveal_interval: number;
  role_mode?: RoleMode;
  max_hunters?: number;
  config?: RoomConfig;
  timers?: {
    round_started_at: number | null;
    hunting_started_at: number | null;
    phase_remaining_seconds: number;
    phase_total_seconds: number;
    game_remaining_seconds: number | null;
    game_total_seconds: number | null;
    next_reveal_at: number | null;
    ping_cycle_index: number;
  };
  map_snapshot?: {
    last_ping_timestamp: number | null;
    ping_cycle_index: number;
    markers: MapMarker[];
  };
  last_round_summary?: RoundSummary | null;
  last_event?: RoomEvent | null;
}

export type WSAction =
  | 'JOIN_ROOM'
  | 'LEAVE_ROOM'
  | 'START_GAME'
  | 'END_GAME_EARLY'
  | 'UPDATE_LOCATION'
  | 'ROOM_STATE'
  | 'GAME_STARTED'
  | 'GAME_ENDED'
  | 'TIMER_TICK'
  | 'LOCATION_REVEAL'
  | 'HUNTED_POSITIONS_REVEAL'
  | 'UPDATE_CONFIG'
  | 'CHANGE_PLAYER_ROLE'
  | 'TRANSFER_HOST'
  | 'RESET_SCORES'
  | 'TAKE_RISK'
  | 'DECLARE_CAPTURE'
  | 'ERROR'
  | 'PONG'
  | 'PING';

export interface WSMessage {
  action: WSAction;
  payload?: any;
}
