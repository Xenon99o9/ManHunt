import { WSMessage } from '../types/game';

type MessageListener = (msg: WSMessage) => void;
type OpenListener = () => void;

export class GameWebSocket {
  private socket: WebSocket | null = null;
  private listeners: Set<MessageListener> = new Set();
  private openListeners: Set<OpenListener> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isIntentionalDisconnect = false;
  private hasConnectedOnce = false;

  constructor(
    private baseUrl: string,
    private roomCode: string,
    private playerId: string,
    private role: string
  ) {}

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isIntentionalDisconnect = false;
      this.clearReconnectTimer();

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

      let settled = false;
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[WebSocket] Connection established.');
        this.startHeartbeat();
        const isReconnect = this.hasConnectedOnce;
        this.hasConnectedOnce = true;
        if (isReconnect) {
          this.openListeners.forEach((cb) => cb());
        }
        if (!settled) {
          settled = true;
          resolve();
        }
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
        console.warn('[WebSocket] Error:', error);
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      this.socket.onclose = (event) => {
        console.log(`[WebSocket] Connection closed: code=${event.code}, reason=${event.reason}`);
        this.stopHeartbeat();
        // Ne pas tenter de reconnecter si la room n'existe pas (1008) ou déconnexion volontaire
        if (!this.isIntentionalDisconnect && event.code !== 1008) {
          this.scheduleReconnect();
        }
      };
    });
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (this.isIntentionalDisconnect) return;
      console.log('[WebSocket] Attempting auto-reconnect...');
      this.connect().catch(() => {
        if (!this.isIntentionalDisconnect) {
          this.scheduleReconnect();
        }
      });
    }, 3000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public send(message: WSMessage): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  public subscribe(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public onReconnect(listener: OpenListener): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
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

  public disconnect(sendLeaveAction = false): void {
    this.isIntentionalDisconnect = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    if (this.socket) {
      if (sendLeaveAction && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ action: 'LEAVE_ROOM' }));
        } catch {}
      }
      this.socket.close();
      this.socket = null;
    }
    this.listeners.clear();
    this.openListeners.clear();
  }
}
