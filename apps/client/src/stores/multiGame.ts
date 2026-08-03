import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import { io, type Socket } from "socket.io-client";

import type { Difficulty, MultiplayerRoomState, QuizType } from "@/types/game";
import { useAuthStore } from "./auth";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

export const useMultiGameStore = defineStore("multiGame", () => {
  const socket = shallowRef<Socket | null>(null);
  const connectionState = shallowRef<ConnectionState>("idle");
  const error = shallowRef("");
  const infoMessage = shallowRef("");
  const inQueue = shallowRef(false);
  const roomState = ref<MultiplayerRoomState | null>(null);

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
    currentSocket.on("connect", () => {
      connectionState.value = "connected";
      error.value = "";
    });
    currentSocket.on("connect_error", (reason) => {
      connectionState.value = "error";
      error.value = reason.message || "实时连接失败";
    });
    currentSocket.on("disconnect", () => {
      connectionState.value = "idle";
    });
    currentSocket.on("multi:authed", (payload) => {
      infoMessage.value = payload.message || "实时连接已建立";
    });
    currentSocket.on("multi:error", (payload) => {
      error.value = payload.message || "多人模式发生错误";
    });
    currentSocket.on("multi:matching", (payload) => {
      inQueue.value = payload.inQueue ?? /匹配队列/.test(payload.message || "");
      infoMessage.value = payload.message || "匹配状态已更新";
    });
    currentSocket.on("multi:room_created", (payload) => {
      infoMessage.value = `房间 ${payload.roomCode} 已创建`;
      inQueue.value = false;
    });
    currentSocket.on("multi:room_joined", (payload) => {
      infoMessage.value = `已加入房间 ${payload.roomCode}`;
      inQueue.value = false;
    });
    currentSocket.on("multi:countdown_started", (payload) => {
      infoMessage.value = `匹配成功，${payload.countdownLeft ?? 2} 秒后开局`;
      inQueue.value = false;
    });
    currentSocket.on("multi:room_state", (payload: MultiplayerRoomState) => {
      roomState.value = payload;
      inQueue.value = false;
      error.value = "";
    });
    currentSocket.on("multi:round_started", (payload) => {
      infoMessage.value = `第 ${payload.round} 局开始`;
    });
    currentSocket.on("multi:guess_result", (payload) => {
      infoMessage.value = `已提交猜测，还剩 ${payload.attemptsLeft} 次机会`;
    });
    currentSocket.on("multi:round_finished", () => {
      infoMessage.value = "本局已结算";
    });
    currentSocket.on("multi:match_finished", async (payload) => {
      const authStore = useAuthStore();
      infoMessage.value =
        payload.scoreDelta >= 0 ? `整场获胜，积分 ${payload.scoreDelta >= 0 ? "+" : ""}${payload.scoreDelta}` : `整场结束，积分 ${payload.scoreDelta}`;
      await authStore.refreshPlayer().catch(() => undefined);
    });
    currentSocket.on("multi:opponent_forfeit", async (payload) => {
      const authStore = useAuthStore();
      infoMessage.value = payload.message || "对手已退出";
      await authStore.refreshPlayer().catch(() => undefined);
    });
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
    currentSocket.emit("multi:resume_room");
  }

  async function createRoom(quizType: QuizType, bestOf: number, difficulty: Difficulty) {
    const currentSocket = await ensureConnected();
    currentSocket.emit("multi:create_room", {
      quizType,
      bestOf,
      difficulty,
    });
  }

  async function joinRoom(roomCode: string) {
    const currentSocket = await ensureConnected();
    currentSocket.emit("multi:join_room", { roomCode });
  }

  async function joinQueue(quizType: QuizType, difficulty: Difficulty) {
    const currentSocket = await ensureConnected();
    inQueue.value = true;
    currentSocket.emit("multi:queue_join", { quizType, difficulty });
  }

  async function cancelQueue() {
    if (!socket.value) return;
    socket.value.emit("multi:queue_cancel");
    inQueue.value = false;
  }

  async function submitGuess(guessName: string) {
    if (!roomState.value) {
      throw new Error("当前不在房间中");
    }
    const currentSocket = await ensureConnected();
    currentSocket.emit("multi:submit_guess", {
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
      socket.value.emit("multi:leave_room", { roomCode: roomState.value.roomCode });
    }
    roomState.value = null;
    inQueue.value = false;
  }

  function disconnect() {
    socket.value?.disconnect();
    socket.value = null;
    connectionState.value = "idle";
    inQueue.value = false;
    roomState.value = null;
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
    ensureConnected,
    resumeRoom,
    createRoom,
    joinRoom,
    joinQueue,
    cancelQueue,
    submitGuess,
    leaveRoom,
    disconnect,
  };
});
