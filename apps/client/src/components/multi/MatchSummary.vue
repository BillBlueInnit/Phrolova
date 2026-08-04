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

const modeLabel = computed(() => {
  const type = props.roomState.quizType === "skeleton" ? "声骸" : "共鸣者";
  const diff = props.roomState.quizType === "skeleton"
    ? (props.roomState.difficulty === "easy" ? "简单" : "困难")
    : "标准";
  return `${type} / ${diff}`;
});

const timeLabel = computed(() => `${props.roomState.timeLeft || props.roomState.countdownLeft || 0} 秒`);
</script>

<template>
  <section class="summary-band">
    <div class="summary-item">
      <span class="summary-label">房间号</span>
      <strong class="summary-value">{{ roomState.roomCode }}</strong>
    </div>
    <span class="summary-sep" />
    <div class="summary-item">
      <span class="summary-label">模式</span>
      <strong class="summary-value">{{ modeLabel }}</strong>
    </div>
    <span class="summary-sep" />
    <div class="summary-item">
      <span class="summary-label">状态</span>
      <strong class="summary-value">{{ roundLabel }}</strong>
    </div>
    <span class="summary-sep" />
    <div class="summary-item">
      <span class="summary-label">剩余时间</span>
      <strong class="summary-value">{{ timeLabel }}</strong>
    </div>
  </section>
</template>

<style scoped>
.summary-band {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}

.summary-label {
  color: var(--text-faint);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.summary-value {
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary-sep {
  flex-shrink: 0;
  width: 1px;
  height: 1.4rem;
  background: var(--line-soft);
}

@media (max-width: 720px) {
  .summary-band { gap: 0.3rem; }
  .summary-label { font-size: 0.5rem; letter-spacing: 0.04em; }
  .summary-value { font-size: 0.65rem; }
  .summary-sep { height: 1rem; }
}
</style>
