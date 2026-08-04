<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import GuessTable from "@/components/game/GuessTable.vue";
import type { MultiplayerRoomState } from "@/types/game";

const router = useRouter();
const roomState = ref<MultiplayerRoomState | null>(null);
const matchDelta = ref(0);

onMounted(() => {
  const raw = sessionStorage.getItem("phrolova_match_result");
  if (!raw) {
    router.replace({ name: "multi-lobby" });
    return;
  }
  try {
    const data = JSON.parse(raw);
    roomState.value = data.roomState;
    matchDelta.value = data.scoreDelta ?? 0;
  } catch {
    router.replace({ name: "multi-lobby" });
  }
});

const matchResultText = computed(() => {
  if (matchDelta.value > 0) return "胜利";
  if (matchDelta.value < 0) return "失败";
  return "平局";
});

const matchScoreText = computed(() => {
  if (!matchDelta.value) return "";
  return matchDelta.value > 0 ? `+${matchDelta.value} 分` : `${matchDelta.value} 分`;
});

const resultIcon = computed(() => {
  if (matchResultText.value === "胜利") return "ph:crown-fill";
  if (matchResultText.value === "平局") return "ph:handshake-duotone";
  return "ph:hand-waving-duotone";
});

function backToLobby() {
  sessionStorage.removeItem("phrolova_match_result");
  router.push({ name: "multi-lobby" });
}
</script>

<template>
  <div class="mrp-screen" v-if="roomState">
    <header class="mrp-header">
      <Icon :icon="resultIcon" class="mrp-header-icon" :class="{ 'mrp-header-icon--win': matchResultText === '胜利' }" />
      <h1 class="mrp-title" :class="{ 'mrp-title--win': matchResultText === '胜利' }">{{ matchResultText }}</h1>
      <p v-if="matchScoreText" class="mrp-score">{{ matchScoreText }}</p>
      <p class="mrp-sub">第 {{ roomState.round }} 局 · {{ roomState.quizType === "skeleton" ? "声骸" : "共鸣者" }}模式</p>
      <button class="mrp-back" @click="backToLobby">返回大厅</button>
    </header>

    <main class="mrp-body">
      <section v-for="entry in roomState.roundHistory" :key="entry.round" class="mrp-round">
        <h2 class="mrp-round-label">第 {{ entry.round }} 局</h2>
        <div class="mrp-round-boards">
          <div class="mrp-board">
            <h3 class="mrp-board-title">我的猜测</h3>
            <GuessTable
              :quiz-type="roomState.quizType"
              :rows="(entry.players[0]?.guesses as any) ?? []"
              empty-label="-"
              :target-version="entry.target ? ('version' in entry.target ? Number((entry.target as any).version) : null) : roomState.targetVersion"
              :target-cost="entry.target ? ('cost' in entry.target ? Number((entry.target as any).cost) : null) : roomState.targetCost"
            />
          </div>
          <div class="mrp-board">
            <h3 class="mrp-board-title">对手猜测</h3>
            <GuessTable
              :quiz-type="roomState.quizType"
              :rows="(entry.players[1]?.guesses as any) ?? []"
              empty-label="-"
              :target-version="entry.target ? ('version' in entry.target ? Number((entry.target as any).version) : null) : roomState.targetVersion"
              :target-cost="entry.target ? ('cost' in entry.target ? Number((entry.target as any).cost) : null) : roomState.targetCost"
            />
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.mrp-screen {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--shell-bg);
  color: var(--text-main);
}

.mrp-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 2rem 1.5rem 1.5rem;
  border-bottom: 1px solid var(--line-soft);
  background: color-mix(in oklab, var(--surface-panel-strong) 60%, transparent);
}

.mrp-header-icon {
  font-size: 2.6rem;
  color: var(--text-sub);
}
.mrp-header-icon--win { color: var(--gold); }

.mrp-title {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 900;
  letter-spacing: 0.06em;
}
.mrp-title--win { color: var(--gold); }

.mrp-score {
  margin: 0;
  color: var(--gold);
  font-size: 1.15rem;
  font-weight: 700;
}

.mrp-sub {
  margin: 0;
  color: var(--text-sub);
  font-size: 0.85rem;
}

.mrp-back {
  margin-top: 0.6rem;
  padding: 0.55rem 1.6rem;
  border: 1px solid color-mix(in oklab, var(--gold) 40%, transparent);
  border-radius: 8px;
  background: color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong));
  color: var(--gold);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
.mrp-back:hover {
  background: color-mix(in oklab, var(--gold) 26%, var(--surface-panel-strong));
}

.mrp-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding: 1.5rem clamp(1rem, 4vw, 3rem);
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.mrp-round {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: color-mix(in oklab, var(--surface-panel) 50%, transparent);
}

.mrp-round-label {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--gold);
  letter-spacing: 0.06em;
}

.mrp-round-boards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.mrp-board {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.mrp-board-title {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-sub);
  letter-spacing: 0.04em;
}

.mrp-board :deep(.guess-table-shell) {
  max-height: none;
  overflow: auto;
}

@media (max-width: 720px) {
  .mrp-body { padding: 1rem 0.5rem; }
  .mrp-round { padding: 0.6rem; }
  .mrp-round-boards { grid-template-columns: 1fr; gap: 0.6rem; }
  .mrp-board :deep(.guess-table-shell) { max-height: 260px; }
}
</style>
