<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef, watch } from "vue";
import { useRouter } from "vue-router";
import gsap from "gsap";

import FeedbackLegend from "@/components/game/FeedbackLegend.vue";
import GuessTable from "@/components/game/GuessTable.vue";
import NameAutocompleteInput from "@/components/game/NameAutocompleteInput.vue";
import { useDictionaryStore } from "@/stores/dictionary";
import { useSingleGameStore } from "@/stores/singleGame";

const THEME_KEY = "phrolova_theme";

const dictionaryStore = useDictionaryStore();
const singleGameStore = useSingleGameStore();
const router = useRouter();
const guessName = shallowRef("");
const guessInputRef = useTemplateRef<{ focus: () => void }>("guessInput");

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
  if (!target) return "";
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

const isWin = computed(() => singleGameStore.resultMessage === "回答正确，本局已完成。");

const roundEndTitle = computed(() => {
  if (isWin.value) return "回答正确";
  if (singleGameStore.resultMessage === "已显示本局答案。") return "已揭晓答案";
  return "机会已用尽";
});

const showRoundEndModal = shallowRef(false);

watch(
  () => singleGameStore.gameOver,
  (over) => {
    if (over) showRoundEndModal.value = true;
  },
);

function closeRoundEndModal() {
  showRoundEndModal.value = false;
}

async function restartGame() {
  try {
    await singleGameStore.startGame();
    guessName.value = "";
    showRoundEndModal.value = false;
    gsap.from(".sg-stage", { opacity: 0, y: 16, duration: 0.4, ease: "power2.out" });
  } catch {
    return;
  }
}

async function submitGuess() {
  if (!guessName.value.trim()) return;
  try {
    await singleGameStore.submitGuess(guessName.value.trim());
    guessName.value = "";
    nextTick(() => guessInputRef.value?.focus());
  } catch {
    guessInputRef.value?.focus();
    return;
  }
}

onMounted(async () => {
  await dictionaryStore.ensureLoaded(singleGameStore.quizType);
  await restartGame();
  gsap.from(".sg-glass-header", { opacity: 0, y: -20, duration: 0.45, ease: "power2.out" });
});
</script>

