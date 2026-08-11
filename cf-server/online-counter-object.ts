// OnlineCounter Durable Object：全站在线人数统计（纯内存 Map，DO 全局单例）
//
// 设计：
//   - 单例 DO：idFromName('global')，所有 /ws/online 请求都路由到同一个实例
//   - 内存 Map<clientId, lastSeenMs> 记录在线客户端（按 clientId 去重）
//   - Set<WebSocket> 维护所有活跃 WS 连接用于广播
//   - 客户端每 ~30 秒发心跳（任意消息）刷新 lastSeen
//   - 每 10 秒清理超过 60 秒未心跳的客户端并广播人数
//   - Hibernation API 使用 tags 存储 clientId，webSocketMessage 时精确定位
//   - 不需要持久化（纯内存即可，重启后重建也只是瞬时不精确）

import { DurableObject } from 'cloudflare:workers';

const ONLINE_HEARTBEAT_TIMEOUT = 60_000; // 60 秒
const ONLINE_BROADCAST_INTERVAL = 10_000; // 10 秒

export class OnlineCounterObject extends DurableObject {
  protected state: DurableObjectState;
  protected env: Env;

  private onlineClients: Map<string, number> = new Map();
  private onlineSockets: Set<WebSocket> = new Set();
  private broadcastTimer: number | null = null;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.env = env;

    // 启动时确保定时器（DO 冬眠唤醒后也会重新启动）
    this._ensureBroadcastTimer();
  }

  private _ensureBroadcastTimer(): void {
    if (this.broadcastTimer !== null) return;
    this.broadcastTimer = setInterval(() => {
      this._broadcastCount();
    }, ONLINE_BROADCAST_INTERVAL) as unknown as number;
  }

  /** 清理超时 + 返回当前在线人数 */
  private _countOnline(): number {
    const now = Date.now();
    for (const [id, ts] of this.onlineClients) {
      if (now - ts > ONLINE_HEARTBEAT_TIMEOUT) {
        this.onlineClients.delete(id);
      }
    }
    return this.onlineClients.size;
  }

  /** 广播在线人数到所有 WS 订阅者 */
  private _broadcastCount(): void {
    const count = this._countOnline();
    if (this.onlineSockets.size === 0) return;
    const msg = JSON.stringify({ type: 'online_count', count });
    for (const ws of this.onlineSockets) {
      try { ws.send(msg); } catch { /* ignore send errors */ }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    const url = new URL(request.url);

    // CORS 头
    const CORS_HEADERS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // HTTP 查询：返回当前在线人数（用于非 WS 请求或健康检查）
    if (upgrade !== 'websocket') {
      const count = this._countOnline();
      return new Response(
        JSON.stringify({ status: 'ok', count }),
        { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS } },
      );
    }

    // WebSocket 升级
    const clientId = (url.searchParams.get('client_id') || '').trim();
    if (!clientId || clientId.length > 128) {
      return new Response(
        JSON.stringify({ status: 'error', message: '缺少 client_id 参数', error_code: 'INVALID_CLIENT_ID' }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS } },
      );
    }

    try {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as unknown as [WebSocket, WebSocket];

      // 使用 Hibernation API 注册，tags=[clientId] 便于后续 message 回调定位
      try {
        this.state.acceptWebSocket(server, [clientId]);
      } catch {
        // 回退：非 Hibernation 环境手动 accept + 监听
        server.accept();
        this._attachSocketListeners(server, clientId);
      }

      // 注册在线
      this.onlineClients.set(clientId, Date.now());
      this.onlineSockets.add(server);

      // 确保定时器运行
      this._ensureBroadcastTimer();

      // 立即推送当前人数
      const initialCount = this._countOnline();
      try {
        server.send(JSON.stringify({ type: 'online_count', count: initialCount }));
      } catch { /* ignore */ }

      return new Response(null, { status: 101, webSocket: client });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[OnlineCounterDO] WebSocket error:', message, err);
      return new Response(
        JSON.stringify({ status: 'error', message }),
        { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS } },
      );
    }
  }

  /** 非 Hibernation 环境下手动绑定事件监听 */
  private _attachSocketListeners(server: WebSocket, clientId: string): void {
    server.addEventListener('message', () => {
      this.onlineClients.set(clientId, Date.now());
    });
    server.addEventListener('close', () => {
      this.onlineSockets.delete(server);
      this._broadcastCount();
    });
    server.addEventListener('error', () => {
      this.onlineSockets.delete(server);
    });
  }

  // ── Hibernation API 回调 ──
  webSocketMessage(ws: WebSocket, _message: string | ArrayBuffer): void {
    // 从 tags 获取 clientId 并刷新时间戳
    try {
      const tags = this.state.getTags(ws);
      const clientId = tags?.[0];
      if (clientId) {
        this.onlineClients.set(clientId, Date.now());
      }
    } catch {
      // getTags 不可用时忽略（已由 Map 自然超时兜底）
    }
  }

  webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    this.onlineSockets.delete(ws);
    try {
      const tags = this.state.getTags(ws);
      const clientId = tags?.[0];
      if (clientId) {
        // 不立即删除 onlineClients 条目，留 60 秒超时自然清理
        // （用户可能只是刷新页面，短暂断开）
      }
    } catch { /* ignore */ }
    this._broadcastCount();
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    this.onlineSockets.delete(ws);
  }
}
