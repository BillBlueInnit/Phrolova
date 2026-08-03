<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import gsap from "gsap";

import FeedbackLegend from "@/components/game/FeedbackLegend.vue";
import GuessTable from "@/components/game/GuessTable.vue";
import NameAutocompleteInput from "@/components/game/NameAutocompleteInput.vue";
import StatusBanner from "@/components/shared/StatusBanner.vue";
import { useDictionaryStore } from "@/stores/dictionary";
import { useSingleGameStore } from "@/stores/singleGame";
import type { Difficulty, QuizType } from "@/types/game";

const THEME_KEY = "phrolova_theme";

const dictionaryStore = useDictionaryStore();
const singleGameStore = useSingleGameStore();
const router = useRouter();
const guessName = shallowRef("");

const currentTheme = ref<"phrolova-light" | "phrolova-night">(
  (localStorage.getItem(THEME_KEY) as "phrolova-light" | "phrolova-night") || "phrolova-light",
);

function toggleTheme() {
  const next = currentTheme.value === "phrolova-light" ? "phrolova-night" : "phrolova-light";
  currentTheme.value = next;
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
}

const currentNames = computed(() =>
  singleGameStore.quizType === "skeleton" ? dictionaryStore.skeletonNames : dictionaryStore.resonatorNames,
);

const modeTitle = computed(() => {
  if (singleGameStore.quizType === "skeleton") return `声骸推演 / ${singleGameStore.difficulty === "easy" ? "简单" : "困难"}`;
  return "共鸣者推演 / 标准";
});

const targetVersion = computed(() => {
  if (singleGameStore.quizType !== "resonator" || !singleGameStore.target || !("version" in singleGameStore.target)) return null;
  return Number(singleGameStore.target.version);
});

const targetCost = computed(() => {
  if (singleGameStore.quizType !== "skeleton" || !singleGameStore.target || !("cost" in singleGameStore.target)) return null;
  return Number(singleGameStore.target.cost);
});

const answerText = computed(() => {
  const target = singleGameStore.target;
  if (!target || !singleGameStore.answerVisible) return "";
  return singleGameStore.quizType === "skeleton"
    ? `${target.name} / COST ${target.cost} / ${target.skill_attribute}`
    : `${target.name} / ${target.attribute} / ${target.weapon} / ${target.version}`;
});

const hasGuessHistory = computed(() => singleGameStore.guessHistory.length > 0);

const stagePromptTitle = computed(() =>
  singleGameStore.quizType === "skeleton" ? "在下方输入声骸名称开始猜测" : "在下方输入角色昵称开始猜测",
);

const stagePromptSubtitle = computed(() =>
  singleGameStore.quizType === "skeleton"
    ? "根据 COST、属性、异相与套装反馈逐步缩小范围"
    : "绿色正确，黄色接近，箭头提示目标数值方向",
);

const attemptSummary = computed(
  () => `已猜 ${singleGameStore.attemptsUsed} / ${singleGameStore.attemptsLimit} · 剩余 ${singleGameStore.attemptsLeft} 次`,
);

async function applyConfig(quizType: QuizType, difficulty: Difficulty) {
  singleGameStore.setConfig(quizType, difficulty);
  await dictionaryStore.ensureLoaded(quizType);
}

async function restartGame() {
  try {
    await singleGameStore.startGame();
    guessName.value = "";
    animateStageIn();
  } catch {
    return;
  }
}

function animateStageIn() {
  const stage = document.querySelector(".sg-stage") as HTMLElement | null;
  if (stage) {
    gsap.from(stage, { opacity: 0, y: 16, duration: 0.4, ease: "power2.out" });
  }
}

async function submitGuess() {
  if (!guessName.value.trim()) return;
  try {
    await singleGameStore.submitGuess(guessName.value.trim());
    guessName.value = "";
  } catch {
    return;
  }
}

watch(
  () => singleGameStore.quizType,
  async (quizType) => {
    await dictionaryStore.ensureLoaded(quizType);
  },
  { immediate: true },
);

onMounted(async () => {
  await restartGame();
});
</script>

