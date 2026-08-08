import { computed, reactive, shallowRef } from "vue";
import { defineStore } from "pinia";

import { useLocalStorage, removeLocalStorage } from "@/composables/useStorage";
import type { AuthResponse } from "@/types";
import * as api from "@/api";

export const useAuthStore = defineStore("auth", () => {
  const playerId = useLocalStorage("phrolova_player_id", "");
  const token = useLocalStorage("phrolova_player_token", "");
  const loggedIn = useLocalStorage("phrolova_logged_in", false);

  const loading = shallowRef(false);
  const error = shallowRef("");
  const stats = reactive({
    score: 0,
    wins: 0,
    matches: 0,
    single_resonator_score: 0,
    single_skeleton_score: 0,
  });

  const isAuthenticated = computed(() => loggedIn.value && Boolean(playerId.value) && Boolean(token.value));

  function applyPlayer(player?: AuthResponse["player"]) {
    if (!player) return;
    playerId.value = player.player_id;
    stats.score = player.score;
    stats.wins = player.wins;
    stats.matches = player.matches;
    stats.single_resonator_score = player.single_resonator_score;
    stats.single_skeleton_score = player.single_skeleton_score;
  }

  function clearSession() {
    playerId.value = "";
    token.value = "";
    loggedIn.value = false;
    stats.score = 0;
    stats.wins = 0;
    stats.matches = 0;
    stats.single_resonator_score = 0;
    stats.single_skeleton_score = 0;
    removeLocalStorage("phrolova_player_id");
    removeLocalStorage("phrolova_player_token");
    removeLocalStorage("phrolova_logged_in");
  }

  async function refreshPlayer() {
    if (!loggedIn.value || !playerId.value) return;
    const data = await api.initPlayer(playerId.value);
    applyPlayer(data.player);
    if (data.token) {
      token.value = data.token;
    }
  }

  async function hydrate() {
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

  async function login(payload: api.LoginPayload) {
    loading.value = true;
    error.value = "";
    try {
      const data = await api.login(payload);
      loggedIn.value = true;
      applyPlayer(data.player);
      token.value = data.token || "";
      return data;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : "登录失败";
      throw reason;
    } finally {
      loading.value = false;
    }
  }

  async function register(payload: api.RegisterPayload) {
    loading.value = true;
    error.value = "";
    try {
      const data = await api.register(payload);
      loggedIn.value = true;
      applyPlayer(data.player);
      token.value = data.token || "";
      return data;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : "注册失败";
      throw reason;
    } finally {
      loading.value = false;
    }
  }

  async function upgradePassword(payload: api.UpgradePasswordPayload) {
    loading.value = true;
    error.value = "";
    try {
      const data = await api.upgradePassword(payload);
      loggedIn.value = true;
      applyPlayer(data.player);
      token.value = data.token || "";
      return data;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : "密码升级失败";
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
      const data = await api.updatePlayerId({
        oldId: playerId.value,
        newId,
        token: token.value,
      });
      applyPlayer(data.player);
      token.value = data.token || token.value;
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
    upgradePassword,
    refreshPlayer,
    updatePlayerId,
    logout,
  };
});
