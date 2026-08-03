<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";

import { useAuthStore } from "@/stores/auth";
import * as api from "@/api";

const authStore = useAuthStore();
const router = useRouter();
const loading = shallowRef(false);
const leaderboard = ref<LeaderboardResponse["leaderboard"]>([]);

async function loadLeaderboard() {
  loading.value = true;
  try {
    const data = await api.fetchLeaderboard(authStore.playerId || undefined);
    leaderboard.value = data.leaderboard;
  } catch {
    // silent
  } finally {
    loading.value = false;
  }
}

onMounted(loadLeaderboard);
</script>

<template>
  <div class="lb-screen">
    <button class="lb-back" @click="router.push('/')">
      <span class="lb-back-arrow">&lt;</span> BACK
    </button>

    <div class="lb-layout">
      <aside class="lb-left">
        <div class="lb-card lb-card--full">
          <p class="lb-card-kicker">PLAYER</p>
          <div class="lb-card-body">
            <div class="lb-stat">
              <span class="lb-stat-key">ID</span>
              <span class="lb-stat-val">{{ authStore.playerId || "—" }}</span>
            </div>
            <div class="lb-stat">
              <span class="lb-stat-key">积分</span>
              <span class="lb-stat-val lb-stat-val--gold">{{ authStore.stats.score }}</span>
            </div>
          </div>
        </div>
      </aside>

      <div class="lb-right">
        <div class="lb-card lb-card--table">
          <p class="lb-card-kicker">RANKING</p>
          <div class="lb-rows">
            <div
              v-for="(row, index) in leaderboard"
              :key="row.player_id"
              class="lb-row"
              :class="{ 'lb-row--top': index < 3 }"
            >
              <span class="lb-row-rank">{{ index + 1 }}</span>
              <span class="lb-row-name">{{ row.player_id }}</span>
              <span class="lb-row-score">{{ row.score }}</span>
              <span class="lb-row-rate">{{ row.win_rate }}%</span>
            </div>
            <p v-if="!leaderboard.length && !loading" class="lb-row-empty">暂无排行数据</p>
            <p v-if="loading" class="lb-row-empty">正在加载...</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lb-screen {
  position: relative;
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--site-header-height) - 6.25rem);
  width: 100%;
  padding: 2rem 1.5rem 1.5rem;
}

.lb-back {
  align-self: flex-start;
  margin-bottom: 1.2rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--shell-bg-deep);
  color: var(--text-main);
  font-family: 'Rajdhani', sans-serif;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  backdrop-filter: blur(4px);
  transition: color 0.3s ease, border-color 0.3s ease;
}

.lb-back:hover {
  color: var(--gold);
  border-color: var(--gold);
}

.lb-back-arrow { font-size: 1.2rem; }

.lb-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 1.5rem;
  padding: 0;
  min-height: 0;
}

.lb-left { display: flex; flex-direction: column; min-height: 0; }
.lb-right { min-height: 0; display: flex; }

.lb-card {
  padding: 1.2rem 1.3rem;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  background: var(--surface-panel);
}

.lb-card--full { flex: 1; display: flex; flex-direction: column; }

.lb-card--table {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.lb-card--table .lb-card-kicker {
  padding: 1.2rem 1.3rem 0.9rem;
  border-bottom: 1px solid var(--line-soft);
  margin: 0;
  font-size: 0.8rem;
}

.lb-card-kicker {
  margin: 0 0 1rem;
  color: var(--text-faint);
  font-weight: 600;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}

.lb-card-body { display: flex; flex-direction: column; gap: 1rem; flex: 1; justify-content: center; }

.lb-stat { display: flex; justify-content: space-between; align-items: baseline; }
.lb-stat-key { color: var(--text-faint); font-size: 1rem; letter-spacing: 0.08em; }
.lb-stat-val { font-weight: 900; font-size: 1.5rem; letter-spacing: 0.1em; }
.lb-stat-val--gold { color: var(--gold); }

.lb-rows { flex: 1; overflow-y: auto; }

.lb-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.95rem 1.3rem;
  border-bottom: 1px solid var(--line-soft);
  transition: background 0.2s ease;
}

.lb-row:last-child { border-bottom: none; }
.lb-row:hover { background: color-mix(in oklab, var(--text-main) 3%, transparent); }
.lb-row--top { background: color-mix(in oklab, var(--gold) 5%, transparent); }
.lb-row--top:hover { background: color-mix(in oklab, var(--gold) 9%, transparent); }

.lb-row-rank { width: 3rem; font-weight: 900; color: var(--text-faint); font-size: 1.2rem; letter-spacing: 0.04em; }
.lb-row--top .lb-row-rank { color: var(--gold); }
.lb-row-name { flex: 1; font-weight: 900; font-size: 1.2rem; letter-spacing: 0.1em; }
.lb-row-score { font-weight: 900; color: var(--gold); font-size: 1.2rem; letter-spacing: 0.08em; min-width: 5rem; text-align: right; }
.lb-row-rate { color: var(--text-sub); font-weight: 600; font-size: 1.05rem; letter-spacing: 0.08em; min-width: 4.5rem; text-align: right; }

.lb-row-empty { margin: 0; padding: 2.5rem 1rem; text-align: center; color: var(--text-faint); font-size: 0.88rem; }

/* ── mobile ── */
@media (max-width: 960px) {
  .lb-screen { padding: 1rem; }

  .lb-back {
    margin-bottom: 0.8rem;
    font-size: 0.95rem;
    padding: 0.45rem 0.8rem;
  }

  .lb-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    gap: 1rem;
  }

  .lb-left { min-height: auto; }
  .lb-card--full { flex: none; }
  .lb-right { min-height: 300px; }

  .lb-row { padding: 0.75rem 1rem; gap: 0.6rem; }
  .lb-row-rank { width: 2rem; font-size: 1rem; }
  .lb-row-name { font-size: 1rem; letter-spacing: 0.04em; }
  .lb-row-score { font-size: 1rem; min-width: 4rem; }
  .lb-row-rate { font-size: 0.9rem; min-width: 3.5rem; }
}

@media (max-width: 480px) {
  .lb-stat-val { font-size: 1.2rem; }
  .lb-card { padding: 1rem; }
  .lb-row-rank { width: 1.5rem; font-size: 0.88rem; }
  .lb-row-name { font-size: 0.88rem; }
  .lb-row-score { font-size: 0.88rem; min-width: 3.5rem; }
  .lb-row-rate { font-size: 0.78rem; min-width: 3rem; }
}
</style>
