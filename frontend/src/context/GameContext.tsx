import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Room, Role, ChasseReveal, WSMessage } from '../types/game';
import { GameWebSocket } from '../services/websocket';
import { startBackgroundLocationUpdates, stopBackgroundLocationUpdates } from '../services/backgroundLocation';

interface GameContextType {
  serverUrl: string;
  setServerUrl: (url: string) => void;
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

const DEFAULT_SERVER_URL = 'ws://localhost:8000'; // Default server URL (can be changed in app UI)

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_SERVER_URL);
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

  const handleWSMessage = (msg: any) => {
    const action = msg.action || msg.type;
    switch (action) {
      case 'ROOM_STATE':
        setRoom(msg.payload);
        break;

      case 'GAME_STARTED':
        setTimerPhase('HEAD_START');
        setTimerSeconds(msg.payload?.head_start_duration || 300);
        setTimerTotal(msg.payload?.head_start_duration || 300);
        break;

      case 'TIMER_TICK':
        setTimerPhase(msg.payload.phase);
        setTimerSeconds(msg.payload.remaining_seconds);
        setTimerTotal(msg.payload.total_seconds);
        break;

      case 'LOCATION_REVEAL':
      case 'HUNTED_POSITIONS_REVEAL':
        const positions = msg.payload?.chasses || msg.hunted_positions || [];
        console.log('[Context] New GPS Reveal received:', positions);
        setChasseReveals(positions);
        break;

      case 'ERROR':
        alert(`Erreur: ${msg.payload?.message || msg.reason}`);
        break;
    }
  };

  const createRoom = async (name: string, selectedRole: Role): Promise<string> => {
    const httpUrl = serverUrl.replace(/^ws/, 'http');
    const res = await fetch(`${httpUrl}/create-game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error('Impossible de créer la Room');

    const data = await res.json();
    const code = data.room_code;

    setPlayerName(name);
    setRole(selectedRole);

    await connectWebSocketAndJoin(code, name, selectedRole);
    return code;
  };

  const joinRoom = async (roomCode: string, name: string, selectedRole: Role): Promise<void> => {
    setPlayerName(name);
    setRole(selectedRole);
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

    // Send JOIN_ROOM message
    ws.send({
      action: 'JOIN_ROOM',
      payload: { player_name: name, role: selectedRole },
    });

    // Start background location updates via TaskManager
    await startBackgroundLocationUpdates(roomCode, playerId, serverUrl, (lat, lng) => {
      setMyLocation({ latitude: lat, longitude: lng });
      // Send location over WebSocket when live
      ws.send({
        action: 'UPDATE_LOCATION',
        payload: { latitude: lat, longitude: lng },
      });
    });
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
