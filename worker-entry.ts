// Cloudflare Pages Custom Worker Entry (dist/_worker.js 的源文件)
//
// 由 esbuild 编译到 dist/_worker.js（Pages `pages_build_output_dir` 根目录）。
// wrangler pages dev 检测到 dist/_worker.js 存在时，直接用它作为
// Worker 入口（完全替代 functions/ 路由），因此它的**具名导出**
// (MatchmakerObject, RoomObject) 就是 Worker 入口级的具名导出，
// 解决了 wrangler 报 "Durable Objects are not exported in entrypoint" 的核心报错。
//
// 路由（全部由本文件管理）：
//   /api/*       → Hono REST App (import default from functions/api/[[route]])
//   /ws/*        → WebSocket 升级 / Durable Object 状态查询
//   其他         → env.ASSETS.fetch(request) 静态资源 (Vite 构建产物)

import type { DurableObjectNamespace } from '@cloudflare/workers-types';

// Durable Object 类 **import + re-export**：这两行是 wrangler 能否找到
// DO 类的关键。生成的 dist/_worker.js 顶部必须出现
//   `export { MatchmakerObject, RoomObject }`
import { MatchmakerObject } from './cf-server/matchmaker-object';
import { RoomObject } from './cf-server/room-object';
export { MatchmakerObject, RoomObject };

// Hono 应用 (functions/api/[[route]].ts 中 `export default app;`)
import apiApp from './functions/api/[[route]]';

// ────────────────────────────────────────────────────────────────────
// Bindings
// ────────────────────────────────────────────────────────────────────
type Bindings = {
  DB: D1Database;
  KV: KVNamespace;
  ROOM: DurableObjectNamespace<RoomObject>;
  MATCHMAKER: DurableObjectNamespace<MatchmakerObject>;
  SECRET_KEY: string;
  ADMIN_USER: string;
  ADMIN_PASSWORD: string;
  SESSION_TTL: string;
  CAPTCHA_TTL: string;
  // Pages 内置：serve dist 构建产物
  ASSETS: { fetch: (request: Request) => Promise<Response> };
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, Authorization, X-Player-Id, X-Player-Token',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// ────────────────────────────────────────────────────────────────────
// 全站在线人数统计（纯 Worker 内存实现，无需 DO）
//
// 设计：
//   - 模块级 Map<clientId, lastSeen> 记录在线用户（按 clientId 去重）
//   - 模块级 Set<WebSocket> 维护所有活跃 WS 连接
//   - 客户端每 30 秒发心跳刷新时间戳
//   - 每 10 秒清理超过 60 秒未心跳的客户端，广播最新人数
//   - 注意：Worker 无状态，多个 isolate 间计数不共享，
//     但对在线人数的近似值已足够实用（类似其他统计工具）
// ────────────────────────────────────────────────────────────────────
const onlineClients = new Map<string, number>();
const onlineSockets = new Set<WebSocket>();
let onlineTimer: number | null = null;

const ONLINE_HEARTBEAT_TIMEOUT = 60_000; // 60 秒
const ONLINE_BROADCAST_INTERVAL = 10_000; // 10 秒

function onlineCleanupStale() {
  const now = Date.now();
  for (const [id, ts] of onlineClients) {
    if (now - ts > ONLINE_HEARTBEAT_TIMEOUT) {
      onlineClients.delete(id);
    }
  }
}

function onlineBroadcast() {
  onlineCleanupStale();
  if (onlineSockets.size === 0) return;
  const msg = JSON.stringify({ type: 'online_count', count: onlineClients.size });
  for (const ws of onlineSockets) {
    try { ws.send(msg); } catch { /* ignore */ }
  }
}

function onlineEnsureTimer() {
  if (onlineTimer !== null) return;
  onlineTimer = setInterval(onlineBroadcast, ONLINE_BROADCAST_INTERVAL) as unknown as number;
}

function handleOnlineWebSocket(request: Request): Response {
  const upgrade = request.headers.get('Upgrade');
  const url = new URL(request.url);

  // HTTP 查询：返回当前在线人数（用于非 WS 请求或健康检查）
  if (upgrade !== 'websocket') {
    onlineCleanupStale();
    return new Response(
      JSON.stringify({ status: 'ok', count: onlineClients.size }),
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS } },
    );
  }

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

    server.accept();

    // 注册在线
    onlineClients.set(clientId, Date.now());
    onlineSockets.add(server);

    // 立即推送当前人数
    onlineCleanupStale();
    try {
      server.send(JSON.stringify({ type: 'online_count', count: onlineClients.size }));
    } catch { /* ignore */ }

    // 心跳 → 刷新时间戳
    server.addEventListener('message', () => {
      onlineClients.set(clientId, Date.now());
    });

    // 关闭 → 清理 socket + 广播
    server.addEventListener('close', () => {
      onlineSockets.delete(server);
      // 不立即删除 onlineClients 条目，留 60 秒超时自然清理
      // （用户可能只是刷新页面，短暂断开）
      onlineBroadcast();
    });

    server.addEventListener('error', () => {
      onlineSockets.delete(server);
    });

    onlineEnsureTimer();

    return new Response(null, { status: 101, webSocket: client });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[online] WebSocket error:', message, err);
    return new Response(
      JSON.stringify({ status: 'error', message }),
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS } },
    );
  }
}

