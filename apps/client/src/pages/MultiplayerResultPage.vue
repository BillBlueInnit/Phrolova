<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import GuessTable from "@/components/game/GuessTable.vue";
import { readLocalStorage, removeLocalStorage } from "@/composables/useStorage";
import type { MultiplayerRoomState } from "@/types";

const router = useRouter();
const roomState = ref<MultiplayerRoomState | null>(null);
const matchDelta = ref(0);

onMounted(() => {
  const data = readLocalStorage<{ roomState: MultiplayerRoomState; scoreDelta: number } | null>("phrolova_match_result", null);
  if (!data) {
    router.replace({ name: "multi-lobby" });
    return;
  }
  roomState.value = data.roomState;
  matchDelta.value = data.scoreDelta ?? 0;
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
  removeLocalStorage("phrolova_match_result");
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

