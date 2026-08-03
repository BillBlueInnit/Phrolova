<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import gsap from "gsap";

import FeedbackLegend from "@/components/game/FeedbackLegend.vue";
import GuessTable from "@/components/game/GuessTable.vue";
import NameAutocompleteInput from "@/components/game/NameAutocompleteInput.vue";
import MatchSummary from "@/components/multi/MatchSummary.vue";
import StatusBanner from "@/components/shared/StatusBanner.vue";
import { useAuthStore } from "@/stores/auth";
import { useDictionaryStore } from "@/stores/dictionary";
import { useMultiGameStore } from "@/stores/multiGame";

const THEME_KEY = "phrolova_theme";

let ctx: gsap.Context | null = null;

const authStore = useAuthStore();
const dictionaryStore = useDictionaryStore();
const multiGameStore = useMultiGameStore();
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

const names = computed(() =>
  multiGameStore.roomState?.quizType === "skeleton" ? dictionaryStore.skeletonNames : dictionaryStore.resonatorNames,
);

const battleTitle = computed(() => {
  if (!multiGameStore.roomState) return "实时对战";
  if (multiGameStore.roomState.quizType === "skeleton") {
    return `声骸对战 / ${multiGameStore.roomState.difficulty === "easy" ? "简单" : "困难"}`;
  }
  return "共鸣者对战 / 标准";
});

const stagePromptTitle = computed(() => {
  if (multiGameStore.roomState?.quizType === "skeleton") return "在下方输入声骸名称开始实时猜测";
  return "在下方输入角色昵称开始实时猜测";
});

const stagePromptSubtitle = computed(() => "对手名称保持遮罩，颜色反馈与回合状态由服务端同步推进。");

const hasBattleHistory = computed(() =>
  Boolean((multiGameStore.me?.guesses.length ?? 0) || (multiGameStore.opponent?.guesses.length ?? 0)),
);

const roomHintText = computed(() => {
  const roomState = multiGameStore.roomState;
  if (!roomState) return "";
  const timer = roomState.countdownLeft || roomState.timeLeft || 0;
  return `房间 ${roomState.roomCode} · 第 ${roomState.round} 局 / BO${roomState.bestOf} · 剩余 ${timer} 秒`;
});

const answerText = computed(() => multiGameStore.roomState?.target?.name ?? "");

const dockHintText = computed(() => {
  if (!multiGameStore.roomState) return "";
  if (multiGameStore.canGuess) return "当前轮到你提交猜测";
  return multiGameStore.roomState.roomStatus === "countdown" ? "对局即将开始" : "等待系统推进或对手行动";
});

const myWins = computed(() => multiGameStore.me?.roundWins ?? 0);
const opponentWins = computed(() => multiGameStore.opponent?.roundWins ?? 0);
const targetBestOf = computed(() => multiGameStore.roomState?.bestOf ?? 1);
const winsNeeded = computed(() => Math.ceil(targetBestOf.value / 2));

const showMatchResult = ref(false);
const matchResultSeen = ref(false);

watch(
  () => multiGameStore.roomState?.roomStatus,
  (status) => {
    if (status === "finished" && !matchResultSeen.value) {
      showMatchResult.value = true;
      matchResultSeen.value = true;
    }
    if (status !== "finished") {
      matchResultSeen.value = false;
    }
  },
);

const matchScoreDelta = ref(0);

const matchResultText = computed(() => {
  if (matchScoreDelta.value > 0) return "胜利";
  if (matchScoreDelta.value < 0) return "失败";
  return "平局";
});

const matchScoreText = computed(() => {
  const d = multiGameStore.matchScoreDelta;
  if (!d) return "";
  return d > 0 ? `+${d} 分` : `${d} 分`;
});

function closeMatchResult() {
  showMatchResult.value = false;
}

async function submitGuess() {
  if (!guessName.value.trim()) return;
  try {
    await multiGameStore.submitGuess(guessName.value.trim());
    guessName.value = "";
  } catch {
    return;
  }
}

async function leaveRoom() {
  await multiGameStore.leaveRoom().catch(() => undefined);
  router.push("/multi");
}