// ────────────────────────────────────────────────────────────────────
// Worker Fetch Handler
// ────────────────────────────────────────────────────────────────────
export default {
  async fetch(
    request: Request,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // /api/* → Hono
      if (pathname.startsWith('/api') && (pathname === '/api' || pathname.startsWith('/api/'))) {
        return apiApp.fetch(request, env, ctx);
      }

      // /ws/* → WebSocket 升级 / Durable Object 状态查询
      if (pathname.startsWith('/ws')) {
        return handleWs(request, env, url);
      }

      // 其他 → 静态资源 (Vite 构建的 dist/ 文件)
      return env.ASSETS.fetch(request);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Worker] uncaught:', message, err);
      return new Response(
        JSON.stringify({ status: 'error', message }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
        },
      );
    }
  },
};

// ────────────────────────────────────────────────────────────────────
// /ws/* 处理
// ────────────────────────────────────────────────────────────────────
function handleWs(request: Request, env: Bindings, url: URL): Response | Promise<Response> {
  const pathname = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (pathname === '/ws/health') {
    return new Response(JSON.stringify({ status: 'ok', server: 'pages-custom-worker' }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // /ws/online: 全站在线人数统计（纯 Worker 内存实现，无需 DO）
  if (pathname === '/ws/online') {
    return handleOnlineWebSocket(request);
  }

  const isUpgrade = request.headers.get('Upgrade') === 'websocket';
  // 玩家鉴权优先 URL query；query 缺失时尝试从 Sec-WebSocket-Protocol 解析
  //   格式：x-pid.<base64url(playerId)> 和 x-tok.<base64url(token)> 两个子协议
  //   解析成功后：从 header 中剥离自定义子协议 forward，避免 DO 未回子协议导致浏览器 1002 关闭
  let playerId = url.searchParams.get('playerId') || '';
  let token = url.searchParams.get('token') || '';
  let strippedRequest = request;
  if (!playerId || !token) {
    const protoHeader = request.headers.get('Sec-WebSocket-Protocol') || '';
    const protos = protoHeader.split(',').map(s => s.trim()).filter(Boolean);
    let decodedPid = '';
    let decodedTok = '';
    const keepProtos: string[] = [];
    for (const p of protos) {
      if (p.startsWith('x-pid.')) {
        try { decodedPid = atob(p.slice('x-pid.'.length)); } catch { decodedPid = ''; }
      } else if (p.startsWith('x-tok.')) {
        try { decodedTok = atob(p.slice('x-tok.'.length)); } catch { decodedTok = ''; }
      } else {
        keepProtos.push(p);
      }
    }
    if (!playerId && decodedPid) playerId = decodedPid;
    if (!token && decodedTok) token = decodedTok;
    // 剥离自定义子协议（forward 时 DO 不再处理，避免浏览器因子协议不匹配关闭）
    const headers = new Headers(request.headers);
    if (keepProtos.length) headers.set('Sec-WebSocket-Protocol', keepProtos.join(', '));
    else headers.delete('Sec-WebSocket-Protocol');
    strippedRequest = new Request(request, { headers });
    // 把解析出的参数塞回 url.searchParams，后续 routeWs 以及 DO fetch 用 URL query 的能直接读到
    if (playerId) url.searchParams.set('playerId', playerId);
    if (token) url.searchParams.set('token', token);
  }

  if (isUpgrade) {
    if (!playerId || !token) {
      return new Response(
        JSON.stringify({ status: 'error', message: '缺少 playerId 或 token 参数', error_code: 'AUTH_REQUIRED' }),
        { status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS } },
      );
    }
    return routeWs(strippedRequest, env, url);
  }

  return routeHttp(request, env, url);
}

// WebSocket 升级路由（直接转发原始 request，保留 Upgrade: websocket 头）
function routeWs(request: Request, env: Bindings, url: URL): Response | Promise<Response> {
  const pathname = url.pathname;

  if (pathname === '/ws' || pathname === '/ws/' || pathname === '/ws/matchmaker' || pathname === '/ws/pool') {
    const id = env.MATCHMAKER.idFromName('default');
    return env.MATCHMAKER.get(id).fetch(request);
  }

  let roomCode = url.searchParams.get('roomCode') || '';
  const prefix = '/ws/room/';
  if (!roomCode && pathname.startsWith(prefix)) {
    roomCode = pathname.slice(prefix.length);
  }
  if (!roomCode) {
    return new Response(
      JSON.stringify({ error: '缺少 roomCode 参数或路径格式错误 (/ws/room/{code})' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }

  return env.ROOM.get(env.ROOM.idFromName(roomCode)).fetch(request);
}

// HTTP 状态查询
function routeHttp(request: Request, env: Bindings, url: URL): Response | Promise<Response> {
  const pathname = url.pathname;

  if (pathname === '/ws' || pathname === '/ws/' || pathname === '/ws/matchmaker' || pathname === '/ws/pool') {
    return env.MATCHMAKER.get(env.MATCHMAKER.idFromName('default')).fetch(request);
  }

  let roomCode = url.searchParams.get('roomCode') || '';
  const prefix = '/ws/room/';
  if (!roomCode && pathname.startsWith(prefix)) {
    roomCode = pathname.slice(prefix.length);
  }
  if (!roomCode) {
    return new Response(
      JSON.stringify({ error: '缺少 roomCode 参数' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }

  return env.ROOM.get(env.ROOM.idFromName(roomCode)).fetch(request);
}
