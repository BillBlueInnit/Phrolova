import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";

import type { Difficulty, MultiplayerRoomState, QuizType } from "@/types/game";
import { C2S, S2C } from "@/api";
import { generateRoomCode } from "@/multiplayer/protocol";
import { useAuthStore } from "./auth";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

// ── WebSocket 客户端封装 ──
class GameWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private playerId: string;
  private token: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50;
  private reconnectDelay = 1000;
  private intentionalClose = false;

  onMessage: ((data: { type: string; payload: Record<string, unknown> }) => void) | null = null;
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;
  onError: ((error: Event) => void) | null = null;

  constructor(baseUrl: string, playerId: string, token: string) {
    this.url = baseUrl;
    this.playerId = playerId;
    this.token = token;
  }

  connect(path: string = ""): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.intentionalClose = false;
      const fullUrl = this.buildUrl(path);
      let didOpen = false;
      let settled = false;

      // 连接超时保护：10 秒未建立连接则中止
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.intentionalClose = true;
          try { this.ws?.close(); } catch { /* ignore */ }
          reject(new Error("连接超时，请重试"));
        }
      }, 10000);

      try {
        this.ws = new WebSocket(fullUrl);
      } catch (e) {
        clearTimeout(timeoutId);
        reject(e);
        return;
      }

      this.ws.onopen = () => {
        if (settled) return;
        clearTimeout(timeoutId);
        didOpen = true;
        this.reconnectAttempts = 0;
        this.onOpen?.();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data?.type) {
            this.onMessage?.(data);
          }
        } catch {
          // 忽略非 JSON 消息
        }
      };

      this.ws.onerror = (event) => {
        // 错误发生，通知上层但不立即 reject
        // 等 onclose 后再判断连接状态
        this.onError?.(event);
      };

      this.ws.onclose = () => {
        clearTimeout(timeoutId);
        this.onClose?.();

        // 如果连接从未成功打开，报告连接错误
        if (!didOpen) {
          if (!settled) {
            settled = true;
            reject(new Error("WebSocket 连接失败，请检查网络或服务状态"));
          }
          return;
        }

        // 连接曾成功打开，处理重连逻辑
        if (!this.intentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
          setTimeout(() => {
            // 静默重连：重连的 Promise 独立处理
            this.connect(path).catch(() => {
              // 重连失败，由上层状态管理处理
            });
          }, delay);
        }
      };
    });
  }

  private buildUrl(path: string): string {
    const params = new URLSearchParams({
      playerId: this.playerId,
      token: this.token,
    });
    return `${this.url}${path}?${params.toString()}`;
  }

  send(type: string, payload: unknown = {}): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  updateCredentials(playerId: string, token: string): void {
    this.playerId = playerId;
    this.token = token;
  }
}

