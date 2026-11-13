import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Room, Role, ChasseReveal } from '../types/game';
import { GameWebSocket } from '../services/websocket';
import { startBackgroundLocationUpdates, stopBackgroundLocationUpdates } from '../services/backgroundLocation';

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
  timerPhase: 'HEAD_START' | 'HUNTING' | 'LOBBY';
  chasseReveals: ChasseReveal[];
  myLocation: { latitude: number; longitude: number } | null;
  createRoom: (hostName: string, role: Role) => Promise<string>;
  joinRoom: (roomCode: string, name: string, role: Role) => Promise<void>;
  startGame: () => void;
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
  const [timerTotal, setTimerTotal] = useState<number>(300);
  const [timerPhase, setTimerPhase] = useState<'HEAD_START' | 'HUNTING' | 'LOBBY'>('LOBBY');

  const [chasseReveals, setChasseReveals] = useState<ChasseReveal[]>([]);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const wsRef = useRef<GameWebSocket | null>(null);

  // Décompte local du chronomètre chaque seconde
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

  // Charger automatiquement l'URL active et l'historique des serveurs au démarrage
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
    const action = msg.action || msg.type;
    switch (action) {
      case 'ROOM_STATE':
        setRoom(msg.payload);
        if (msg.payload?.state && msg.payload.state !== 'LOBBY') {
          setTimerPhase(msg.payload.state);
        }
        break;

      case 'GAME_STARTED':
        setTimerPhase('HEAD_START');
        setTimerSeconds(msg.payload?.head_start_duration || 300);
        setTimerTotal(msg.payload?.head_start_duration || 300);
        break;

      case 'TIMER_TICK':
        if (msg.payload) {
          setTimerPhase(msg.payload.phase);
          setTimerSeconds(msg.payload.remaining_seconds);
          setTimerTotal(msg.payload.total_seconds);
        }
        break;

      case 'LOCATION_REVEAL':
      case 'HUNTED_POSITIONS_REVEAL':
        const positions = msg.payload?.chasses || msg.hunted_positions || [];
        setChasseReveals(positions);
        break;

      case 'ERROR':
        alert(`Erreur: ${msg.payload?.message || msg.reason}`);
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
    if (wsRef.current) {
      wsRef.current.send({ action: 'START_GAME' });
    }
  };

  const disconnect = () => {
    stopBackgroundLocationUpdates();
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }
    setRoom(null);
    setTimerPhase('LOBBY');
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
        timerPhase,
        chasseReveals,
        myLocation,
        createRoom,
        joinRoom,
        startGame,
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
