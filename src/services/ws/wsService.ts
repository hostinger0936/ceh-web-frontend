type WsMessage = {
  type?: string;
  event?: string;
  name?: string;
  deviceId?: string;
  timestamp?: number;
  data?: any;
  payload?: any;
  [key: string]: any;
};

type MessageHandler = (msg: WsMessage) => void;
type StatusHandler = (connected: boolean) => void;

class WsService {
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectTimer: number | null = null;
  private manuallyClosed = false;
  private pingTimer: number | null = null;
  private connectAttemptId = 0;

  private messageHandlers = new Set<MessageHandler>();
  private statusHandlers = new Set<StatusHandler>();

  private readonly reconnectDelayMs = 2500;
  private readonly pingIntervalMs = 15000;

  private getBaseWsUrl(): string {
    const envUrl = String(import.meta.env.VITE_WS_URL || "").trim();
    if (envUrl) return envUrl.replace(/\/+$/, "");

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/ws`;
  }

  private getAdminSocketUrl(): string {
    return `${this.getBaseWsUrl()}/admin`;
  }

  private emitStatus(connected: boolean) {
    this.connected = connected;

    try {
      window.dispatchEvent(
        new CustomEvent("zerotrace:ws", {
          detail: { connected },
        }),
      );
    } catch {
      // ignore
    }

    this.statusHandlers.forEach((handler) => {
      try {
        handler(connected);
      } catch {
        // ignore
      }
    });
  }

  private emitMessage(msg: WsMessage) {
    this.messageHandlers.forEach((handler) => {
      try {
        handler(msg);
      } catch {
        // ignore
      }
    });
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearPingTimer() {
    if (this.pingTimer != null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private startPing() {
    this.clearPingTimer();

    this.pingTimer = window.setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      try {
        this.ws.send(
          JSON.stringify({
            type: "ping",
            timestamp: Date.now(),
          }),
        );
      } catch {
        // ignore
      }
    }, this.pingIntervalMs);
  }

  private scheduleReconnect() {
    if (this.manuallyClosed) return;
    if (this.reconnectTimer != null) return;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.manuallyClosed = false;
    this.clearReconnectTimer();

    const attemptId = ++this.connectAttemptId;

    try {
      const ws = new WebSocket(this.getAdminSocketUrl());
      this.ws = ws;

      ws.onopen = () => {
        if (attemptId !== this.connectAttemptId) return;
        this.emitStatus(true);
        this.startPing();
      };

      ws.onmessage = (ev) => {
        if (attemptId !== this.connectAttemptId) return;

        try {
          const msg = JSON.parse(String(ev.data || "{}")) as WsMessage;
          this.emitMessage(msg);
        } catch {
          // ignore invalid JSON
        }
      };

      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null;
        }
        this.clearPingTimer();
        this.emitStatus(false);
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        this.emitStatus(false);
      };
    } catch {
      this.clearPingTimer();
      this.emitStatus(false);
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.manuallyClosed = true;
    this.clearReconnectTimer();
    this.clearPingTimer();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    this.emitStatus(false);
  }

  isConnected() {
    return this.connected;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  onStatusChange(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  onEvent(eventName: string, handler: MessageHandler) {
    const wrapped: MessageHandler = (msg) => {
      if (msg?.type === "event" && msg?.event === eventName) {
        handler(msg);
      }
    };

    this.messageHandlers.add(wrapped);
    return () => {
      this.messageHandlers.delete(wrapped);
    };
  }

  sendRaw(payload: Record<string, any>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;

    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  sendCmd(name: string, payload: Record<string, any> = {}) {
    return this.sendRaw({
      type: "cmd",
      name,
      payload,
      timestamp: Date.now(),
    });
  }
}

const wsService = new WsService();
export default wsService;
