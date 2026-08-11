// 全站在线人数统计 Durable Object
//
// 纯内存方案（无 KV 依赖）：
//   - 前端连接 /ws/online?client_id=<id>（已登录用 playerId，匿名用 guestId）
//   - DO 用内存 Map<clientId, lastSeenMs> 记录心跳
//   - 周期性（每 10 秒）清理超过 60 秒未心跳的 client，广播当前在线人数
//   - 连接建立时立即推送最新值
//   - 关闭标签页后 60 秒内未再心跳即视为离线，人数自动减少
//
// 这样做的好处：
//   - 多 tab 同一用户只算 1 人（按 clientId 去重）
//   - 实时性由 WebSocket 广播（10秒粒度），不用 HTTP 轮询
//   - 纯内存零外部依赖，无 KV 往返延迟
//   - DO 为全局单例（idFromName('global')），内存状态即可

import { DurableObject } from 'cloudflare:workers';

const ONLINE_TTL_MS = 60 * 1000;   // 心跳过期
const BROADCAST_INTERVAL = 10;     // 秒：广播周期

export class OnlineCounterObject extends DurableObject {
  protected state: DurableObjectState;
  protected env: Env;
  private sockets: Set<WebSocket> = new Set();
  private onlineMap: Map<string, number> = new Map(); // clientId -> lastSeenMs
  private broadcastTimer: number | null = null;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.env = env;
  }

  // ── 入口：处理 WebSocket 连接 ──
  async fetch(request: Request): Promise<Response> {
    const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
    try {
      const upgrade = request.headers.get('Upgrade');
      const url = new URL(request.url);

      // 非 WS 升级请求 → 返回简单状态
      if (upgrade !== 'websocket') {
        const count = await this._countOnline();
        return new Response(
          JSON.stringify({ status: 'ok', count }),
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

      // 创建 WebSocket 对
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as unknown as [WebSocket, WebSocket];

      // 标准 WebSocket 事件监听
      server.accept();

      // 记录在线
      await this._touchOnline(clientId);

      // 加入连接集合
      this.sockets.add(server);

      // 立即推送当前人数
      const initialCount = await this._countOnline();
      try { server.send(JSON.stringify({ type: 'online_count', count: initialCount })); } catch { /* ignore */ }

      // 消息：客户端发来的心跳包（可选）也刷新 KV
      const onMessage = async (_evt: MessageEvent) => {
        // 忽略消息内容，视为在线心跳
        await this._touchOnline(clientId);
      };
      server.addEventListener('message', onMessage);

      const onClose = async () => {
        server.removeEventListener('message', onMessage);
        server.removeEventListener('close', onClose);
        server.removeEventListener('error', onError);
        this.sockets.delete(server);
        // 连接关闭时立即广播一次（可能 tab 关了，60 秒心跳超时后才清，
        // 但广播一下给用户即时感知人数变化（即使略有延迟也 OK）
        try {
          const c = await this._countOnline();
          this._broadcast(c);
        } catch { /* ignore */ }
      };
      server.addEventListener('close', onClose);

      const onError = () => { /* close 后会清理 */ };
      server.addEventListener('error', onError);

      // 确保定时器启动
      this._ensureBroadcastTimer();

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[OnlineCounterDO.fetch] error:', message, err);
      return new Response(
        JSON.stringify({ status: 'error', message }),
        { status: 500, headers: JSON_HEADERS },
      );
    }
  }

  // ── 内存: 写入在线心跳 ──
  private async _touchOnline(clientId: string): Promise<void> {
    this.onlineMap.set(clientId, Date.now());
  }

  // ── 内存: 统计活跃唯一用户数（顺带清理过期） ──
  private async _countOnline(): Promise<number> {
    const now = Date.now();
    for (const [id, lastSeen] of this.onlineMap) {
      if (now - lastSeen > ONLINE_TTL_MS) {
        this.onlineMap.delete(id);
      }
    }
    return this.onlineMap.size;
  }

  // ── 广播给所有活跃连接 ──
  private _broadcast(count: number): void {
    if (this.sockets.size === 0) return;
    const msg = JSON.stringify({ type: 'online_count', count });
    for (const ws of this.sockets) {
      try { ws.send(msg); } catch { /* ignore */ }
    }
  }

  // ── 周期性广播在线人数 ──
  private _ensureBroadcastTimer(): void {
    if (this.broadcastTimer !== null) return;
    this.broadcastTimer = setInterval(async () => {
      try {
        if (this.sockets.size === 0) return;
        const c = await this._countOnline();
        this._broadcast(c);
      } catch { /* ignore */ }
    }, BROADCAST_INTERVAL * 1000) as unknown as number;
  }
}
