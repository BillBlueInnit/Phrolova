<script setup lang="ts">
import { reactive, shallowRef } from "vue";
import { useRouter } from "vue-router";

import StatusBanner from "@/components/shared/StatusBanner.vue";
import { useAuthStore } from "@/stores/auth";
import { useMultiGameStore } from "@/stores/multiGame";

const authStore = useAuthStore();
const multiGameStore = useMultiGameStore();
const router = useRouter();

const localError = shallowRef("");
const form = reactive({ newPlayerId: "" });

if (!authStore.isAuthenticated) {
  router.replace("/");
}

async function savePlayerId() {
  localError.value = "";
  try {
    await authStore.updatePlayerId(form.newPlayerId.trim());
    form.newPlayerId = "";
  } catch (reason) {
    localError.value = reason instanceof Error ? reason.message : "修改 ID 失败";
  }
}

function logout() {
  multiGameStore.disconnect();
  authStore.logout();
  router.push("/");
}
</script>

<template>
  <section class="page-shell page-shell-narrow" v-if="authStore.isAuthenticated">
    <header class="page-heading">
      <p class="page-kicker">Account</p>
      <h1 class="page-title">账号中心</h1>
      <p class="page-desc">管理你的玩家 ID 与账号状态。</p>
    </header>

    <StatusBanner v-if="localError || authStore.error" :message="localError || authStore.error" tone="error" />

    <div class="account-card">
      <div class="account-stats">
        <div class="account-stat">
          <span class="account-stat-label">玩家 ID</span>
          <strong class="account-stat-value">{{ authStore.playerId }}</strong>
        </div>
        <div class="account-stat">
          <span class="account-stat-label">当前积分</span>
          <strong class="account-stat-value">{{ authStore.stats.score }}</strong>
        </div>
        <div class="account-stat">
          <span class="account-stat-label">多人胜场</span>
          <strong class="account-stat-value">{{ authStore.stats.wins }}</strong>
        </div>
        <div class="account-stat">
          <span class="account-stat-label">多人总场次</span>
          <strong class="account-stat-value">{{ authStore.stats.matches }}</strong>
        </div>
      </div>

      <label class="auth-field">
        <span class="auth-field-label">修改玩家 ID</span>
        <input v-model="form.newPlayerId" class="auth-input" type="text" placeholder="输入新的玩家 ID" />
      </label>

      <div class="auth-actions">
        <button class="auth-btn" type="button" @click="savePlayerId">保存新 ID</button>
        <button class="auth-btn-ghost" type="button" @click="logout">退出登录</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.account-card {
  padding: 1.5rem;
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  background: var(--surface-panel);
}

.account-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
  margin-bottom: 1.2rem;
}

.account-stat {
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  background: var(--shell-bg);
}

.account-stat-label {
  display: block;
  color: var(--text-faint);
  font-size: 0.78rem;
  margin-bottom: 0.2rem;
}

.account-stat-value {
  font-size: 1.1rem;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.8rem;
}

.auth-field-label {
  color: var(--text-faint);
  font-size: 0.82rem;
}

.auth-input {
  min-height: 44px;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--shell-bg);
  color: var(--text-main);
}

.auth-input::placeholder {
  color: var(--text-faint);
}

.auth-input:focus {
  outline: none;
  border-color: color-mix(in oklab, var(--gold) 50%, transparent);
}

.auth-actions {
  display: flex;
  gap: 0.6rem;
}

.auth-btn {
  flex: 1;
  min-height: 44px;
  border: 1px solid color-mix(in oklab, var(--gold) 40%, transparent);
  border-radius: 6px;
  background: color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong));
  color: var(--gold);
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.auth-btn:hover {
  background: color-mix(in oklab, var(--gold) 24%, var(--surface-panel-strong));
}

.auth-btn-ghost {
  min-height: 44px;
  padding: 0 1.2rem;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--text-sub);
  font-size: 0.92rem;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.auth-btn-ghost:hover {
  border-color: var(--text-sub);
  color: var(--text-main);
}
</style>
