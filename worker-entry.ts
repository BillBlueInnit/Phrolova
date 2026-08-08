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
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

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

      // /ws/* → Durable Object 路由 (WebSocket 升级 或 HTTP 查询)
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

  const isUpgrade = request.headers.get('Upgrade') === 'websocket';
  const playerId = url.searchParams.get('playerId') || '';
  const token = url.searchParams.get('token') || '';

  if (isUpgrade) {
    if (!playerId || !token) {
      return new Response(
        JSON.stringify({ error: '缺少 playerId 或 token 参数' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }
    return routeWs(request, env, url);
  }

  return routeHttp(request, env, url);
}

// WebSocket 升级路由（直接转发原始 request，保留 Upgrade: websocket 头）
function routeWs(request: Request, env: Bindings, url: URL): Response | Promise<Response> {
  const pathname = url.pathname;

  if (pathname === '/ws' || pathname === '/ws/' || pathname === '/ws/matchmaker') {
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

  if (pathname === '/ws' || pathname === '/ws/' || pathname === '/ws/matchmaker') {
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