<template>
  <div class="sg-screen">
    <div class="sg-shell">
      <!-- ── 毛玻璃 Header ── -->
      <header class="sg-glass-header">
        <div class="sg-glass-left">
          <button class="sg-glass-back" @click="router.push('/single')" aria-label="返回模式选择">
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

      <!-- ── 居中比分 ── -->
      <div class="sg-score-bar">
        <div class="sg-score-item">
          <span class="sg-score-label">已猜</span>
          <span class="sg-score-value">{{ singleGameStore.attemptsUsed }}</span>
        </div>
        <div class="sg-score-divider">/</div>
        <div class="sg-score-item">
          <span class="sg-score-label">上限</span>
          <span class="sg-score-value">{{ singleGameStore.attemptsLimit }}</span>
        </div>
        <div class="sg-score-divider sg-score-divider--gap">·</div>
        <div class="sg-score-item">
          <span class="sg-score-label">剩余</span>
          <span class="sg-score-value sg-score-value--accent">{{ singleGameStore.attemptsLeft }}</span>
        </div>
      </div>

      <!-- ── 中部：游戏面板 ── -->
      <section class="sg-stage">
        <div class="sg-stage-head">
          <div class="sg-stage-copy">
            <p class="sg-stage-kicker">PLAYFIELD</p>
            <h2 class="sg-stage-title">{{ hasGuessHistory ? "猜测记录" : stagePromptTitle }}</h2>
            <p class="sg-stage-sub">{{ hasGuessHistory ? "" : stagePromptSubtitle }}</p>
          </div>
          <FeedbackLegend v-if="hasGuessHistory" />
        </div>

        <div class="sg-stage-body" :class="{ 'sg-stage-body--empty': !hasGuessHistory }">
          <div v-if="!hasGuessHistory" class="sg-empty-state">
            <div class="sg-empty-glyph"><Icon icon="ph:target-duotone" aria-hidden="true" /></div>
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
            <Icon icon="ph:keyboard-duotone" class="sg-dock-label-icon" aria-hidden="true" /> 提交猜测
          </span>
          <span class="sg-dock-meta">{{ singleGameStore.loading ? "正在处理本次猜测" : stagePromptTitle }}</span>
        </div>

        <div class="sg-input-row">
          <NameAutocompleteInput
            ref="guessInput"
            v-model="guessName"
            :disabled="!singleGameStore.canSubmit || singleGameStore.loading"
            :names="currentNames"
            :quiz-type="singleGameStore.quizType"
            :placeholder="singleGameStore.quizType === 'skeleton' ? '输入声骸名称' : '输入角色昵称'"
            @submit="submitGuess"
          />
          <button class="sg-btn sg-btn-submit" :disabled="!singleGameStore.canSubmit || singleGameStore.loading" @click="submitGuess">
            <Icon icon="ph:paper-plane-right-duotone" class="sg-btn-icon" aria-hidden="true" /> 提交
          </button>
        </div>
      </footer>
    </div>

    <Teleport to="body">
      <div v-if="showRoundEndModal" class="win-overlay" @click.self="closeRoundEndModal">
        <div class="win-modal">
          <div class="win-icon" :class="{ 'win-icon--win': isWin, 'win-icon--lose': !isWin }">
            <Icon :icon="isWin ? 'ph:crown-duotone' : 'ph:eye-duotone'" aria-hidden="true" />
          </div>
          <h2 class="win-title">{{ roundEndTitle }}</h2>
          <p class="win-answer-label">正确答案</p>
          <p class="win-answer">{{ answerText }}</p>
          <p v-if="isWin" class="win-attempts">仅用 {{ singleGameStore.attemptsUsed }} 次猜测</p>
          <p v-if="singleGameStore.earnedScore" class="win-score">+{{ singleGameStore.earnedScore }} 分</p>
          <div class="win-actions">
            <button class="win-btn win-btn-primary" @click="restartGame">再来一局</button>
            <button class="win-btn" @click="router.push('/single')">返回模式选择</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.sg-screen {
  width: 100vw; height: 100dvh;
  margin-left: calc(50% - 50vw); max-width: 100vw;
  overflow: hidden;
}

.sg-shell {
  height: 100dvh;
  max-width: 1400px;
  margin: 0 auto;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 0.8rem;
  padding: 0.8rem clamp(1rem, 4vw, 3rem) 0.8rem;
  overflow: hidden;
}

/* ── Header ── */
.sg-glass-header {
  display: flex; align-items: center; justify-content: space-between; gap: 0.8rem;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--line-soft); border-radius: 10px;
  background: color-mix(in oklab, var(--surface-panel-strong) 72%, transparent);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 4px 24px color-mix(in oklab, var(--shadow-plate) 40%, transparent);
}

.sg-glass-left { display: flex; align-items: center; gap: 0.7rem; min-width: 0; flex: 1; }
.sg-glass-back {
  display: grid; place-items: center; width: 2.2rem; height: 2.2rem;
  border: 1px solid var(--line-strong); border-radius: 8px;
  background: color-mix(in oklab, var(--surface-panel) 60%, transparent);
  color: var(--text-sub); font-size: 1.1rem; cursor: pointer; flex-shrink: 0;
  transition: color 0.2s, border-color 0.2s;
}
.sg-glass-back:hover { color: var(--gold); border-color: var(--gold); }

.sg-glass-info { display: grid; gap: 0.1rem; min-width: 0; }
.sg-glass-kicker { color: var(--text-faint); font-size: 0.65rem; letter-spacing: 0.22em; text-transform: uppercase; }
.sg-glass-title { color: var(--text-main); font-size: 0.88rem; font-weight: 700; letter-spacing: 0.05em; }

.sg-glass-actions { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
.sg-glass-btn {
  display: grid; place-items: center; width: 2.2rem; height: 2.2rem;
  border: 1px solid var(--line-strong); border-radius: 8px;
  background: color-mix(in oklab, var(--surface-panel) 60%, transparent);
  color: var(--text-sub); font-size: 1.1rem; cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.sg-glass-btn:hover { color: var(--gold); border-color: var(--gold); }
.sg-glass-theme { color: var(--gold-soft); }

/* ── 居中比分 ── */
.sg-score-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.2rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
}

.sg-score-item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5rem;
}

