<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";

import TabGroup from "@/components/shared/TabGroup.vue";
import type { QuizType, TabOption } from "@/types";
import { useAuthStore } from "@/stores/auth";
import * as api from "@/api";

const authStore = useAuthStore();
const router = useRouter();
const loading = shallowRef(false);
const leaderboard = ref<Array<Record<string, unknown>>>([]);
const myInfo = ref<Record<string, unknown> | null>(null);

const mode = ref<"single" | "multi">("multi");
const quizType = ref<QuizType>("resonator");

const leaderTabs: TabOption[] = [
  { key: "multi", label: "多人对战" },
  { key: "single-resonator", label: "单人 · 共鸣者" },
  { key: "single-skeleton", label: "单人 · 声骸" },
];

const tabTitle = computed(() => {
  const t = leaderTabs.find(tab => {
    if (tab.key === "multi") return mode.value === "multi";
    if (tab.key === "single-resonator") return mode.value === "single" && quizType.value === "resonator";
    return mode.value === "single" && quizType.value === "skeleton";
  });
  return t?.label || "";
});

async function loadLeaderboard() {
  loading.value = true;
  try {
    const data = await api.fetchLeaderboard(authStore.playerId || undefined, mode.value, quizType.value);
    leaderboard.value = data.leaderboard as Array<Record<string, unknown>>;
    myInfo.value = data.my_info as Record<string, unknown> | null;
  } catch { /* silent */ }
  finally { loading.value = false; }
}

function selectTab(key: string) {
  if (key === "multi") { mode.value = "multi"; }
  else if (key === "single-resonator") { mode.value = "single"; quizType.value = "resonator"; }
  else { mode.value = "single"; quizType.value = "skeleton"; }
  loadLeaderboard();
}

onMounted(loadLeaderboard);
</script>

<template>
  <div class="lb-page">
    <header class="lb-top">
      <button class="back-btn" @click="router.push('/')">
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

    <TabGroup :tabs="leaderTabs" :active-key="mode === 'multi' ? 'multi' : quizType === 'resonator' ? 'single-resonator' : 'single-skeleton'" @select="selectTab" />

    <div class="lb-main">
      <div class="lb-card">
        <div v-if="loading" class="lb-loading">正在加载...</div>

        <template v-else-if="leaderboard.length">
          <div class="lb-podium">
            <div v-for="(row, index) in leaderboard.slice(0, 3)" :key="(row.player_id as string)" class="lb-podium-item" :class="[`lb-podium-item--${index + 1}`]">
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
            <div v-for="(row, index) in leaderboard.slice(3)" :key="(row.player_id as string)" class="lb-row">
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

