import { computed, reactive, shallowRef } from "vue";
import { defineStore } from "pinia";

import type { AuthResponse } from "@/types/game";
import { apiPath, requestJson } from "@/utils/http";

const PLAYER_ID_KEY = "phrolova_player_id";
const TOKEN_KEY = "phrolova_player_token";
const AUTH_KEY = "phrolova_logged_in";

interface AuthPayload {
  username: string;
  password: string;
  captchaId: string;
  captchaText: string;
}

export const useAuthStore = defineStore("auth", () => {
  const playerId = shallowRef("");
  const token = shallowRef("");
  const loggedIn = shallowRef(false);
  const loading = shallowRef(false);
  const error = shallowRef("");
  const stats = reactive({
    score: 0,
    wins: 0,
    matches: 0,
  });

  const isAuthenticated = computed(() => loggedIn.value && Boolean(playerId.value) && Boolean(token.value));

  function applyPlayer(player?: AuthResponse["player"]) {
    if (!player) return;
    playerId.value = player.player_id;
    stats.score = player.score;
    stats.wins = player.wins;
    stats.matches = player.matches;
  }

  function persist() {
    localStorage.setItem(PLAYER_ID_KEY, playerId.value);
    localStorage.setItem(TOKEN_KEY, token.value);
    localStorage.setItem(AUTH_KEY, loggedIn.value ? "1" : "0");
  }

  function clearSession() {
    playerId.value = "";
    token.value = "";
    loggedIn.value = false;
    stats.score = 0;
    stats.wins = 0;
    stats.matches = 0;
    localStorage.removeItem(PLAYER_ID_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(AUTH_KEY);
  }

  async function refreshPlayer() {
    if (!loggedIn.value || !playerId.value) {
      return;
    }
    const data = await requestJson<AuthResponse>(apiPath("/player/init"), {
      method: "POST",
      body: JSON.stringify({ player_id: playerId.value }),
    });
    applyPlayer(data.player);
    if (data.token) {
      token.value = data.token;
    }
    persist();
  }

  async function hydrate() {
    playerId.value = localStorage.getItem(PLAYER_ID_KEY) || "";
    token.value = localStorage.getItem(TOKEN_KEY) || "";
    loggedIn.value = localStorage.getItem(AUTH_KEY) === "1";
    if (!loggedIn.value || !playerId.value) {
      clearSession();
      return;
    }
    try {
      await refreshPlayer();
      error.value = "";
    } catch (reason) {
      clearSession();
      error.value = reason instanceof Error ? reason.message : "登录态已失效，请重新登录";
    }
  }

  async function login(payload: AuthPayload) {
    loading.value = true;
    error.value = "";
    try {
      const data = await requestJson<AuthResponse>(apiPath("/auth/login"), {
        method: "POST",
        body: JSON.stringify({
          username: payload.username,
          password: payload.password,
          captcha_id: payload.captchaId,
          captcha_text: payload.captchaText,
        }),
      });
      loggedIn.value = true;
      applyPlayer(data.player);
      token.value = data.token || "";
      persist();
      return data;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : "登录失败";
      throw reason;
    } finally {
      loading.value = false;
    }
  }

  async function register(payload: AuthPayload) {
    loading.value = true;
    error.value = "";
    try {
      const data = await requestJson<AuthResponse>(apiPath("/auth/register"), {
        method: "POST",
        body: JSON.stringify({
          username: payload.username,
          password: payload.password,
          captcha_id: payload.captchaId,
          captcha_text: payload.captchaText,
        }),
      });
      loggedIn.value = true;
      applyPlayer(data.player);
      token.value = data.token || "";
      persist();
      return data;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : "注册失败";
      throw reason;
    } finally {
      loading.value = false;
    }
  }

  async function updatePlayerId(newId: string) {
    if (!isAuthenticated.value) {
      throw new Error("当前未登录");
    }
    loading.value = true;
    error.value = "";
    try {
      const data = await requestJson<AuthResponse>(apiPath("/player/update_id"), {
        method: "POST",
        body: JSON.stringify({
          old_id: playerId.value,
          new_id: newId,
          token: token.value,
        }),
      });
      applyPlayer(data.player);
      token.value = data.token || token.value;
      persist();
      return data;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : "修改 ID 失败";
      throw reason;
    } finally {
      loading.value = false;
    }
  }

  function logout() {
    clearSession();
    error.value = "";
  }

  return {
    playerId,
    token,
    loggedIn,
    loading,
    error,
    stats,
    isAuthenticated,
    hydrate,
    login,
    register,
    refreshPlayer,
    updatePlayerId,
    logout,
  };
});