.sg-score-label {
  color: var(--text-faint);
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.sg-score-value {
  color: var(--text-main);
  font-size: clamp(1.8rem, 1.4rem + 1.6vw, 2.8rem);
  font-weight: 900;
  font-family: 'Rajdhani', sans-serif;
  letter-spacing: 0.02em;
  line-height: 1;
  min-width: 1.2em;
  text-align: center;
}

.sg-score-value--accent {
  color: var(--gold);
}

.sg-score-divider {
  color: var(--text-faint);
  font-size: 1.6rem;
  font-weight: 700;
  font-family: 'Rajdhani', sans-serif;
  line-height: 1;
}

.sg-score-divider--gap {
  margin: 0 0.3rem;
}

/* ── 中部面板 ── */
.sg-stage {
  min-height: 0;
  display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 0.6rem;
  padding: 0.9rem 0.9rem 0.8rem;
  border: 1px solid var(--line-soft); border-radius: 10px;
  background: radial-gradient(circle at 50% 18%, color-mix(in oklab, var(--gold) 8%, transparent), transparent 22%),
              linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  overflow: hidden;
}

.sg-stage-head { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.8rem; }
.sg-stage-copy { display: grid; gap: 0.22rem; }
.sg-stage-kicker { margin: 0; color: var(--text-faint); font-size: 0.68rem; letter-spacing: 0.22em; text-transform: uppercase; }
.sg-stage-title, .sg-empty-title { margin: 0; font-size: clamp(1.18rem, 1rem + 0.6vw, 1.7rem); font-weight: 900; letter-spacing: 0.04em; }
.sg-stage-sub, .sg-empty-sub, .sg-dock-meta { margin: 0; color: var(--text-sub); font-size: 0.84rem; line-height: 1.6; }

.sg-stage-body { min-height: 0; display: flex; flex-direction: column; overflow: auto; }
.sg-stage-body--empty { align-items: center; justify-content: center; overflow: hidden; }
.sg-empty-state { max-width: 600px; display: grid; justify-items: center; gap: 0.7rem; text-align: center; }
.sg-empty-glyph {
  display: grid; place-items: center; width: 3.2rem; height: 3.2rem;
  border: 1px solid color-mix(in oklab, var(--line-strong) 90%, transparent); border-radius: 999px;
  color: var(--text-faint); font-size: 1.2rem;
}
.sg-stage-body :deep(.guess-table-shell) { height: 100%; overflow: auto; }

/* ── 底部 dock ── */
.sg-dock {
  display: flex; align-items: center; gap: 0.8rem; flex-wrap: nowrap;
  padding: 0.75rem 0.9rem 0.85rem;
  border: 1px solid var(--line-soft); border-radius: 10px;
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
}
.sg-dock-copy { display: grid; gap: 0.18rem; flex-shrink: 0; }
.sg-dock-label { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--text-faint); font-size: 0.68rem; letter-spacing: 0.2em; text-transform: uppercase; }
.sg-dock-label-icon { font-size: 0.95rem; color: var(--gold-soft); }

.sg-input-row { flex: 1; min-width: 0; display: flex; gap: 0.5rem; }
.sg-input-row > :first-child { flex: 1; min-width: 0; }

.sg-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.5rem 1rem;
  border: 1px solid color-mix(in oklab, var(--gold) 40%, transparent); border-radius: 6px;
  background: color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong));
  color: var(--gold); font-size: 0.85rem; font-weight: 600; cursor: pointer;
  transition: background 0.2s; white-space: nowrap;
}
.sg-btn:hover { background: color-mix(in oklab, var(--gold) 24%, var(--surface-panel-strong)); }
.sg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sg-btn-submit { padding-inline: 1.1rem; }
.sg-btn-icon { font-size: 1rem; flex-shrink: 0; }

