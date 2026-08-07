import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import { io, type Socket } from "socket.io-client";

import type { Difficulty, MultiplayerRoomState, QuizType } from "@/types/game";
import { C2S, S2C } from "@/api";
import { useAuthStore } from "./auth";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

export const useMultiGameStore = defineStore("multiGame", () => {
  const socket = shallowRef<Socket | null>(null);
  const connectionState = shallowRef<ConnectionState>("idle");
  const error = shallowRef("");
  const infoMessage = shallowRef("");
  const inQueue = shallowRef(false);
  const roomState = ref<MultiplayerRoomState | null>(null);
  const kicked = shallowRef(false);
  const matchScoreDelta = ref(0);
  const roundResult = ref<{ roundWinner: number | null; myWins: number; opponentWins: number; iWon: boolean | null } | null>(null);
  let _prevMyWins = 0;
  let _prevOppWins = 0;
  let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

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

  function bindEvents(currentSocket: Socket) {
    currentSocket.on(S2C.CONNECT, () => {
      connectionState.value = "connected";
      error.value = "";
    });
    currentSocket.on(S2C.CONNECT_ERROR, (reason) => {
      connectionState.value = "error";
      error.value = reason.message || "实时连接失败";
    });
    currentSocket.on(S2C.DISCONNECT, () => {
      connectionState.value = "idle";
    });
    currentSocket.on(S2C.AUTHED, (payload) => {
      infoMessage.value = payload.message || "实时连接已建立";
    });
    currentSocket.on(S2C.ERROR, (payload) => {
      error.value = payload.message || "多人模式发生错误";
    });
    currentSocket.on(S2C.MATCHING, (payload) => {
      inQueue.value = payload.inQueue ?? /匹配队列/.test(payload.message || "");
      infoMessage.value = payload.message || "匹配状态已更新";
    });
    currentSocket.on(S2C.ROOM_CREATED, (payload) => {
      infoMessage.value = `房间 ${payload.roomCode} 已创建`;
      inQueue.value = false;
    });
    currentSocket.on(S2C.ROOM_JOINED, (payload) => {
      infoMessage.value = `已加入房间 ${payload.roomCode}`;
      inQueue.value = false;
    });
    currentSocket.on(S2C.COUNTDOWN_STARTED, (payload) => {
      infoMessage.value = `匹配成功，${payload.countdownLeft ?? 2} 秒后开局`;
      inQueue.value = false;
    });
    currentSocket.on(S2C.ROOM_STATE, (payload: MultiplayerRoomState) => {
      roomState.value = payload;
      inQueue.value = false;
      error.value = "";
      if (payload.roomStatus === "waiting") { _prevMyWins = 0; _prevOppWins = 0; }
      if (payload.roomCode) {
        startHeartbeat();
      }
    });
    currentSocket.on(S2C.ROUND_STARTED, (payload) => {
      infoMessage.value = `第 ${payload.round} 局开始`;
    });
    currentSocket.on(S2C.GUESS_RESULT, (payload) => {
      infoMessage.value = `已提交猜测，还剩 ${payload.attemptsLeft} 次机会`;
    });
    currentSocket.on(S2C.ROUND_FINISHED, (payload: { roundWinner: number | null; roundWins: number[]; overallWinner: number | null; roundResult?: "win" | "loss" | "draw" }) => {
      infoMessage.value = "本局已结算";
      if (roomState.value && roomState.value.bestOf > 1 && payload.overallWinner === null) {
        const me = roomState.value.players.find(p => p.isMe);
        const opponent = roomState.value.players.find(p => !p.isMe);
        const myWins = me?.roundWins ?? 0;
        const oppWins = opponent?.roundWins ?? 0;
        // Prefer the server's explicit per-player status; otherwise default to null (draw).
        let iWon: boolean | null;
        if (payload.roundResult === "win") {
          iWon = true;
        } else if (payload.roundResult === "loss") {
          iWon = false;
        } else {
          // "draw" (or an absent field) → treated as a draw / neutral.
          iWon = null;
        }
        roundResult.value = {
          roundWinner: payload.roundWinner,
          myWins,
          opponentWins: oppWins,
          iWon,
        };
        _prevMyWins = myWins;
        _prevOppWins = oppWins;
      }
    });
    currentSocket.on(S2C.MATCH_FINISHED, (payload) => {
      matchScoreDelta.value = payload.scoreDelta || 0;
      infoMessage.value =
        payload.scoreDelta >= 0
          ? `整场获胜，积分 +${payload.scoreDelta}`
          : `整场结束，积分 ${payload.scoreDelta}`;
    });
    currentSocket.on(S2C.OPPONENT_FORFEIT, (payload) => {
      matchScoreDelta.value = payload.scoreDelta || 0;
      infoMessage.value = payload.message || "对手已退出";
    });
    currentSocket.on(S2C.ROOM_EXPIRED, (payload) => {
      infoMessage.value = payload?.message || "房间因长时间无活动已自动关闭";
      roomState.value = null;
      inQueue.value = false;
      stopHeartbeat();
    });
    currentSocket.on(S2C.KICKED, () => {
      if (kicked.value) return;
      disconnect();
      kicked.value = true;
    });
  }

  function startHeartbeat() {
    stopHeartbeat();
    _heartbeatTimer = setInterval(() => {
      const s = socket.value;
      const code = roomState.value?.roomCode;
      if (s?.connected && code) {
        s.emit(C2S.HEARTBEAT, { roomCode: code });
      }
    }, 60000);
  }

  function stopHeartbeat() {
    if (_heartbeatTimer) {
      clearInterval(_heartbeatTimer);
      _heartbeatTimer = null;
    }
  }

  async function ensureConnected() {
    const authStore = useAuthStore();
    if (!authStore.isAuthenticated) {
      throw new Error("请先登录账号，再进入多人模式");
    }
    if (socket.value?.connected) {
      return socket.value;
    }
    if (socket.value) {
      socket.value.disconnect();
      socket.value = null;
    }
    connectionState.value = "connecting";
    const nextSocket = io({
      autoConnect: false,
      path: import.meta.env.VITE_SOCKET_PATH || "/socket.io",
      transports: ["websocket"],
      auth: {
        player_id: authStore.playerId,
        token: authStore.token,
      },
    });
    bindEvents(nextSocket);
    nextSocket.connect();
    socket.value = nextSocket;
    return nextSocket;
  }

  async function resumeRoom() {
    const currentSocket = await ensureConnected();
    currentSocket.emit(C2S.RESUME_ROOM);
  }

  async function createRoom(quizType: QuizType, bestOf: number, difficulty: Difficulty) {
    const currentSocket = await ensureConnected();
    currentSocket.emit(C2S.CREATE_ROOM, { quizType, bestOf, difficulty });
  }

  async function joinRoom(roomCode: string) {
    const currentSocket = await ensureConnected();
    currentSocket.emit(C2S.JOIN_ROOM, { roomCode });
  }

  async function joinQueue(quizType: QuizType, difficulty: Difficulty, bestOf: number) {
    const currentSocket = await ensureConnected();
    inQueue.value = true;
    currentSocket.emit(C2S.QUEUE_JOIN, { quizType, difficulty, bestOf });
  }

  async function cancelQueue() {
    if (!socket.value) return;
    socket.value.emit(C2S.QUEUE_CANCEL);
    inQueue.value = false;
  }

  async function submitGuess(guessName: string) {
    if (!roomState.value) {
      throw new Error("当前不在房间中");
    }
    const currentSocket = await ensureConnected();
    currentSocket.emit(C2S.SUBMIT_GUESS, {
      roomCode: roomState.value.roomCode,
      guessName,
    });
  }

  async function leaveRoom() {
    if (!roomState.value) {
      roomState.value = null;
      return;
    }
    if (socket.value) {
      socket.value.emit(C2S.LEAVE_ROOM, { roomCode: roomState.value.roomCode });
    }
    roomState.value = null;
    inQueue.value = false;
  }

  function restartRoom() {
    if (!roomState.value || !socket.value) return;
    socket.value.emit(C2S.RESTART_ROOM, { roomCode: roomState.value.roomCode });
  }

  function disconnect() {
    stopHeartbeat();
    socket.value?.disconnect();
    socket.value = null;
    connectionState.value = "idle";
    inQueue.value = false;
    roomState.value = null;
    kicked.value = false;
    matchScoreDelta.value = 0;
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
