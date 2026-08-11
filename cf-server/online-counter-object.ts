// 全站在线人数统计 Durable Object
//
// 设计：
//   - 使用 Hibernation API，WebSocket 连接数 = 在线人数
//   - 连接建立时立即推送当前在线人数
//   - 连接关闭/出错时广播更新后的人数给所有活跃连接
//   - 无需鉴权（公共统计端点）

import { DurableObject } from 'cloudflare:workers';

export class OnlineCounterObject extends DurableObject {
  protected state: DurableObjectState;
  protected env: Env;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.env = env;
  }

  // ── WebSocket 升级 ──
  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Hibernation API：接受连接
    this.state.acceptWebSocket(server);

    // 立即向新连接推送当前在线人数
    this.sendCount(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Hibernation API: WebSocket 关闭 ──
  async webSocketClose(): Promise<void> {
    this.broadcastCount();
  }

  // ── Hibernation API: WebSocket 错误 ──
  async webSocketError(): Promise<void> {
    this.broadcastCount();
  }

  // ── 向单个连接发送当前在线人数 ──
  private sendCount(ws: WebSocket): void {
    const count = this.state.getWebSockets().length;
    try {
      ws.send(JSON.stringify({ type: 'online_count', count }));
    } catch { /* ignore */ }
  }

  // ── 向所有活跃连接广播当前在线人数 ──
  private broadcastCount(): void {
    const sockets = this.state.getWebSockets();
    const count = sockets.length;
    const msg = JSON.stringify({ type: 'online_count', count });
    for (const ws of sockets) {
      try { ws.send(msg); } catch { /* ignore */ }
    }
  }
}
