// 全站在线人数 WebSocket 实时统计
//
// 设计：
//   - 模块级单例 WebSocket（全应用共享一条 /ws/online 连接）
//   - 引用计数管理生命周期（所有调用者卸载后断开）
//   - 自动重连（指数退避，最多 30 秒）
//   - 页面不可见时不重连，恢复可见时立即重连
//   - onlineCount / onlineConnected 为 reactive ref，组件直接使用

import { ref, onMounted, onBeforeUnmount } from "vue";

const onlineCount = ref(0);
const onlineConnected = ref(false);

let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let refCount = 0;
let visibilityHandler: (() => void) | null = null;

function buildUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/online`;
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
  // 页面不可见时不重连（等可见时触发）
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
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (visibilityHandler) {
        document.removeEventListener("visibilitychange", visibilityHandler);
        visibilityHandler = null;
      }
      if (ws) {
        ws.onclose = null; // 防止触发重连
        ws.close();
        ws = null;
      }
      onlineConnected.value = false;
    }
  });

  return { onlineCount, onlineConnected };
}