onMounted(async () => {
  nextTick(() => {
    ctx = gsap.context(() => {
      gsap.from(".mr-glass-header", { opacity: 0, y: -20, duration: 0.45, ease: "power2.out" });
      gsap.from(".mr-summary-row", { opacity: 0, y: 16, duration: 0.4, ease: "power2.out", delay: 0.08 });
      gsap.from(".mr-stage", { opacity: 0, y: 20, duration: 0.5, ease: "power2.out", delay: 0.14 });
      gsap.from(".mr-dock", { opacity: 0, y: 12, duration: 0.4, ease: "power2.out", delay: 0.2 });
    });
  });
  if (!authStore.isAuthenticated) {
    router.push("/auth");
    return;
  }
  await multiGameStore.resumeRoom().catch(() => undefined);
  if (multiGameStore.roomState) {
    await dictionaryStore.ensureLoaded(multiGameStore.roomState.quizType);
  }
});

onBeforeUnmount(() => {
  ctx?.revert();
});

watch(
  () => multiGameStore.roomState?.quizType,
  async (quizType) => {
    if (!quizType) return;
    await dictionaryStore.ensureLoaded(quizType);
  },
);
</script>

<template>
  <div class="mr-screen">
    <template v-if="multiGameStore.roomState">
      <div class="mr-shell">
        <!-- ── 毛玻璃 Header ── -->
        <header class="mr-glass-header">
          <div class="mr-glass-left">
            <button class="mr-glass-back" @click="router.push('/multi')" aria-label="返回大厅">
              <Icon icon="ph:arrow-left-duotone" aria-hidden="true" />
            </button>
            <div class="mr-glass-info">
              <span class="mr-glass-kicker">多人 · 房间对局</span>
              <span class="mr-glass-title">{{ battleTitle }}</span>
            </div>
          </div>

          <div class="mr-glass-actions">
            <span class="mr-glass-chip">{{ roomHintText }}</span>
            <button class="mr-glass-btn mr-glass-btn--danger" @click="leaveRoom" title="退出房间">
              <Icon icon="ph:sign-out-duotone" aria-hidden="true" />
            </button>
            <button class="mr-glass-btn mr-glass-theme" @click="toggleTheme" :title="currentTheme === 'phrolova-light' ? '暗色模式' : '亮色模式'">
              <Icon :icon="currentTheme === 'phrolova-light' ? 'ph:moon-duotone' : 'ph:sun-duotone'" aria-hidden="true" />
            </button>
          </div>
        </header>

        <!-- ── 对局摘要 ── -->
        <MatchSummary :room-state="multiGameStore.roomState" />

        <!-- ── 分数 + 状态行 ── -->
        <div class="mr-summary-row">
          <div class="mr-score-panel">
            <p class="mr-score-kicker">SCORE</p>
            <div class="mr-score-ribbon">
              <div class="mr-score-side">
                <span class="mr-score-label">我方</span>
                <strong class="mr-score-value" :class="{ 'mr-score-value--lead': myWins >= winsNeeded }">{{ myWins }}</strong>
              </div>

              <div class="mr-score-center">
                <span class="mr-score-vs">VS</span>
                <span class="mr-score-target">先 {{ winsNeeded }} 胜</span>
              </div>

              <div class="mr-score-side">
                <span class="mr-score-label">对手</span>
                <strong class="mr-score-value" :class="{ 'mr-score-value--lead': opponentWins >= winsNeeded }">{{ opponentWins }}</strong>
              </div>
            </div>
          </div>

          <div class="status-stack">
            <StatusBanner v-if="multiGameStore.error" :message="multiGameStore.error" tone="error" />
            <StatusBanner v-else-if="multiGameStore.infoMessage" :message="multiGameStore.infoMessage" />
            <StatusBanner v-if="answerText" :message="`本局答案：${answerText}`" tone="success" />
          </div>
        </div>

        <!-- ── 中部：游戏面板 ── -->
        <section class="mr-stage" :class="{ 'mr-stage--empty': !hasBattleHistory }">
          <div class="mr-stage-head">
            <div class="mr-stage-copy">
              <p class="mr-stage-kicker">ARENA</p>
              <h2 class="mr-stage-title">{{ hasBattleHistory ? "双方猜测进度" : stagePromptTitle }}</h2>
              <p class="mr-stage-sub">{{ hasBattleHistory ? stagePromptSubtitle : roomHintText }}</p>
            </div>

            <FeedbackLegend v-if="hasBattleHistory" />
          </div>

          <div v-if="!hasBattleHistory" class="mr-empty-state">
            <div class="mr-empty-glyph">
              <Icon icon="ph:target-duotone" aria-hidden="true" />
            </div>
            <h2 class="mr-empty-title">{{ stagePromptTitle }}</h2>
            <p class="mr-empty-sub">{{ stagePromptSubtitle }}</p>
          </div>

          <div v-if="hasBattleHistory" class="mr-boards">
            <div class="mr-board-panel">
              <div class="mr-board-head">
                <h3 class="mr-board-title">
                  <Icon icon="ph:user-duotone" class="mr-board-head-icon" aria-hidden="true" />
                  我的猜测
                </h3>
                <span class="mr-board-meta">{{ multiGameStore.me?.attemptsUsed ?? 0 }} / {{ multiGameStore.me?.attemptsLimit ?? 0 }}</span>
              </div>

              <GuessTable
                :quiz-type="multiGameStore.roomState.quizType"
                :rows="multiGameStore.me?.guesses ?? []"
                empty-label="等待我方提交第一条猜测"
                :target-version="multiGameStore.roomState.targetVersion"
                :target-cost="multiGameStore.roomState.targetCost"
              />
            </div>

            <div class="mr-board-panel">
              <div class="mr-board-head">
                <h3 class="mr-board-title">
                  <Icon icon="ph:user-circle-duotone" class="mr-board-head-icon" aria-hidden="true" />
                  对手猜测
                </h3>
                <span class="mr-board-meta">{{ multiGameStore.roomState.opponentId || "等待加入" }}</span>
              </div>

              <GuessTable
                :quiz-type="multiGameStore.roomState.quizType"
                :rows="multiGameStore.opponent?.guesses ?? []"
                empty-label="等待对手提交第一条猜测"
                :target-version="multiGameStore.roomState.targetVersion"
                :target-cost="multiGameStore.roomState.targetCost"
              />
            </div>
          </div>
        </section>

        <!-- ── 底部：猜测输入区 ── -->
        <footer class="mr-dock">
          <div class="mr-dock-copy">
            <span class="mr-dock-label">
              <Icon icon="ph:keyboard-duotone" class="mr-dock-label-icon" aria-hidden="true" />
              提交猜测
            </span>
            <span class="mr-dock-meta">{{ dockHintText }}</span>
          </div>

          <div class="mr-input-row">
            <NameAutocompleteInput
              v-model="guessName"
              :disabled="!multiGameStore.canGuess"
              :names="names"
              :quiz-type="multiGameStore.roomState?.quizType"
              :placeholder="multiGameStore.roomState?.quizType === 'skeleton' ? '输入声骸名称' : '输入角色昵称'"
              @submit="submitGuess"
            />
            <button class="mr-btn mr-btn-submit" :disabled="!multiGameStore.canGuess" @click="submitGuess">
              <Icon icon="ph:paper-plane-right-duotone" class="mr-btn-icon" aria-hidden="true" /> 提交
            </button>
          </div>
        </footer>
      </div>
    </template>

    <div v-else class="mr-empty-shell">
      <div class="mr-empty-glyph">
        <Icon icon="ph:warning-circle-duotone" aria-hidden="true" />
      </div>
      <p class="mr-empty-kicker">NOTICE</p>
      <h2 class="mr-empty-title">当前没有活跃房间</h2>
      <p class="mr-empty-sub">刷新后会自动尝试恢复房间，也可以返回大厅重新创建或加入一场对局。</p>
      <RouterLink class="mr-btn mr-link-btn" to="/multi">返回大厅</RouterLink>
    </div>

    <Teleport to="body">
      <div v-if="showMatchResult" class="mr-result-overlay">
        <div class="mr-result-modal">
          <div class="mr-result-header">
            <Icon
              :icon="matchResultText === '胜利' ? 'ph:crown-fill' : matchResultText === '平局' ? 'ph:handshake-duotone' : 'ph:hand-waving-duotone'"
              class="mr-result-icon"
              :class="{ 'mr-result-icon--win': matchResultText === '胜利' }"
            />
            <h2 class="mr-result-title" :class="{ 'mr-result-title--win': matchResultText === '胜利' }">
              {{ matchResultText }}
            </h2>
            <p v-if="matchScoreText" class="mr-result-score">{{ matchScoreText }}</p>
          </div>

          <div class="mr-result-body">
            <div v-if="multiGameStore.roomState?.roundHistory?.length" class="mr-result-rounds">
              <div v-for="entry in multiGameStore.roomState.roundHistory" :key="entry.round" class="mr-result-round">
                <h4 class="mr-result-round-label">第 {{ entry.round }} 局</h4>
                <div class="mr-result-round-boards">
                  <div class="mr-result-board">
                    <h5 class="mr-result-board-title">我的猜测</h5>
                    <GuessTable
                      v-if="multiGameStore.roomState"
                      :quiz-type="multiGameStore.roomState.quizType"
                      :rows="(entry.players[0]?.guesses as any) ?? []"
                      empty-label="-"
                      :target-version="entry.target ? ('version' in entry.target ? Number((entry.target as any).version) : null) : multiGameStore.roomState.targetVersion"
                      :target-cost="entry.target ? ('cost' in entry.target ? Number((entry.target as any).cost) : null) : multiGameStore.roomState.targetCost"
                    />
                  </div>
                  <div class="mr-result-board">
                    <h5 class="mr-result-board-title">对手猜测</h5>
                    <GuessTable
                      v-if="multiGameStore.roomState"
                      :quiz-type="multiGameStore.roomState.quizType"
                      :rows="(entry.players[1]?.guesses as any) ?? []"
                      empty-label="-"
                      :target-version="entry.target ? ('version' in entry.target ? Number((entry.target as any).version) : null) : multiGameStore.roomState.targetVersion"
                      :target-cost="entry.target ? ('cost' in entry.target ? Number((entry.target as any).cost) : null) : multiGameStore.roomState.targetCost"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="mr-result-actions">
            <button class="mr-result-btn mr-result-btn--primary" @click="closeMatchResult(); leaveRoom();">返回大厅</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mr-screen {
  width: 100vw;
  height: 100dvh;
  margin-left: calc(50% - 50vw);
  max-width: 100vw;
  overflow: hidden;
}