/* ── 响应式 ── */
@media (max-width: 720px) {
  .sg-shell {
    padding: 0.4rem 0.6rem;
    gap: 0.4rem;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
  }

  .sg-glass-header {
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
    padding: 0.5rem 0.7rem;
  }

  .sg-score-bar {
    gap: 0.8rem;
    padding: 0.4rem 0.6rem;
    border-radius: 0;
    border-left: none;
    border-right: none;
  }

  .sg-score-label { font-size: 0.72rem; }
  .sg-score-value { font-size: 1.6rem; }
  .sg-score-divider { font-size: 1.3rem; }

  .sg-stage {
    border: none;
    border-radius: 0;
    padding: 0.6rem 0.7rem;
  }

  .sg-stage-head {
    gap: 0.4rem;
  }

  .sg-stage-kicker { font-size: 0.62rem; }
  .sg-stage-title, .sg-empty-title { font-size: 1rem; }
  .sg-stage-sub, .sg-empty-sub { font-size: 0.76rem; line-height: 1.5; }

  .sg-empty-glyph {
    width: 2.6rem; height: 2.6rem; font-size: 1rem;
  }

  .sg-dock {
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-bottom: none;
    padding: 0.6rem 0.7rem 0.8rem;
  }

  .sg-dock-copy { display: none; }

  .sg-input-row {
    flex-direction: row;
    width: 100%;
  }

  .sg-input-row > :first-child { flex: 1; }

  .sg-btn-submit {
    padding: 0.55rem 1rem;
    font-size: 0.88rem;
  }
}

@media (max-width: 480px) {
  .sg-stage { padding: 0.5rem 0.55rem; }
  .sg-dock { padding: 0.5rem 0.55rem 0.65rem; }
  .sg-input-row { gap: 0.4rem; }
  .sg-btn-submit { padding: 0.55rem 0.8rem; }
}

/* ── Round End Modal ── */
.win-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(6px);
  animation: winFadeIn 0.25s ease;
}

.win-modal {
  position: relative; overflow: hidden;
  display: grid; justify-items: center; gap: 0.85rem;
  width: 100%; max-width: 380px; padding: 2.2rem 1.8rem 1.8rem;
  border: 1px solid color-mix(in oklab, var(--gold) 30%, transparent);
  border-radius: 12px;
  background: var(--surface-panel-strong);
  text-align: center;
  animation: winSlideUp 0.35s ease;
}

.win-icon {
  display: grid; place-items: center;
  width: 3.6rem; height: 3.6rem;
  border: 2px solid var(--gold); border-radius: 50%;
  background: color-mix(in oklab, var(--gold) 16%, var(--shell-bg-deep));
  color: var(--gold); font-size: 1.8rem;
}

.win-title {
  margin: 0; font-size: 1.4rem; font-weight: 900; letter-spacing: 0.08em; color: var(--gold);
}

.win-answer-label {
  margin: 0; color: var(--text-faint); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.2em; text-transform: uppercase;
}

.win-answer {
  margin: 0; color: var(--text-main); font-size: 1.1rem; font-weight: 700; letter-spacing: 0.04em;
}

.win-attempts {
  margin: 0; color: var(--text-sub); font-size: 0.9rem;
}

.win-score {
  margin: 0; color: var(--gold); font-size: 1.4rem; font-weight: 900; letter-spacing: 0.04em;
}

.win-actions {
  display: flex; flex-direction: column; gap: 0.5rem; width: 100%; margin-top: 0.4rem;
}

.win-btn {
  min-height: 44px;
  border: 1px solid var(--line-strong); border-radius: 8px;
  background: var(--surface-panel);
  color: var(--text-sub); font-size: 0.9rem; font-weight: 600; cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.win-btn:hover { border-color: var(--gold); color: var(--text-main); }

.win-btn-primary {
  border-color: color-mix(in oklab, var(--gold) 40%, transparent);
  background: color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong));
  color: var(--gold);
}
.win-btn-primary:hover { background: color-mix(in oklab, var(--gold) 26%, var(--surface-panel-strong)); }

@keyframes winFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes winSlideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
</style>
