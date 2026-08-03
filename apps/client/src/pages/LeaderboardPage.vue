<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";

import type { QuizType } from "@/types/game";
import { useAuthStore } from "@/stores/auth";
import * as api from "@/api";

const authStore = useAuthStore();
const router = useRouter();
const loading = shallowRef(false);
const leaderboard = ref<Array<Record<string, unknown>>>([]);
const myInfo = ref<Record<string, unknown> | null>(null);

const mode = ref<"single" | "multi">("multi");
const quizType = ref<QuizType>("resonator");

const tabs: { label: string; mode: "single" | "multi"; type?: QuizType }[] = [
  { label: "多人对战", mode: "multi" },
  { label: "单人 · 共鸣者", mode: "single", type: "resonator" },
  { label: "单人 · 声骸", mode: "single", type: "skeleton" },
];

const tabTitle = computed(() => tabs.find(t => t.mode === mode.value && (!t.type || t.type === quizType.value))?.label || "");

async function loadLeaderboard() {
  loading.value = true;
  try {
    const data = await api.fetchLeaderboard(authStore.playerId || undefined, mode.value, quizType.value);
    leaderboard.value = data.leaderboard as Array<Record<string, unknown>>;
    myInfo.value = data.my_info as Record<string, unknown> | null;
  } catch {
    // silent
  } finally {
    loading.value = false;
  }
}

function selectTab(tab: (typeof tabs)[0]) {
  mode.value = tab.mode;
  if (tab.type) quizType.value = tab.type;
  loadLeaderboard();
}

function rankIcon(index: number) {
  if (index === 0) return "ph:crown-duotone";
  if (index === 1) return "ph:medal-duotone";
  if (index === 2) return "ph:medal-duotone";
  return "";
}

onMounted(loadLeaderboard);
</script>

<template>
  <div class="lb-page">
    <header class="lb-top">
      <button class="lb-back" @click="router.push('/')">
        <Icon icon="ph:arrow-left-duotone" /> BACK
      </button>

      <div class="lb-header-center">
        <h1 class="lb-title">排行榜</h1>
        <p class="lb-sub">{{ tabTitle }}</p>
      </div>

      <div class="lb-header-right">
        <div v-if="authStore.isAuthenticated" class="lb-me-chip">
          <span class="lb-me-id">{{ authStore.playerId }}</span>
          <span v-if="myInfo?.rank" class="lb-me-rank">#{{ myInfo.rank }}</span>
        </div>
      </div>
    </header>

    <nav class="lb-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.label"
        class="lb-tab"
        :class="{ 'lb-tab--active': mode === tab.mode && (!tab.type || quizType === tab.type) }"
        @click="selectTab(tab)"
      >{{ tab.label }}</button>
    </nav>

    <div class="lb-main">
      <div class="lb-card">
        <div v-if="loading" class="lb-loading">正在加载...</div>

        <template v-else-if="leaderboard.length">
          <div class="lb-podium">
            <div
              v-for="(row, index) in leaderboard.slice(0, 3)"
              :key="(row.player_id as string)"
              class="lb-podium-item"
              :class="[`lb-podium-item--${index + 1}`]"
            >
              <div class="lb-podium-avatar">
                <Icon v-if="index === 0" icon="ph:crown-fill" class="lb-podium-crown" />
                <span class="lb-podium-rank">{{ index + 1 }}</span>
              </div>
              <span class="lb-podium-name">{{ row.player_id }}</span>
              <span class="lb-podium-score">{{ row.sort_score ?? row.score }}</span>
              <span class="lb-podium-rate">{{ row.win_rate ?? 100 }}%</span>
            </div>
          </div>

          <div class="lb-rows">
            <div
              v-for="(row, index) in leaderboard.slice(3)"
              :key="(row.player_id as string)"
              class="lb-row"
            >
              <span class="lb-row-rank">{{ index + 4 }}</span>
              <span class="lb-row-name">{{ row.player_id }}</span>
              <span class="lb-row-score">{{ row.sort_score ?? row.score }}</span>
              <span class="lb-row-rate">{{ row.win_rate ?? 100 }}%</span>
            </div>
          </div>
        </template>

        <p v-else class="lb-empty">暂无排行数据</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lb-page {
  display: flex; flex-direction: column; align-items: center;
  min-height: 100vh; width: 100%;
  padding: 1.5rem 1.5rem 3rem;
}

/* ── Top bar ── */
.lb-top {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; max-width: 720px; margin-bottom: 0.8rem;
}

.lb-back {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--line-strong); border-radius: 6px;
  background: var(--shell-bg-deep); color: var(--text-sub);
  font-size: 0.85rem; font-weight: 600; cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.lb-back:hover { color: var(--gold); border-color: var(--gold); }

.lb-header-center { text-align: center; }
.lb-title { margin: 0; font-size: 1.5rem; font-weight: 900; letter-spacing: 0.06em; }
.lb-sub { margin: 0.15rem 0 0; color: var(--text-faint); font-size: 0.78rem; letter-spacing: 0.1em; }