.mr-shell {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  gap: 0.35rem;
  padding: 0.35rem 0.8rem 0.4rem;
  overflow: hidden;
}

/* ── 毛玻璃 Header ── */
.mr-glass-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  background: color-mix(in oklab, var(--surface-panel-strong) 72%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.mr-glass-left {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;
  flex: 1;
}

.mr-glass-back {
  display: grid;
  place-items: center;
  width: 1.8rem;
  height: 1.8rem;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: color-mix(in oklab, var(--surface-panel) 60%, transparent);
  color: var(--text-sub);
  font-size: 0.95rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.2s, border-color 0.2s;
}

.mr-glass-back:hover {
  color: var(--gold);
  border-color: var(--gold);
}

.mr-glass-info {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.mr-glass-kicker {
  color: var(--text-faint);
  font-size: 0.65rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mr-glass-title {
  color: var(--text-main);
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mr-glass-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.mr-glass-chip {
  padding: 0.28rem 0.6rem;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  background: color-mix(in oklab, var(--gold) 4%, var(--surface-card));
  color: var(--text-sub);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 18rem;
}

.mr-glass-btn {
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

.mr-glass-btn:hover {
  color: var(--gold);
  border-color: var(--gold);
}

.mr-glass-btn--danger:hover {
  color: var(--color-error);
  border-color: var(--color-error);
}

.mr-glass-theme {
  color: var(--gold-soft);
}

.mr-glass-theme:hover {
  color: var(--gold);
}

.mr-btn-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

/* ── 分数面板 ── */
.mr-summary-row {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  gap: 0.6rem;
  align-items: start;
}

.mr-score-panel {
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  background:
    radial-gradient(circle at 50% 0, color-mix(in oklab, var(--gold) 6%, transparent), transparent 18%),
    linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
}

.mr-score-kicker {
  margin: 0 0 0.15rem;
  color: var(--text-faint);
  font-size: 0.58rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.mr-score-ribbon {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.5rem;
  align-items: center;
}

.mr-score-side {
  display: grid;
  justify-items: center;
  gap: 0.3rem;
}

.mr-score-label {
  color: var(--text-faint);
  font-size: 0.66rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.mr-score-center {
  display: grid;
  justify-items: center;
  gap: 0.15rem;
}

.mr-score-vs {
  color: var(--text-faint);
  font-size: 0.88rem;
  font-weight: 900;
  letter-spacing: 0.2em;
}

.mr-score-target {
  color: var(--text-faint);
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.mr-score-value {
  font-size: 1.5rem;
  font-weight: 900;
  transition: color 0.4s ease;
}

.mr-score-value--lead {
  color: var(--gold);
}

/* ── 中部面板 ── */
.mr-stage {
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.35rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  background:
    radial-gradient(circle at 50% 18%, color-mix(in oklab, var(--gold) 8%, transparent), transparent 22%),
    linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  overflow: hidden;
}

.mr-stage--empty {
  grid-template-rows: auto 1fr;
}

.mr-stage-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.mr-stage-copy {
  display: grid;
  gap: 0.22rem;
}

.mr-stage-kicker {
  margin: 0;
  color: var(--text-faint);
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.mr-stage-title,
.mr-empty-title {
  margin: 0;
  font-size: clamp(1.18rem, 1rem + 0.6vw, 1.7rem);
  font-weight: 900;
  letter-spacing: 0.04em;
}

.mr-stage-sub,
.mr-dock-meta {
  margin: 0;
  color: var(--text-sub);
  font-size: 0.84rem;
  line-height: 1.6;
}

.mr-empty-state {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 0.6rem;
  text-align: center;
}

.mr-empty-glyph {
  display: grid;
  place-items: center;
  width: 3.2rem;
  height: 3.2rem;
  border: 1px solid color-mix(in oklab, var(--line-strong) 90%, transparent);
  border-radius: 999px;
  color: var(--text-faint);
  font-size: 1.2rem;
}

.mr-empty-sub {
  margin: 0;
  color: var(--text-sub);
  font-size: 0.84rem;
  line-height: 1.6;
}

.mr-boards {
  min-height: 0;
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  overflow: hidden;
}

.mr-board-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  background: var(--surface-panel);
  overflow: hidden;
}

.mr-board-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--line-soft);
}

.mr-board-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.mr-board-head-icon {
  font-size: 1rem;
  color: var(--gold-soft);
}

.mr-board-meta {
  color: var(--text-faint);
  font-size: 0.74rem;
}

.mr-board-panel :deep(.guess-table-shell) {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

/* ── 底部猜测区 ── */
.mr-dock {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
}

.mr-dock-copy {
  display: grid;
  gap: 0.18rem;
  min-width: min(100%, 14rem);
}

.mr-dock-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--text-faint);
  font-size: 0.68rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.mr-dock-label-icon {
  font-size: 0.95rem;
  color: var(--gold-soft);
}

.mr-input-row {
  flex: 1;
  display: flex;
  gap: 0.5rem;
}

.mr-input-row > :first-child {
  flex: 1;
}

/* ── 空状态页 ── */
.mr-empty-shell {
  max-width: 480px;
  margin: 4rem auto 0;
  display: grid;
  justify-items: center;
  gap: 0.7rem;
  text-align: center;
}

.mr-empty-shell .mr-empty-glyph {
  font-size: 2.2rem;
}

.mr-empty-kicker {
  margin: 0;
  color: var(--text-faint);
  font-size: 0.7rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

/* ── 按钮 ── */
.mr-btn {
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

.mr-btn:hover {
  background: color-mix(in oklab, var(--gold) 24%, var(--surface-panel-strong));
}

.mr-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mr-btn-submit {
  padding-inline: 1.1rem;
}

.mr-link-btn {
  display: inline-flex;
  text-decoration: none;
}

/* ── 响应式 ── */
@media (max-width: 1040px) {
  .mr-summary-row {
    grid-template-columns: 1fr;
  }

  .mr-boards {
    grid-template-rows: repeat(2, minmax(200px, 1fr));
  }
}

@media (max-width: 720px) {
  .mr-shell {
    padding: 0;
    gap: 0;
    grid-template-rows: auto minmax(0, 1fr) auto;
  }
  .mr-glass-header {
    border-radius: 0; border-left: none; border-right: none; border-top: none;
    padding: 0.35rem 0.5rem;
  }
  .mr-glass-kicker { font-size: 0.56rem; }
  .mr-glass-title { font-size: 0.74rem; }
  .mr-glass-chip { font-size: 0.6rem; max-width: 10rem; padding: 0.2rem 0.4rem; }
  .mr-glass-back { width: 1.6rem; height: 1.6rem; font-size: 0.85rem; }
  .mr-glass-btn { width: 1.6rem; height: 1.6rem; font-size: 0.9rem; }
  .status-stack { display: none; }

  .mr-stage {
    border: none; border-radius: 0;
    padding: 0.35rem 0.4rem;
  }
  .mr-stage-head { gap: 0.3rem; }
  .mr-stage-kicker { font-size: 0.56rem; }
  .mr-stage-title, .mr-empty-title { font-size: 0.88rem; }
  .mr-stage-sub, .mr-empty-sub { font-size: 0.7rem; }

  .mr-boards {
    gap: 0.35rem;
  }
  .mr-board-head { padding: 0.3rem 0.45rem; }
  .mr-board-title { font-size: 0.72rem; }
  .mr-board-meta { font-size: 0.64rem; }

  .mr-dock {
    border-radius: 0; border-left: none; border-right: none; border-bottom: none;
    padding: 0.4rem 0.5rem;
  }
  .mr-dock-copy { display: none; }
  .mr-input-row { width: 100%; }
  .mr-input-row > :first-child { flex: 1; }
  .mr-btn { padding: 0.4rem 0.7rem; font-size: 0.78rem; }
  .mr-btn-submit { padding: 0.45rem 0.8rem; font-size: 0.8rem; }

  .mr-result-modal { max-width: 96vw; max-height: 85vh; }
  .mr-result-header { padding: 1rem 1rem 0.8rem; }
  .mr-result-body { padding: 0.5rem; }
  .mr-result-board :deep(.guess-table-shell) { max-height: 140px; }
}

@media (max-width: 480px) {
  .mr-stage { padding: 0.25rem; }
  .mr-dock { padding: 0.35rem 0.4rem; }
  .mr-input-row { gap: 0.3rem; }
  .mr-btn-submit { padding: 0.4rem 0.6rem; }
}

/* ── Match Result Modal ── */
.mr-result-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(6px);
  animation: mrFadeIn 0.25s ease;
}
.mr-result-modal {
  display: flex; flex-direction: column;
  width: 100%; max-width: 680px; max-height: 90vh;
  border: 1px solid var(--line-soft); border-radius: 14px;
  background: var(--surface-panel-strong);
  overflow: hidden;
  animation: mrSlideUp 0.3s ease;
}
.mr-result-header {
  display: grid; justify-items: center; gap: 0.4rem;
  padding: 2rem 1.5rem 1.2rem;
  background: radial-gradient(ellipse 100% 140% at 50% 0%, color-mix(in oklab, var(--gold) 12%, transparent), transparent);
}
.mr-result-icon {
  font-size: 2.6rem; color: var(--text-sub);
}
.mr-result-icon--win { color: var(--gold); }
.mr-result-title {
  margin: 0; font-size: 1.6rem; font-weight: 900; letter-spacing: 0.06em;
}
.mr-result-title--win { color: var(--gold); }
.mr-result-score {
  margin: 0; color: var(--gold); font-size: 1.15rem; font-weight: 700;
}
.mr-result-body {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.8rem;
  padding: 0.8rem 1rem;
}
.mr-result-rounds { display: flex; flex-direction: column; gap: 0.8rem; }
.mr-result-round { display: flex; flex-direction: column; gap: 0.35rem; }
.mr-result-round-label {
  margin: 0; font-size: 0.8rem; font-weight: 700; color: var(--gold); letter-spacing: 0.06em;
}
.mr-result-round-boards {
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;
}
.mr-result-board { display: flex; flex-direction: column; min-height: 0; }
.mr-result-board-title {
  margin: 0 0 0.3rem; font-size: 0.72rem; font-weight: 700; color: var(--text-sub); letter-spacing: 0.04em;
}
.mr-result-board :deep(.guess-table-shell) {
  max-height: 200px; overflow: auto;
}
.mr-result-actions {
  display: flex; justify-content: center; gap: 0.6rem;
  padding: 1rem 1.2rem 1.2rem; border-top: 1px solid var(--line-soft);
}
.mr-result-btn {
  padding: 0.65rem 1.8rem;
  border: 1px solid var(--line-strong); border-radius: 8px;
  background: var(--surface-panel); color: var(--text-sub);
  font-size: 0.9rem; font-weight: 600; cursor: pointer;
}
.mr-result-btn:hover { border-color: var(--gold); color: var(--text-main); }
.mr-result-btn--primary {
  border-color: color-mix(in oklab, var(--gold) 40%, transparent);
  background: color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong));
  color: var(--gold);
}
.mr-result-btn--primary:hover { background: color-mix(in oklab, var(--gold) 26%, var(--surface-panel-strong)); }

@keyframes mrFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes mrSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 720px) {
  .mr-result-modal { max-width: 96vw; max-height: 85vh; }
  .mr-result-body { padding: 0.7rem; }
  .mr-result-board :deep(.guess-table-shell) { max-height: 160px; }
}
</style>