<template>
  <div class="sg-screen">
    <div class="sg-shell">
      <!-- ── 毛玻璃 Header ── -->
      <header class="sg-glass-header">
        <div class="sg-glass-left">
          <button class="sg-glass-back" @click="router.push('/')" aria-label="返回主页">
            <Icon icon="ph:arrow-left-duotone" aria-hidden="true" />
          </button>
          <div class="sg-glass-info">
            <span class="sg-glass-kicker">单人 · 猜测模式</span>
            <span class="sg-glass-title">{{ modeTitle }}</span>
          </div>
        </div>

        <div class="sg-glass-actions">
          <button class="sg-glass-btn" @click="singleGameStore.revealAnswer()" title="查看答案">
            <Icon icon="ph:eye-duotone" aria-hidden="true" />
          </button>
          <button class="sg-glass-btn" @click="restartGame" title="重新开始">
            <Icon icon="ph:arrow-counter-clockwise-duotone" aria-hidden="true" />
          </button>
          <button class="sg-glass-btn sg-glass-theme" @click="toggleTheme" :title="currentTheme === 'phrolova-light' ? '暗色模式' : '亮色模式'">
            <Icon :icon="currentTheme === 'phrolova-light' ? 'ph:moon-duotone' : 'ph:sun-duotone'" aria-hidden="true" />
          </button>
        </div>
      </header>

      <!-- ── Tab & Stats 行 ── -->
      <div class="sg-utility-row">
        <div class="sg-tab-groups">
          <div class="sg-tabs">
            <button class="sg-tab" :class="{ 'sg-tab--active': singleGameStore.quizType === 'resonator' }" @click="applyConfig('resonator', 'hard')">共鸣者</button>
            <button class="sg-tab" :class="{ 'sg-tab--active': singleGameStore.quizType === 'skeleton' }" @click="applyConfig('skeleton', singleGameStore.difficulty)">声骸</button>
          </div>

          <div v-if="singleGameStore.quizType === 'skeleton'" class="sg-tabs">
            <button class="sg-tab" :class="{ 'sg-tab--active': singleGameStore.difficulty === 'easy' }" @click="applyConfig('skeleton', 'easy')">简单</button>
            <button class="sg-tab" :class="{ 'sg-tab--active': singleGameStore.difficulty === 'hard' }" @click="applyConfig('skeleton', 'hard')">困难</button>
          </div>
        </div>

        <div class="sg-stats">
          <span class="sg-stat-chip">
            <Icon icon="ph:hourglass-duotone" class="sg-chip-icon" aria-hidden="true" />
            剩余 {{ singleGameStore.attemptsLeft }} 次
          </span>
          <span class="sg-stat-chip">{{ attemptSummary }}</span>
        </div>
      </div>

      <!-- ── 状态提示 ── -->
      <div class="status-stack">
        <StatusBanner v-if="singleGameStore.error" :message="singleGameStore.error" tone="error" />
        <StatusBanner v-else-if="singleGameStore.resultMessage" :message="singleGameStore.resultMessage" tone="success" />
        <StatusBanner v-if="answerText" :message="`本局答案：${answerText}`" />
      </div>

      <!-- ── 中部：游戏面板 ── -->
      <section class="sg-stage">
        <div class="sg-stage-head">
          <div class="sg-stage-copy">
            <p class="sg-stage-kicker">PLAYFIELD</p>
            <h2 class="sg-stage-title">{{ hasGuessHistory ? "猜测记录" : stagePromptTitle }}</h2>
            <p class="sg-stage-sub">{{ hasGuessHistory ? attemptSummary : stagePromptSubtitle }}</p>
          </div>

          <FeedbackLegend v-if="hasGuessHistory" />
        </div>

        <div class="sg-stage-body" :class="{ 'sg-stage-body--empty': !hasGuessHistory }">
          <div v-if="!hasGuessHistory" class="sg-empty-state">
            <div class="sg-empty-glyph">
              <Icon icon="ph:target-duotone" aria-hidden="true" />
            </div>
            <h2 class="sg-empty-title">{{ stagePromptTitle }}</h2>
            <p class="sg-empty-sub">{{ stagePromptSubtitle }}</p>
            <FeedbackLegend />
          </div>

          <GuessTable
            v-else
            :quiz-type="singleGameStore.quizType"
            :rows="singleGameStore.guessHistory"
            empty-label=""
            :target-version="targetVersion"
            :target-cost="targetCost"
          />
        </div>
      </section>

      <!-- ── 底部：猜测输入区 ── -->
      <footer class="sg-dock">
        <div class="sg-dock-copy">
          <span class="sg-dock-label">
            <Icon icon="ph:keyboard-duotone" class="sg-dock-label-icon" aria-hidden="true" />
            提交猜测
          </span>
          <span class="sg-dock-meta">{{ singleGameStore.loading ? "正在处理本次猜测" : stagePromptTitle }}</span>
        </div>

        <div class="sg-input-row">
          <NameAutocompleteInput
            v-model="guessName"
            :disabled="!singleGameStore.canSubmit || singleGameStore.loading"
            :names="currentNames"
            :placeholder="singleGameStore.quizType === 'skeleton' ? '输入声骸名称' : '输入角色昵称'"
            @submit="submitGuess"
          />
          <button class="sg-btn sg-btn-submit" :disabled="!singleGameStore.canSubmit || singleGameStore.loading" @click="submitGuess">
            <Icon icon="ph:paper-plane-right-duotone" class="sg-btn-icon" aria-hidden="true" /> 提交
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.sg-screen {
  width: 100vw;
  height: 100dvh;
  margin-left: calc(50% - 50vw);
  max-width: 100vw;
  overflow: hidden;
}

.sg-shell {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  gap: 0.6rem;
  padding: 0.5rem 1rem 0.6rem;
  overflow: hidden;
}

/* ── 毛玻璃 Header ── */
.sg-glass-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: color-mix(in oklab, var(--surface-panel-strong) 72%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 4px 24px color-mix(in oklab, var(--shadow-plate) 40%, transparent);
}

.sg-glass-left {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;
}

.sg-glass-back {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: color-mix(in oklab, var(--surface-panel) 60%, transparent);
  color: var(--text-sub);
  font-size: 1.1rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.2s, border-color 0.2s;
}