.lb-header-right { min-width: 120px; display: flex; justify-content: flex-end; }
.lb-me-chip {
  display: inline-flex; align-items: center; gap: 0.45rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid var(--line-soft); border-radius: 20px;
  background: var(--surface-panel);
}
.lb-me-id { color: var(--text-sub); font-size: 0.8rem; font-weight: 600; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-me-rank { color: var(--gold); font-weight: 900; font-size: 0.85rem; }

/* ── Tabs ── */
.lb-tabs {
  display: flex; justify-content: center; gap: 0;
  margin-bottom: 1.5rem;
  border: 1px solid var(--line-soft); border-radius: 8px;
  overflow: hidden;
}

.lb-tab {
  padding: 0.55rem 1.2rem;
  border: none; background: transparent;
  color: var(--text-faint); font-size: 0.82rem; font-weight: 600; cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.lb-tab:hover { color: var(--text-sub); background: color-mix(in oklab, var(--text-main) 4%, transparent); }
.lb-tab--active { background: color-mix(in oklab, var(--gold) 14%, transparent); color: var(--gold); }

/* ── Main card ── */
.lb-main { width: 100%; max-width: 640px; flex: 1; }
.lb-card {
  border: 1px solid var(--line-soft); border-radius: 12px;
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  overflow: hidden;
}

.lb-loading, .lb-empty {
  margin: 0; padding: 3rem 1rem; text-align: center;
  color: var(--text-faint); font-size: 0.9rem;
}

/* ── Podium (top 3) ── */
.lb-podium {
  display: grid; grid-template-columns: 1fr 1.2fr 1fr;
  gap: 0; padding: 1.5rem 1rem 0.8rem;
  align-items: end;
  border-bottom: 1px solid var(--line-soft);
  background: radial-gradient(ellipse 80% 100% at 50% 100%, color-mix(in oklab, var(--gold) 8%, transparent), transparent);
}

.lb-podium-item {
  display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
  padding: 0.5rem 0.3rem;
  order: 2;
}
.lb-podium-item--1 { order: 2; }
.lb-podium-item--2 { order: 1; }
.lb-podium-item--3 { order: 3; }

.lb-podium-avatar {
  position: relative;
  display: grid; place-items: center;
  width: 3rem; height: 3rem;
  border-radius: 50%;
  border: 2px solid var(--line-strong);
  background: var(--surface-panel);
}
.lb-podium-item--1 .lb-podium-avatar {
  width: 3.6rem; height: 3.6rem;
  border-color: var(--gold);
  background: color-mix(in oklab, var(--gold) 14%, var(--shell-bg-deep));
}
.lb-podium-item--2 .lb-podium-avatar { border-color: #b0b8c0; }
.lb-podium-item--3 .lb-podium-avatar { border-color: #c4946c; }

.lb-podium-crown {
  position: absolute; top: -14px;
  font-size: 1.1rem; color: var(--gold);
}

.lb-podium-rank {
  font-weight: 900; font-size: 1.1rem; color: var(--text-sub);
}
.lb-podium-item--1 .lb-podium-rank { color: var(--gold); font-size: 1.3rem; }

.lb-podium-name {
  font-weight: 700; font-size: 0.92rem; letter-spacing: 0.04em;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lb-podium-item--1 .lb-podium-name { font-size: 1rem; color: var(--text-main); }

.lb-podium-score {
  font-weight: 900; color: var(--gold); font-size: 0.95rem;
}
.lb-podium-item--1 .lb-podium-score { font-size: 1.15rem; }
.lb-podium-rate { font-size: 0.75rem; color: var(--text-sub); font-weight: 600; }

/* ── Rows (4-40) ── */
.lb-rows { }
.lb-row {
  display: flex; align-items: center; gap: 0.8rem;
  padding: 0.7rem 1.2rem;
  border-bottom: 1px solid color-mix(in oklab, var(--line-soft) 50%, transparent);
  transition: background 0.15s;
}
.lb-row:last-child { border-bottom: none; }
.lb-row:hover { background: color-mix(in oklab, var(--text-main) 3%, transparent); }

.lb-row-rank {
  width: 2rem; text-align: center;
  font-weight: 700; color: var(--text-faint); font-size: 0.85rem;
}
.lb-row-name { flex: 1; font-weight: 600; font-size: 0.95rem; letter-spacing: 0.04em; }
.lb-row-score { font-weight: 900; color: var(--gold); font-size: 0.95rem; min-width: 4rem; text-align: right; }
.lb-row-rate { color: var(--text-sub); font-weight: 600; font-size: 0.85rem; min-width: 3.5rem; text-align: right; }

/* ── mobile ── */
@media (max-width: 640px) {
  .lb-page { padding: 0.8rem 0.6rem 2rem; }
  .lb-top { gap: 0.5rem; }
  .lb-title { font-size: 1.2rem; }
  .lb-header-right { min-width: auto; }
  .lb-me-chip { padding: 0.25rem 0.5rem; }
  .lb-me-id { max-width: 60px; font-size: 0.72rem; }
  .lb-tab { padding: 0.5rem 0.7rem; font-size: 0.74rem; }
  .lb-main { max-width: 100%; }
  .lb-podium { padding: 1rem 0.5rem 0.5rem; }
  .lb-podium-avatar { width: 2.4rem; height: 2.4rem; }
  .lb-podium-item--1 .lb-podium-avatar { width: 2.8rem; height: 2.8rem; }
  .lb-podium-name { font-size: 0.76rem; }
  .lb-podium-item--1 .lb-podium-name { font-size: 0.82rem; }
  .lb-podium-score { font-size: 0.78rem; }
  .lb-row { padding: 0.55rem 0.8rem; }
  .lb-row-name { font-size: 0.82rem; }
  .lb-row-score { font-size: 0.82rem; }
}
</style>