// ── 主 Store ──
export const useMultiGameStore = defineStore("multiGame", () => {
  let gameWs: GameWebSocket | null = null;
  const connectionState = shallowRef<ConnectionState>("idle");
  const error = shallowRef("");
  const infoMessage = shallowRef("");
  const inQueue = shallowRef(false);
  const roomState = ref<MultiplayerRoomState | null>(null);
  const kicked = shallowRef(false);
  const matchScoreDelta = ref(0);
  const roundResult = ref<{ roundWinner: number | null; myWins: number; opponentWins: number; iWon: boolean | null } | null>(null);
  // MATCH_FINISHED 消息到达计数器（响应式信号，让页面能直接监听该事件）
  const matchFinishedTrigger = ref(0);
  let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let _pendingQueue: { quizType: string; difficulty: string; bestOf: number } | null = null;

  // 用于等待 ROOM_STATE 的 Promise（用于 createRoom/joinRoom）
  let _roomStateResolve: (() => void) | null = null;
  let _roomStateReject: ((e: Error) => void) | null = null;
  let _waitingForRoomState = false;
  let _isTransitioning = false;
  let _inRoom = false;

  const LAST_ROOM_KEY = "phrolova_last_room_code";
  function saveLastRoomCode(roomCode: string): void {
    try { localStorage.setItem(LAST_ROOM_KEY, roomCode); } catch { /* ignore */ }
  }
  function clearLastRoomCode(): void {
    try { localStorage.removeItem(LAST_ROOM_KEY); } catch { /* ignore */ }
  }
  function getLastRoomCode(): string | null {
    try { return localStorage.getItem(LAST_ROOM_KEY); } catch { return null; }
  }

  const me = computed(() => roomState.value?.players.find((player) => player.isMe) ?? null);
  const opponent = computed(() => roomState.value?.players.find((player) => !player.isMe) ?? null);
  const canGuess = computed(() => {
    if (!roomState.value || !me.value) return false;
    return (
      roomState.value.roomStatus === "playing" &&
      roomState.value.roundStatus === "active" &&
      me.value.attemptsUsed < me.value.attemptsLimit
    );
  });

  function getWsBaseUrl(): string {
    const envBase = import.meta.env.VITE_WS_URL;
    if (envBase) return envBase;
    // 开发环境：使用 vite proxy 或本地 worker
    const dev = import.meta.env.DEV;
    if (dev) {
      // 开发时通过 vite proxy 到 wrangler dev server
      return `ws://${window.location.host}`;
    }
    // 生产环境：同域 WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }

  function bindEvents() {
    if (!gameWs) return;

    gameWs.onMessage = async (msg) => {
      const { type, payload } = msg;

      switch (type) {
        case S2C.AUTHED:
          connectionState.value = "connected";
          error.value = "";
          infoMessage.value = (payload?.message as string) || "连接已建立";
          break;

        case S2C.ERROR:
          error.value = (payload?.message as string) || "多人模式发生错误";
          if (_roomStateReject) {
            _roomStateReject(new Error(error.value));
            _roomStateReject = null;
            _roomStateResolve = null;
          }
          break;

        case S2C.MATCHING:
          inQueue.value = (payload?.inQueue as boolean) ?? /匹配队列/.test((payload?.message as string) || "");
          infoMessage.value = (payload?.message as string) || "匹配状态已更新";
          break;

        case S2C.ROOM_CREATED: {
          infoMessage.value = `房间 ${payload.roomCode} 已创建`;
          inQueue.value = false;
          // 只有在非 transition 过程中且未在房间中才触发重连（防止无限循环）
          if (!_isTransitioning && !_inRoom) {
            const roomCode = (payload.roomCode as string) || "";
            if (roomCode) {
              const config = { quizType: (payload.quizType as string) || "resonator", bestOf: Number(payload.bestOf) || 1, difficulty: (payload.difficulty as string) || "easy" };
              try {
                await transitionToRoom(roomCode, C2S.CREATE_ROOM, { roomCode, ...config });
              } catch (e) {
                error.value = e instanceof Error ? e.message : "连接房间失败";
                if (_roomStateReject) {
                  _roomStateReject(e instanceof Error ? e : new Error(String(e)));
                  _roomStateReject = null;
                  _roomStateResolve = null;
                }
              }
            }
          }
          break;
        }

        case S2C.ROOM_JOINED:
          infoMessage.value = `已加入房间 ${payload.roomCode}`;
          inQueue.value = false;
          break;

        case S2C.COUNTDOWN_STARTED: {
          // 如果已在房间中，说明这是 RoomObject 的倒计时广播，仅更新显示
          if (_inRoom || _isTransitioning) {
            infoMessage.value = `倒计时 ${payload.countdownLeft ?? 3} 秒后开局`;
            break;
          }
          // 首次收到（来自 Matchmaker）：切换到房间 WebSocket
          infoMessage.value = `匹配成功，${payload.countdownLeft ?? 2} 秒后开局`;
          inQueue.value = false;
          _pendingQueue = null;
          const roomCode = (payload.roomCode as string) || "";
          if (roomCode) {
            // 匹配成功时：必须先设置等待标志，transitionToRoom 内部才会等待 ROOM_STATE
            // 否则 ROOM_STATE 先到但 promise 没人等，用户会以为匹配没生效
            _waitingForRoomState = true;
            try {
              await transitionToRoom(roomCode, C2S.JOIN_ROOM, {
                roomCode,
                quizType: (payload.quizType as QuizType) || 'resonator',
                bestOf: Number(payload.bestOf) || 3,
                difficulty: (payload.difficulty as Difficulty) || 'easy',
              });
            } catch (e) {
              error.value = e instanceof Error ? e.message : "连接房间失败";
              if (_roomStateReject) {
                _roomStateReject(e instanceof Error ? e : new Error(String(e)));
                _roomStateReject = null;
                _roomStateResolve = null;
              }
            }
          }
          break;
        }

        case S2C.ROOM_STATE:
          const rawState = payload as unknown as MultiplayerRoomState;
          // 为每个玩家添加 isMe 属性（服务端不发送此字段）
          const authStore = useAuthStore();
          const processedState: MultiplayerRoomState = {
            ...rawState,
            players: rawState.players.map(p => ({
              ...p,
              isMe: p.playerId === authStore.playerId,
            })),
          };
          roomState.value = processedState;
          inQueue.value = false;
          error.value = "";
          if (processedState.roomStatus === "waiting") {
            roundResult.value = null;
          }
          if (processedState.roomCode) {
            startHeartbeat();
            saveLastRoomCode(processedState.roomCode);
          }
          // 解除等待 ROOM_STATE 的 Promise
          if (_waitingForRoomState && _roomStateResolve) {
            _waitingForRoomState = false;
            _isTransitioning = false;
            _inRoom = true;
            const resolve = _roomStateResolve;
            _roomStateResolve = null;
            _roomStateReject = null;
            resolve();
          } else {
            _isTransitioning = false;
          }
          break;

        case S2C.ROUND_STARTED:
          infoMessage.value = `第 ${payload.round} 局开始`;
          break;

        case S2C.GUESS_RESULT:
          infoMessage.value = `已提交猜测，还剩 ${payload.attemptsLeft} 次机会`;
          break;

        case S2C.ROUND_FINISHED:
          infoMessage.value = "本局已结算";
          {
            const rs = roomState.value;
            if (rs && rs.bestOf > 1 && (payload.overallWinner === null || payload.overallWinner === undefined)) {
              const myIdx = rs.players.findIndex(p => p.isMe);
              const winnerIdx = payload.roundWinner as number | null | undefined;

              // 基于 roundWinner 索引直接判定胜负（最可靠）
              let iWon: boolean | null = null;
              if (winnerIdx === null || winnerIdx === undefined) {
                iWon = null; // 平局
              } else if (myIdx < 0) {
                // 找不到自己位置，回退用 roundResult 字符串（players[0] 视角）
                const resultStr = (payload.roundResult as string) ?? "";
                if (resultStr === "win") iWon = true;
                else if (resultStr === "loss") iWon = false;
                else iWon = null;
              } else {
                iWon = winnerIdx === myIdx;
              }

              // 从 payload.roundWins 取最新的胜负场计数（后端先 ++ 再广播），并映射到我方/对方视角
              const newRoundWins = (payload.roundWins as number[]) ?? [0, 0];
              let myWins: number;
              let oppWins: number;
              if (myIdx < 0) {
                myWins = newRoundWins[0] ?? 0;
                oppWins = newRoundWins[1] ?? 0;
              } else {
                myWins = newRoundWins[myIdx] ?? 0;
                oppWins = newRoundWins[1 - myIdx] ?? 0;
              }

              roundResult.value = {
                roundWinner: winnerIdx ?? null,
                myWins,
                opponentWins: oppWins,
                iWon,
              };
            }
          }
          break;

        case S2C.MATCH_FINISHED: {
          const rawDelta = (payload.scoreDelta as number) || 0;
          const winner = payload.overallWinner as number | null | undefined;
          const forfeitPid = (payload.forfeitPlayerId as string | null | undefined) ?? null;
          // 后端发送的是 players[0] 视角的差值；前端修正为“我”的视角
          const rs = roomState.value;
          const myIdx = rs ? rs.players.findIndex(p => p.isMe) : 0;
          const isViewpoint0 = myIdx === 0 || myIdx < 0;
          // overallWinner === 0 → players[0] 胜，所以非0玩家时scoreDelta必须取反
          let myDelta = isViewpoint0 ? rawDelta : -rawDelta;
          if (winner === null) myDelta = 0;
          matchScoreDelta.value = myDelta;

          // 把 forfeitBy / overallWinner 同步到 roomState；MATCH_FINISHED 可能先于 ROOM_STATE 到达
          if (roomState.value) {
            const s = roomState.value;
            if (forfeitPid) {
              s.forfeitBy = forfeitPid;
            }
            if (winner !== undefined) {
              s.overallWinner = winner;
            }
            // 强制触发响应式更新
            roomState.value = { ...s };
          }
          // 触发 MATCH_FINISHED 到达信号（供页面 watch 弹窗）
          matchFinishedTrigger.value++;

          infoMessage.value =
            myDelta > 0
              ? `整场获胜，积分 +${myDelta}`
              : myDelta < 0
                ? `整场结束，积分 ${myDelta}`
                : `整场结束`;
          stopHeartbeat();
          clearLastRoomCode();
          break;
        }

        case S2C.OPPONENT_FORFEIT:
          matchScoreDelta.value = (payload.scoreDelta as number) || 0;
          // 兼容旧协议：OPPONENT_FORFEIT 效果等同于对手弃权的对局结束
          if (roomState.value) {
            const s = roomState.value;
            const me = s.players.find(p => p.isMe);
            const opponent = s.players.find(p => !p.isMe);
            s.forfeitBy = opponent?.playerId ?? null;
            s.overallWinner = me ? s.players.indexOf(me) : 0;
            s.roomStatus = "finished";
            roomState.value = { ...s };
          }
          matchFinishedTrigger.value++;
          infoMessage.value = (payload.message as string) || "对手已退出";
          stopHeartbeat();
          clearLastRoomCode();
          break;

        case S2C.ROOM_EXPIRED:
          infoMessage.value = (payload?.message as string) || "房间因长时间无活动已自动关闭";
          roomState.value = null;
          inQueue.value = false;
          stopHeartbeat();
          clearLastRoomCode(); // 房间关闭后也不能再重连
          break;

        case S2C.KICKED:
          if (!kicked.value) {
            disconnect();
            kicked.value = true;
          }
          break;

        case S2C.PONG:
          // 心跳回复，无需处理
          break;
      }
    };

    gameWs.onOpen = () => {
      connectionState.value = "connected";
      error.value = "";
      // 如果之前在匹配队列中，重连后自动重新加入队列
      if (_pendingQueue && !_inRoom) {
        gameWs?.send(C2S.QUEUE_JOIN, _pendingQueue);
      }
    };

    gameWs.onClose = () => {
      if (connectionState.value === "connected" || connectionState.value === "connecting") {
        connectionState.value = "idle";
        error.value = "连接已断开";
        // 保留 inQueue 状态和 _pendingQueue，等待自动重连后恢复匹配
        if (!_pendingQueue) {
          inQueue.value = false;
        }
        _inRoom = false;
        stopHeartbeat();
      }
    };

    gameWs.onError = () => {
      // 错误事件仅通知，具体错误状态由 onClose/onOpen 决定
      // 避免误报：onerror 可能在连接建立后因网络波动触发
    };
  }

  function startHeartbeat() {
    stopHeartbeat();
    _heartbeatTimer = setInterval(() => {
      if (gameWs?.connected && roomState.value?.roomCode) {
        gameWs.send(C2S.HEARTBEAT, { roomCode: roomState.value.roomCode });
      }
    }, 60000);
  }

  function stopHeartbeat() {
    if (_heartbeatTimer) {
      clearInterval(_heartbeatTimer);
      _heartbeatTimer = null;
    }
  }

  async function ensureConnected(path: string = ""): Promise<GameWebSocket> {
    const authStore = useAuthStore();
    if (!authStore.isAuthenticated) {
      throw new Error("请先登录账号，再进入多人模式");
    }

    if (gameWs?.connected) {
      return gameWs;
    }

    if (gameWs) {
      gameWs.disconnect();
      gameWs = null;
    }

    connectionState.value = "connecting";
    const baseUrl = getWsBaseUrl();

    gameWs = new GameWebSocket(baseUrl, authStore.playerId, authStore.token);
    bindEvents();

    try {
      await gameWs.connect(path);
      return gameWs;
    } catch (e) {
      connectionState.value = "error";
      error.value = e instanceof Error ? e.message : "连接失败";
      gameWs = null;
      throw e;
    }
  }

  async function transitionToRoom(roomCode: string, action: string, payload: Record<string, unknown>): Promise<void> {
    _isTransitioning = true;
    // 断开当前连接（matchmaker）并重新连接到 room
    if (gameWs) {
      gameWs.disconnect();
      gameWs = null;
    }

    try {
      const ws = await ensureConnected(`/ws/room/${roomCode}`);
      ws.send(action, payload);
      // 等待首次 ROOM_STATE 到达，确保上层 createRoom / joinQueue 等 Promise 能 resolve
      if (_waitingForRoomState) {
        await waitForRoomState();
      }
    } catch (e) {
      _isTransitioning = false;
      const msg = e instanceof Error ? e.message : "连接房间失败";
      error.value = msg;
      throw e;
    }
  }

  function waitForRoomState(timeoutMs: number = 15000): Promise<void> {
    // 若已经有在途的等待 Promise，返回同一个（避免重复覆盖 _roomStateResolve/_roomStateReject）
    if (_waitingForRoomState && _roomStateResolve && _roomStateReject) {
      return new Promise<void>((resolve, reject) => {
        const prevResolve = _roomStateResolve!;
        const prevReject = _roomStateReject!;
        _roomStateResolve = () => {
          prevResolve();
          resolve();
        };
        _roomStateReject = (e: Error) => {
          prevReject(e);
          reject(e);
        };
      });
    }

    return new Promise((resolve, reject) => {
      _roomStateResolve = resolve;
      _roomStateReject = reject;
      _waitingForRoomState = true;

      setTimeout(() => {
        if (_roomStateReject) {
          _roomStateReject(new Error("连接超时，请重试"));
          _roomStateReject = null;
          _roomStateResolve = null;
          _waitingForRoomState = false;
          _isTransitioning = false;
        }
      }, timeoutMs);
    });
  }

  async function ensureRoomConnection(roomCode: string): Promise<GameWebSocket> {
    const path = `/ws/room/${roomCode}`;
    return ensureConnected(path);
  }

  async function ensureMatchmakerConnection(): Promise<GameWebSocket> {
    return ensureConnected("/ws/matchmaker");
  }

  async function resumeRoom(): Promise<void> {
    const authStore = useAuthStore();
    if (!authStore.isAuthenticated) return;
    // 已在房间中或已经有房间状态：无需重复恢复
    if (_inRoom && roomState.value) return;
    const lastRoomCode = getLastRoomCode();
    if (!lastRoomCode) return;
    _waitingForRoomState = true;
    try {
      const ws = await ensureConnected(`/ws/room/${lastRoomCode}`);
      ws.send(C2S.RESUME_ROOM);
      await waitForRoomState();
    } catch (e) {
      // 恢复失败（房间过期/服务器错误等）：清理缓存避免反复尝试
      clearLastRoomCode();
      roomState.value = null;
      _waitingForRoomState = false;
      _isTransitioning = false;
      throw e;
    }
  }

  async function createRoom(quizType: QuizType, bestOf: number, difficulty: Difficulty): Promise<void> {
    // 优化：前端直接生成 roomCode 并连接 RoomDO，跳过 MatchmakerDO 中转
    // 省掉一次 WS 连接 + D1 鉴权 + 往返延迟
    _waitingForRoomState = true;
    _isTransitioning = true; // 阻止 ROOM_CREATED 处理器再次触发 transitionToRoom
    try {
      const roomCode = generateRoomCode();
      const ws = await ensureConnected(`/ws/room/${roomCode}`);
      ws.send(C2S.CREATE_ROOM, { roomCode, quizType, bestOf, difficulty });
      await waitForRoomState();
    } catch (e) {
      _waitingForRoomState = false;
      _isTransitioning = false;
      throw e;
    }
  }

  async function joinRoom(roomCode: string): Promise<void> {
    _waitingForRoomState = true;
    const ws = await ensureConnected(`/ws/room/${roomCode}`);
    ws.send(C2S.JOIN_ROOM, { roomCode });
    await waitForRoomState();
  }

  async function joinQueue(quizType: QuizType, difficulty: Difficulty, bestOf: number): Promise<void> {
    _pendingQueue = { quizType, difficulty, bestOf };
    const ws = await ensureConnected("/ws/matchmaker");
    inQueue.value = true;
    ws.send(C2S.QUEUE_JOIN, { quizType, difficulty, bestOf });
  }

  async function cancelQueue(): Promise<void> {
    _pendingQueue = null;
    if (gameWs) {
      gameWs.send(C2S.QUEUE_CANCEL);
    }
    inQueue.value = false;
  }

  async function submitGuess(guessName: string): Promise<void> {
    if (!roomState.value) {
      throw new Error("当前不在房间中");
    }
    if (!gameWs?.connected) {
      throw new Error("WebSocket 未连接");
    }
    gameWs.send(C2S.SUBMIT_GUESS, {
      roomCode: roomState.value.roomCode,
      guessName,
    });
  }

  async function leaveRoom(): Promise<void> {
    if (roomState.value) {
      if (gameWs) {
        gameWs.send(C2S.LEAVE_ROOM, { roomCode: roomState.value.roomCode });
      }
    }
    clearLastRoomCode(); // 必须清理：用户主动退出后刷新页面不能再重连
    roomState.value = null;
    inQueue.value = false;
    _inRoom = false;
    stopHeartbeat();
  }

  function restartRoom(): void {
    if (!roomState.value || !gameWs) return;
    gameWs.send(C2S.RESTART_ROOM, { roomCode: roomState.value.roomCode });
  }

  function disconnect(): void {
    stopHeartbeat();
    clearLastRoomCode(); // 用户显式断开也清除缓存，避免意外重连
    gameWs?.disconnect();
    gameWs = null;
    connectionState.value = "idle";
    inQueue.value = false;
    _inRoom = false;
    _isTransitioning = false;
    _waitingForRoomState = false;
    roomState.value = null;
    kicked.value = false;
    matchScoreDelta.value = 0;
    roundResult.value = null;
  }

  return {
    connectionState,
    error,
    infoMessage,
    inQueue,
    roomState,
    me,
    opponent,
    canGuess,
    kicked,
    matchScoreDelta,
    roundResult,
    matchFinishedTrigger,
    ensureConnected,
    resumeRoom,
    createRoom,
    joinRoom,
    joinQueue,
    cancelQueue,
    submitGuess,
    leaveRoom,
    restartRoom,
    disconnect,
  };
});