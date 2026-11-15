import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Room, Role, ChasseReveal, RoleMode, GameMode } from '../types/game';
import { GameWebSocket } from '../services/websocket';
import { startBackgroundLocationUpdates, stopBackgroundLocationUpdates } from '../services/backgroundLocation';

export interface RoomConfigUpdate {
  game_mode?: GameMode;
  game_duration_seconds?: number;
  head_start_duration?: number;
  reveal_interval?: number;
  role_mode?: RoleMode;
  max_hunters?: number;
  anonymous_markers?: boolean;
  risk_survival_duration?: number;
  ping_fuzz_radius_meters?: number;
  proximity_alert_meters?: number;
  final_sprint_enabled?: boolean;
}

interface GameContextType {
  serverUrl: string;
  setServerUrl: (url: string) => void;
  serverHistory: string[];
  removeServerHistory: (url: string) => void;
  room: Room | null;
  playerId: string;
  playerName: string;
  setPlayerName: (name: string) => void;
  role: Role;
  setRole: (role: Role) => void;
  timerSeconds: number;
  timerTotal: number;
  gameRemainingSeconds: number | null;
  timerPhase: 'HEAD_START' | 'HUNTING' | 'LOBBY';
  chasseReveals: ChasseReveal[];
  myLocation: { latitude: number; longitude: number } | null;
  createRoom: (hostName: string, role: Role) => Promise<string>;
  joinRoom: (roomCode: string, name: string, role: Role) => Promise<void>;
  startGame: () => void;
  endGameEarly: () => void;
  updateRoomConfig: (config: RoomConfigUpdate) => void;
  changePlayerRole: (targetId: string, newRole: Role) => void;
  transferHost: (targetId: string) => void;
  resetScores: () => void;
  takeRisk: () => void;
  declareCapture: (hunterId?: string) => void;
  disconnect: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const STORAGE_KEY_SERVER_URL = '@manhunt_server_url';
const STORAGE_KEY_SERVER_HISTORY = '@manhunt_server_history';
const DEFAULT_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || '';

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serverUrl, setServerUrlState] = useState<string>(DEFAULT_SERVER_URL);
  const [serverHistory, setServerHistory] = useState<string[]>([]);

  const [playerId] = useState<string>(() => 'player_' + Math.random().toString(36).substring(2, 9));
  const [playerName, setPlayerName] = useState<string>('');
  const [role, setRole] = useState<Role>('CHASSE');
  const [room, setRoom] = useState<Room | null>(null);

  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [timerTotal, setTimerTotal] = useState<number>(180);
  const [gameRemainingSeconds, setGameRemainingSeconds] = useState<number | null>(null);
  const [timerPhase, setTimerPhase] = useState<'HEAD_START' | 'HUNTING' | 'LOBBY'>('LOBBY');

  const [chasseReveals, setChasseReveals] = useState<ChasseReveal[]>([]);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const wsRef = useRef<GameWebSocket | null>(null);

  // Décompte fluide local entre deux ticks serveur
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (timerPhase !== 'LOBBY' && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerPhase, timerSeconds > 0]);

  // Charger l'URL active et l'historique des serveurs au démarrage
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_SERVER_URL),
      AsyncStorage.getItem(STORAGE_KEY_SERVER_HISTORY),
    ])
      .then(([savedUrl, savedHistory]) => {
        if (savedUrl) setServerUrlState(savedUrl);
        if (savedHistory) {
          try {
            setServerHistory(JSON.parse(savedHistory));
          } catch (e) {}
        }
      })
      .catch(() => {});
  }, []);

  const setServerUrl = (url: string) => {
    setServerUrlState(url);
    AsyncStorage.setItem(STORAGE_KEY_SERVER_URL, url).catch(() => {});
  };

  const addUrlToHistory = (url: string) => {
    if (!url || !url.trim()) return;
    const clean = url.trim();
    setServerHistory((prev) => {
      const filtered = prev.filter((item) => item !== clean);
      const updated = [clean, ...filtered].slice(0, 5);
      AsyncStorage.setItem(STORAGE_KEY_SERVER_HISTORY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  };

  const removeServerHistory = (urlToRemove: string) => {
    setServerHistory((prev) => {
      const updated = prev.filter((item) => item !== urlToRemove);
      AsyncStorage.setItem(STORAGE_KEY_SERVER_HISTORY, JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  };

  const handleWSMessage = (msg: any) => {
    if (!msg) return;
    const action = msg.action || msg.type;
    switch (action) {
      case 'ROOM_STATE':
        if (msg.payload) {
          const roomData: Room = msg.payload;
          setRoom(roomData);
          if (roomData.players && roomData.players[playerId]) {
            setRole(roomData.players[playerId].role);
          }
          if (roomData.state === 'LOBBY') {
            setTimerPhase('LOBBY');
            setChasseReveals([]);
            setGameRemainingSeconds(null);
          } else if (roomData.state === 'HEAD_START' || roomData.state === 'HUNTING') {
            setTimerPhase(roomData.state);
            if (roomData.map_snapshot?.markers) {
              setChasseReveals(roomData.map_snapshot.markers);
            }
          }
        }
        break;

      case 'GAME_STARTED':
        const duration = msg.payload?.head_start_duration || 120;
        setTimerPhase('HEAD_START');
        setTimerSeconds(duration);
        setTimerTotal(duration);
        setChasseReveals([]); // Carte vide au lancement pendant le HEAD_START
        if (msg.payload?.game_mode === 'TIMER') {
          setGameRemainingSeconds(msg.payload?.game_duration_seconds || 1200);
        } else {
          setGameRemainingSeconds(null);
        }
        setRoom((prev) => (prev ? { ...prev, state: 'HEAD_START' } : prev));
        break;

      case 'GAME_ENDED':
        setTimerPhase('LOBBY');
        setChasseReveals([]);
        setGameRemainingSeconds(null);
        setRoom((prev) =>
          prev
            ? {
                ...prev,
                state: 'LOBBY',
                last_round_summary: msg.payload || prev.last_round_summary,
              }
            : prev
        );
        break;

      case 'TIMER_TICK':
        if (msg.payload) {
          setTimerPhase(msg.payload.phase);
          setTimerSeconds(msg.payload.remaining_seconds);
          setTimerTotal(msg.payload.total_seconds);
          if (typeof msg.payload.game_remaining_seconds === 'number') {
            setGameRemainingSeconds(msg.payload.game_remaining_seconds);
          } else {
            setGameRemainingSeconds(null);
          }
          if (msg.payload.phase) {
            setRoom((prev) => (prev ? { ...prev, state: msg.payload.phase } : prev));
          }
        }
        break;

      case 'LOCATION_REVEAL':
      case 'HUNTED_POSITIONS_REVEAL':
        const markers =
          msg.payload?.markers ||
          msg.payload?.chasses ||
          msg.markers ||
          msg.hunted_positions ||
          [];
        setChasseReveals(markers);
        break;

      case 'ERROR':
        alert(`Erreur: ${msg.payload?.message || msg.reason || 'Une erreur est survenue'}`);
        break;
    }
  };

  const getCleanHttpUrl = (rawUrl: string): string => {
    let url = rawUrl.trim().replace(/\/+$/, '');
    if (url.startsWith('wss://')) return url.replace(/^wss:\/\//, 'https://');
    if (url.startsWith('ws://')) return url.replace(/^ws:\/\//, 'http://');
    if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://${url}`;
    return url;
  };

  const createRoom = async (name: string, selectedRole: Role): Promise<string> => {
    const httpUrl = getCleanHttpUrl(serverUrl);
    const res = await fetch(`${httpUrl}/create-game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error('Impossible de créer la Room');

    const data = await res.json();
    const code = data.room_code;

    setPlayerName(name);
    setRole(selectedRole);

    addUrlToHistory(serverUrl);
    await connectWebSocketAndJoin(code, name, selectedRole);
    return code;
  };

  const joinRoom = async (roomCode: string, name: string, selectedRole: Role): Promise<void> => {
    setPlayerName(name);
    setRole(selectedRole);
    addUrlToHistory(serverUrl);
    await connectWebSocketAndJoin(roomCode, name, selectedRole);
  };

  const connectWebSocketAndJoin = async (roomCode: string, name: string, selectedRole: Role) => {
    if (wsRef.current) {
      wsRef.current.disconnect();
    }

    const ws = new GameWebSocket(serverUrl, roomCode, playerId, selectedRole);
    wsRef.current = ws;

    ws.subscribe(handleWSMessage);
    await ws.connect();

    ws.send({
      action: 'JOIN_ROOM',
      payload: { player_name: name, role: selectedRole },
    });

    try {
      await startBackgroundLocationUpdates(roomCode, playerId, serverUrl, (lat, lng) => {
        setMyLocation({ latitude: lat, longitude: lng });
        ws.send({
          action: 'UPDATE_LOCATION',
          payload: { latitude: lat, longitude: lng },
        });
      });
    } catch (err) {
      console.warn('[GameContext] GPS setup warning:', err);
    }
  };

  const startGame = () => {
    wsRef.current?.send({ action: 'START_GAME' });
  };

  const endGameEarly = () => {
    wsRef.current?.send({ action: 'END_GAME_EARLY' });
  };

  const updateRoomConfig = (config: RoomConfigUpdate) => {
    wsRef.current?.send({
      action: 'UPDATE_CONFIG',
      payload: config,
    });
  };

  const changePlayerRole = (targetId: string, newRole: Role) => {
    wsRef.current?.send({
      action: 'CHANGE_PLAYER_ROLE',
      payload: { target_id: targetId, role: newRole },
    });
  };

  const transferHost = (targetId: string) => {
    wsRef.current?.send({
      action: 'TRANSFER_HOST',
      payload: { target_id: targetId },
    });
  };

  const resetScores = () => {
    wsRef.current?.send({ action: 'RESET_SCORES' });
  };

  const takeRisk = () => {
    wsRef.current?.send({ action: 'TAKE_RISK' });
  };

  const declareCapture = (hunterId?: string) => {
    wsRef.current?.send({
      action: 'DECLARE_CAPTURE',
      payload: { hunter_id: hunterId },
    });
  };

  const disconnect = () => {
    stopBackgroundLocationUpdates();
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }
    setRoom(null);
    setTimerPhase('LOBBY');
    setChasseReveals([]);
    setGameRemainingSeconds(null);
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <GameContext.Provider
      value={{
        serverUrl,
        setServerUrl,
        serverHistory,
        removeServerHistory,
        room,
        playerId,
        playerName,
        setPlayerName,
        role,
        setRole,
        timerSeconds,
        timerTotal,
        gameRemainingSeconds,
        timerPhase,
        chasseReveals,
        myLocation,
        createRoom,
        joinRoom,
        startGame,
        endGameEarly,
        updateRoomConfig,
        changePlayerRole,
        transferHost,
        resetScores,
        takeRisk,
        declareCapture,
        disconnect,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame context must be used within GameProvider');
  return ctx;
};
