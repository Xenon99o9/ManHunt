import { WSMessage } from '../types/game';

type MessageListener = (msg: WSMessage) => void;

export class GameWebSocket {
  private socket: WebSocket | null = null;
  private listeners: Set<MessageListener> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;
  private isIntentionalDisconnect = false;

  constructor(
    private baseUrl: string,
    private roomCode: string,
    private playerId: string,
    private role: string
  ) {}

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isIntentionalDisconnect = false;
      let cleanedUrl = this.baseUrl.trim().replace(/\/+$/, '');
      if (cleanedUrl.startsWith('https://')) {
        cleanedUrl = cleanedUrl.replace(/^https:\/\//, 'wss://');
      } else if (cleanedUrl.startsWith('http://')) {
        cleanedUrl = cleanedUrl.replace(/^http:\/\//, 'ws://');
      } else if (!cleanedUrl.startsWith('ws://') && !cleanedUrl.startsWith('wss://')) {
        cleanedUrl = `wss://${cleanedUrl}`;
      }

      const wsUrl = `${cleanedUrl}/ws/${this.roomCode}/${this.playerId}/${this.role.toLowerCase()}`;
      console.log(`[WebSocket] Connecting to ${wsUrl}...`);

      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[WebSocket] Connection established.');
        this.startHeartbeat();
        resolve();
      };

      this.socket.onmessage = (event) => {
        try {
          const data: WSMessage = JSON.parse(event.data);
          this.notifyListeners(data);
        } catch (err) {
          console.error('[WebSocket] Error parsing incoming message:', err);
        }
      };

      this.socket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        reject(error);
      };

      this.socket.onclose = (event) => {
        console.log(`[WebSocket] Connection closed: code=${event.code}, reason=${event.reason}`);
        this.stopHeartbeat();
        if (!this.isIntentionalDisconnect) {
          console.log('[WebSocket] Attempting auto-reconnect in 3s...');
          setTimeout(() => this.connect(), 3000);
        }
      };
    });
  }

  public send(message: WSMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send message, socket is not OPEN.');
    }
  }

  public subscribe(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(msg: WSMessage): void {
    this.listeners.forEach((listener) => listener(msg));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      this.send({ action: 'PING' });
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public disconnect(): void {
    this.isIntentionalDisconnect = true;
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.listeners.clear();
  }
}
