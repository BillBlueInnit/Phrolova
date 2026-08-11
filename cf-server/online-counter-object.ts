// 全站在线人数统计 Durable Object
//
// 设计：
//   - 前端连接 /ws/online?client_id=<id>（已登录用 playerId，匿名用 guestId）
//   - DO 内存 Map<clientId, lastHeartbeat> 记录在线用户（按 clientId 去重）
//   - DO 内存 Set<WebSocket> 维护所有活跃连接
//   - 客户端每 30 秒发心跳刷新时间戳
//   - DO 每 10 秒清理超过 60 秒未心跳的客户端，广播最新人数
//   - 无需 KV / D1 依赖，纯内存运行

import { DurableObject } from 'cloudflare:workers';

const HEARTBEAT_TIMEOUT = 60 * 1000;   // 60 秒无心跳视为离线
const BROADCAST_INTERVAL = 10 * 1000;   // 10 秒广播周期

export class OnlineCounterObject extends DurableObject {
  protected state: DurableObjectState;
  protected env: Env;

  private onlineClients: Map<string, number> = new Map();
  private sockets: Set<WebSocket> = new Set();
  private broadcastTimer: number | null = null;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
      const upgrade = request.headers.get('Upgrade');
      const url = new URL(request.url);

      if (upgrade !== 'websocket') {
        this._cleanupStale();
        return new Response(
          JSON.stringify({ status: 'ok', count: this.onlineClients.size }),
          { status: 200, headers: JSON_HEADERS },
        );
      }

      const clientId = (url.searchParams.get('client_id') || '').trim();
      if (!clientId || clientId.length > 128) {
        return new Response(
          JSON.stringify({ status: 'error', message: '缺少 client_id 参数', error_code: 'INVALID_CLIENT_ID' }),
          { status: 400, headers: JSON_HEADERS },
        );
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as unknown as [WebSocket, WebSocket];

      server.accept();

      // 注册在线用户
      this.onlineClients.set(clientId, Date.now());

      // 维护 socket 引用
      this.sockets.add(server);

      // 立即推送当前人数
      this._sendTo(server);

      // 心跳 → 刷新时间戳
      server.addEventListener('message', () => {
        this.onlineClients.set(clientId, Date.now());
      });

      // 关闭 → 移除 socket + 广播
      server.addEventListener('close', () => {
        this.sockets.delete(server);
        this._broadcast();
      });

      server.addEventListener('error', () => {
        this.sockets.delete(server);
      });

      this._ensureTimer();

      return new Response(null, { status: 101, webSocket: client });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[OnlineCounterDO.fetch] error:', message, err);
      return new Response(
        JSON.stringify({ status: 'error', message }),
        { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
      );
    }
  }

  private _sendTo(ws: WebSocket): void {
    this._cleanupStale();
    try {
      ws.send(JSON.stringify({ type: 'online_count', count: this.onlineClients.size }));
    } catch { /* ignore */ }
  }

  private _broadcast(): void {
    this._cleanupStale();
    if (this.sockets.size === 0) return;
    const msg = JSON.stringify({ type: 'online_count', count: this.onlineClients.size });
    for (const ws of this.sockets) {
      try { ws.send(msg); } catch { /* ignore */ }
    }
  }

  private _cleanupStale(): void {
    const now = Date.now();
    for (const [id, ts] of this.onlineClients) {
      if (now - ts > HEARTBEAT_TIMEOUT) {
        this.onlineClients.delete(id);
      }
    }
  }

  private _ensureTimer(): void {
    if (this.broadcastTimer !== null) return;
    this.broadcastTimer = setInterval(() => {
      this._cleanupStale();
      this._broadcast();
    }, BROADCAST_INTERVAL) as unknown as number;
  }
}
