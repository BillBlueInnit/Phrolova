<script setup lang="ts">
import { computed } from "vue";

import type { MultiplayerRoomState } from "@/types/game";

const props = defineProps<{
  roomState: MultiplayerRoomState;
}>();

const roundLabel = computed(() => {
  if (props.roomState.roomStatus === "countdown") {
    return `匹配成功，${props.roomState.countdownLeft} 秒后开局`;
  }
  if (props.roomState.roomStatus === "finished") {
    return "整场已结束";
  }
  return `第 ${props.roomState.round} 局 / BO${props.roomState.bestOf}`;
});
</script>

<template>
  <section class="summary-band">
    <div class="summary-band-card">
      <span class="summary-band-label">房间号</span>
      <strong class="summary-band-value">{{ roomState.roomCode }}</strong>
    </div>
    <div class="summary-band-card">
      <span class="summary-band-label">模式</span>
      <strong class="summary-band-value">
        {{ roomState.quizType === "skeleton" ? "声骸" : "共鸣者" }} /
        {{ roomState.quizType === "skeleton" ? (roomState.difficulty === "easy" ? "简单" : "困难") : "标准" }}
      </strong>
    </div>
    <div class="summary-band-card">
      <span class="summary-band-label">状态</span>
      <strong class="summary-band-value">{{ roundLabel }}</strong>
    </div>
    <div class="summary-band-card">
      <span class="summary-band-label">剩余时间</span>
      <strong class="summary-band-value">{{ roomState.timeLeft || roomState.countdownLeft || 0 }} 秒</strong>
    </div>
  </section>
</template>

<style scoped>
.summary-band {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.35rem;
}

.summary-band-card {
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
}

.summary-band-label {
  display: block;
  color: var(--text-faint);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.summary-band-value {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.82rem;
  font-weight: 700;
}
</style>