.sg-glass-back:hover {
  color: var(--gold);
  border-color: var(--gold);
}

.sg-glass-info {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.sg-glass-kicker {
  color: var(--text-faint);
  font-size: 0.65rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sg-glass-title {
  color: var(--text-main);
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sg-glass-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.sg-glass-btn {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: color-mix(in oklab, var(--surface-panel) 60%, transparent);
  color: var(--text-sub);
  font-size: 1.1rem;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

.sg-glass-btn:hover {
  color: var(--gold);
  border-color: var(--gold);
}

.sg-glass-theme {
  color: var(--gold-soft);
}

.sg-glass-theme:hover {
  color: var(--gold);
}

/* ── 工具行 ── */
.sg-utility-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.sg-tab-groups,
.sg-tabs,
.sg-stats {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.sg-tabs {
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  background: var(--surface-panel);
  overflow: hidden;
}

.sg-tab {
  padding: 0.38rem 0.8rem;
  border: none;
  background: transparent;
  color: var(--text-sub);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.sg-tab--active {
  background: color-mix(in oklab, var(--gold) 14%, transparent);
  color: var(--gold);
  font-weight: 600;
}

.sg-stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 36px;
  padding: 0.38rem 0.75rem;
  border: 1px solid var(--line-soft);
  background: color-mix(in oklab, var(--gold) 4%, var(--surface-card));
  color: var(--text-sub);
  font-size: 0.8rem;
  border-radius: 6px;
}

.sg-chip-icon {
  font-size: 0.9rem;
  color: var(--gold-soft);
}

/* ── 中部面板 ── */
.sg-stage {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.6rem;
  padding: 0.9rem 0.9rem 0.8rem;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background:
    radial-gradient(circle at 50% 18%, color-mix(in oklab, var(--gold) 8%, transparent), transparent 22%),
    linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  overflow: hidden;
}

.sg-stage-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.sg-stage-copy {
  display: grid;
  gap: 0.22rem;
}

.sg-stage-kicker {
  margin: 0;
  color: var(--text-faint);
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.sg-stage-title,
.sg-empty-title {
  margin: 0;
  font-size: clamp(1.18rem, 1rem + 0.6vw, 1.7rem);
  font-weight: 900;
  letter-spacing: 0.04em;
}

.sg-stage-sub,
.sg-empty-sub,
.sg-dock-meta {
  margin: 0;
  color: var(--text-sub);
  font-size: 0.84rem;
  line-height: 1.6;
}

.sg-stage-body {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sg-stage-body--empty {
  align-items: center;
  justify-content: center;
}

.sg-empty-state {
  max-width: 600px;
  display: grid;
  justify-items: center;
  gap: 0.7rem;
  text-align: center;
}

.sg-empty-glyph {
  display: grid;
  place-items: center;
  width: 3.2rem;
  height: 3.2rem;
  border: 1px solid color-mix(in oklab, var(--line-strong) 90%, transparent);
  border-radius: 999px;
  color: var(--text-faint);
  font-size: 1.2rem;
}

.sg-stage-body :deep(.guess-table-shell) {
  height: 100%;
  overflow: auto;
}

/* ── 底部猜测区 ── */
.sg-dock {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  padding: 0.75rem 0.9rem 0.85rem;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  box-shadow: 6px 6px 0 var(--shadow-plate);
}

.sg-dock-copy {
  display: grid;
  gap: 0.18rem;
  min-width: min(100%, 14rem);
}

.sg-dock-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--text-faint);
  font-size: 0.68rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.sg-dock-label-icon {
  font-size: 0.95rem;
  color: var(--gold-soft);
}

.sg-input-row {
  flex: 1;
  display: flex;
  gap: 0.5rem;
}

.sg-input-row > :first-child {
  flex: 1;
}

/* ── 按钮 ── */
.sg-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.5rem 1rem;
  border: 1px solid color-mix(in oklab, var(--gold) 40%, transparent);
  border-radius: 6px;
  background: color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong));
  color: var(--gold);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.sg-btn:hover {
  background: color-mix(in oklab, var(--gold) 24%, var(--surface-panel-strong));
}

.sg-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sg-btn-submit {
  padding-inline: 1.1rem;
}

.sg-btn-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

@media (max-width: 720px) {
  .sg-shell {
    padding: 0.4rem 0.5rem 0.5rem;
    gap: 0.45rem;
  }

  .sg-glass-header {
    padding: 0.5rem 0.7rem;
  }

  .sg-stage {
    padding: 0.7rem 0.65rem 0.6rem;
  }

  .sg-dock {
    padding: 0.6rem 0.7rem 0.7rem;
  }

  .sg-input-row {
    flex-direction: column;
  }

  .sg-glass-title {
    font-size: 0.8rem;
  }
}

@media (max-width: 480px) {
  .sg-utility-row {
    flex-direction: column;
    align-items: stretch;
  }

  .sg-tab-groups, .sg-stats {
    justify-content: stretch;
  }

  .sg-tab, .sg-stat-chip {
    flex: 1;
    justify-content: center;
  }
}
</style>
