// 全站在线人数 WebSocket 实时统计
//
// 流程：
//   1. 计算 clientId（已登录用 playerId，匿名用 localStorage 的 guest ID）
//   2. 连接 /ws/online?client_id=<id>（通过 Durable Object）
//   3. 服务端将 clientId 写入 KV（TTL=60s）并按唯一 ID 去重统计
//   4. 服务端每 10 秒广播最新在线人数
//   5. 客户端每 30 秒发送一次心跳消息，刷新 KV TTL
//
// 特点：
//   - 模块级单例 WebSocket（全应用共享一条连接）
//   - 引用计数管理生命周期
//   - 指数退避自动重连
//   - 页面不可见时不重连，恢复可见时立即重连

import { ref, onMounted, onBeforeUnmount } from "vue";
import { useAuthStore } from "@/stores/auth";

const onlineCount = ref(0);
const onlineConnected = ref(false);

const GUEST_ID_KEY = "phrolova_guest_id";
const CLIENT_HEARTBEAT_INTERVAL = 30 * 1000; // 30 秒：客户端心跳

let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let clientHeartbeatTimer: number | null = null;
let reconnectAttempts = 0;
let refCount = 0;
let visibilityHandler: (() => void) | null = null;

function getClientId(): string {
  const authStore = useAuthStore();
  if (authStore.playerId) return authStore.playerId;
  // 匿名访客
  let guestId = "";
  try { guestId = localStorage.getItem(GUEST_ID_KEY) ?? ""; } catch { /* ignore */ }
  if (!guestId) {
    guestId = "guest_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { localStorage.setItem(GUEST_ID_KEY, guestId); } catch { /* ignore */ }
  }
  return guestId;
}

function buildUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const clientId = encodeURIComponent(getClientId());
  return `${proto}//${location.host}/ws/online?client_id=${clientId}`;
}

function startClientHeartbeat() {
  stopClientHeartbeat();
  clientHeartbeatTimer = window.setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN && document.visibilityState === "visible") {
      try { ws.send(JSON.stringify({ type: "heartbeat" })); } catch { /* ignore */ }
    }
  }, CLIENT_HEARTBEAT_INTERVAL);
}

function stopClientHeartbeat() {
  if (clientHeartbeatTimer !== null) {
    clearInterval(clientHeartbeatTimer);
    clientHeartbeatTimer = null;
  }
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(buildUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    onlineConnected.value = true;
    reconnectAttempts = 0;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    startClientHeartbeat();
  };

  ws.onmessage = (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "online_count" && typeof msg.count === "number") {
        onlineCount.value = msg.count;
      }
    } catch {
      /* ignore */
    }
  };

  ws.onclose = () => {
    onlineConnected.value = false;
    stopClientHeartbeat();
    ws = null;
    if (refCount > 0) {
      scheduleReconnect();
    }
  };

  ws.onerror = () => {
    // 不在此重连，等 onclose 触发
  };
}

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  if (document.visibilityState !== "visible") return;

  const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
  reconnectAttempts++;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    if (refCount > 0) connect();
  }, delay);
}

function onVisibilityChange() {
  if (document.visibilityState === "visible" && refCount > 0 && (!ws || ws.readyState === WebSocket.CLOSED)) {
    reconnectAttempts = 0;
    connect();
  }
}

export function useOnlineCount() {
  onMounted(() => {
    refCount++;
    if (refCount === 1) {
      visibilityHandler = onVisibilityChange;
      document.addEventListener("visibilitychange", visibilityHandler);
      connect();
    }
  });

  onBeforeUnmount(() => {
    refCount--;
    if (refCount <= 0) {
      refCount = 0;
      stopClientHeartbeat();
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
        visibilityHandler = null;
      }
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }
      onlineConnected.value = false;
    }
  });

  return { onlineCount, onlineConnected };
}
