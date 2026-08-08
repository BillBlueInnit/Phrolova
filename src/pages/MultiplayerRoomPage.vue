<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useRouter, onBeforeRouteLeave } from "vue-router";
import gsap from "gsap";

import FeedbackLegend from "@/components/game/FeedbackLegend.vue";
import GuessTable from "@/components/game/GuessTable.vue";
import NameAutocompleteInput from "@/components/game/NameAutocompleteInput.vue";
import MatchSummary from "@/components/multi/MatchSummary.vue";
import GlassHeader from "@/components/shared/GlassHeader.vue";
import ModalOverlay from "@/components/shared/ModalOverlay.vue";
import EmptyState from "@/components/shared/EmptyState.vue";
import { writeLocalStorage } from "@/composables/useStorage";
import { useAuthStore } from "@/stores/auth";
import { useDictionaryStore } from "@/stores/dictionary";
import { useMultiGameStore } from "@/stores/multiGame";

let ctx: gsap.Context | null = null;

const authStore = useAuthStore();
const dictionaryStore = useDictionaryStore();
const multiGameStore = useMultiGameStore();
const router = useRouter();
const guessName = shallowRef("");

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

const myGuesses = computed(() =>
  (multiGameStore.me?.guesses ?? []).map((row) => ({ ...row, revealed: true })),
);

const opponentGuesses = computed(() =>
  (multiGameStore.opponent?.guesses ?? []).map((row) => ({ ...row, revealed: false })),
);

const showMatchResult = ref(false);
const matchResultSeen = ref(false);
const showRoundPopup = ref(false);
let roundPopupTimer: ReturnType<typeof setTimeout> | null = null;

// Show round result popup for BO3/BO5
watch(
  () => multiGameStore.roundResult,
  (result) => {
    if (result) {
      showRoundPopup.value = true;
      if (roundPopupTimer) clearTimeout(roundPopupTimer);
      roundPopupTimer = setTimeout(() => {
        showRoundPopup.value = false;
        multiGameStore.roundResult = null;
      }, 5000);
    }
  },
);

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

const matchResultText = computed(() => {
  const d = multiGameStore.matchScoreDelta;
  if (d > 0) return "胜利";
  if (d < 0) return "失败";
  return "平局";
});

const matchScoreText = computed(() => {
  const d = multiGameStore.matchScoreDelta;
  if (!d) return "";
  return d > 0 ? `+${d} 分` : `${d} 分`;
});

const isCreator = computed(() =>
  multiGameStore.roomState?.creator === authStore.playerId,
);

const hasVotedRematch = computed(() =>
  multiGameStore.roomState?.rematchVotes?.includes(authStore.playerId) ?? false,
);

const allVotedRematch = computed(() => {
  const room = multiGameStore.roomState;
  if (!room) return false;
  return room.rematchVotes.length >= room.players.length;
});

function closeMatchResult() { showMatchResult.value = false; }

function openFullResultPage() {
  if (!multiGameStore.roomState) return;
  writeLocalStorage("phrolova_match_result", {
    roomState: multiGameStore.roomState,
    scoreDelta: multiGameStore.matchScoreDelta,
    myPlayerId: authStore.playerId,
  });
  const url = router.resolve({ name: "multi-result" }).href;
  window.open(url, "_blank");
}

async function submitGuess() {
  if (!guessName.value.trim()) return;
  try {
    await multiGameStore.submitGuess(guessName.value.trim());
    guessName.value = "";
    await nextTick();
  } catch { /* ignore */ }
}

async function leaveRoom() {
  await multiGameStore.leaveRoom().catch(() => undefined);
  router.push("/multi");
}

onMounted(async () => {
  nextTick(() => {
    ctx = gsap.context(() => {
      gsap.from(".mr-glass-header", { opacity: 0, y: -20, duration: 0.45, ease: "power2.out" });
      gsap.from(".mr-info-card", { opacity: 0, y: 16, duration: 0.4, ease: "power2.out", delay: 0.08 });
      gsap.from(".mr-stage", { opacity: 0, y: 20, duration: 0.5, ease: "power2.out", delay: 0.14 });
      gsap.from(".mr-dock", { opacity: 0, y: 12, duration: 0.4, ease: "power2.out", delay: 0.2 });
    });
  });
  if (!authStore.isAuthenticated) { router.push("/auth"); return; }
  await multiGameStore.resumeRoom().catch(() => undefined);
  if (multiGameStore.roomState) {
    await dictionaryStore.ensureLoaded(multiGameStore.roomState.quizType);
  }
});

onBeforeUnmount(() => {
  ctx?.revert();
  if (roundPopupTimer) clearTimeout(roundPopupTimer);
});

// 任何方式离开 Room 页面（返回按钮、关闭标签、router.push）都先清理房间状态
// 这样 localStorage 中不会残留 roomCode，避免刷新后误重连
onBeforeRouteLeave(async (_to, _from, next) => {
  try {
    await multiGameStore.leaveRoom();
  } catch { /* ignore */ }
  next();
});

watch(
  () => multiGameStore.roomState?.quizType,
  async (quizType) => { if (!quizType) return; await dictionaryStore.ensureLoaded(quizType); },
);
</script>

<template>
  <div class="game-screen">
    <template v-if="multiGameStore.roomState">
      <div class="game-shell">
        <GlassHeader
          class="mr-glass-header"
          kicker="多人 · 房间对局"
          :title="battleTitle"
          back-to="/multi"
        >
          <template #actions>
            <span class="mr-glass-chip">{{ roomHintText }}</span>
            <button class="glass-header-btn glass-header-btn--danger" @click="leaveRoom" title="退出房间">
              <Icon icon="ph:sign-out-duotone" aria-hidden="true" />
            </button>
          </template>
        </GlassHeader>

        <div class="mr-info-card">
          <MatchSummary :room-state="multiGameStore.roomState" />
          <div class="mr-info-divider" />
          <div class="mr-score-panel">
            <div class="score-bar" style="border:none;background:transparent;padding:0">
              <div class="score-item">
                <span class="score-label">我方</span>
                <span class="score-value" :class="{ 'score-value--accent': myWins >= winsNeeded }">{{ myWins }}</span>
              </div>
              <div class="score-divider">VS</div>
              <div class="score-item">
                <span class="score-label">对手</span>
                <span class="score-value" :class="{ 'score-value--accent': opponentWins >= winsNeeded }">{{ opponentWins }}</span>
              </div>
              <div class="score-divider score-divider--gap">·</div>
              <div class="score-item">
                <span class="score-label">先胜</span>
                <span class="score-value score-value--accent">{{ winsNeeded }}</span>
              </div>
            </div>
          </div>
        </div>

        <section class="game-stage mr-stage" :class="{ 'game-stage--empty': !hasBattleHistory }">
          <div class="stage-head">
            <div class="stage-copy">
              <p class="stage-kicker">ARENA</p>
              <h2 class="stage-title">{{ hasBattleHistory ? "双方猜测进度" : stagePromptTitle }}</h2>
              <p class="stage-sub">{{ hasBattleHistory ? stagePromptSubtitle : roomHintText }}</p>
            </div>
            <FeedbackLegend v-if="hasBattleHistory" />
          </div>

          <div v-if="!hasBattleHistory" class="empty-state">
            <div class="empty-state-glyph"><Icon icon="ph:target-duotone" aria-hidden="true" /></div>
            <h2 class="empty-state-title">{{ stagePromptTitle }}</h2>
            <p class="empty-state-desc">{{ stagePromptSubtitle }}</p>
          </div>

          <div v-if="hasBattleHistory" class="mr-boards">
            <div class="mr-board-panel">
              <div class="mr-board-head">
                <h3 class="mr-board-title"><Icon icon="ph:user-duotone" class="mr-board-head-icon" /> 我的猜测</h3>
                <span class="mr-board-meta">{{ multiGameStore.me?.attemptsUsed ?? 0 }} / {{ multiGameStore.me?.attemptsLimit ?? 0 }}</span>
              </div>
              <GuessTable
                :quiz-type="multiGameStore.roomState.quizType"
                :rows="myGuesses"
                empty-label="等待我方提交第一条猜测"
                :target-version="multiGameStore.roomState.targetVersion"
                :target-cost="multiGameStore.roomState.targetCost"
              />
            </div>

            <div class="mr-board-panel">
              <div class="mr-board-head">
                <h3 class="mr-board-title"><Icon icon="ph:user-circle-duotone" class="mr-board-head-icon" /> 对手猜测</h3>
                <span class="mr-board-meta">{{ multiGameStore.roomState.opponentId || "等待加入" }}</span>
              </div>
              <GuessTable
                :quiz-type="multiGameStore.roomState.quizType"
                :rows="opponentGuesses"
                empty-label="等待对手提交第一条猜测"
                :target-version="multiGameStore.roomState.targetVersion"
                :target-cost="multiGameStore.roomState.targetCost"
              />
            </div>
          </div>
        </section>

        <footer class="game-dock mr-dock">
          <div class="dock-copy">
            <span class="dock-label"><Icon icon="ph:keyboard-duotone" class="dock-label-icon" /> 提交猜测</span>
            <span class="dock-meta">{{ dockHintText }}</span>
          </div>
          <div class="dock-input-row">
            <NameAutocompleteInput
              v-model="guessName"
              :disabled="!multiGameStore.canGuess"
              :names="names"
              :quiz-type="multiGameStore.roomState?.quizType"
              :placeholder="multiGameStore.roomState?.quizType === 'skeleton' ? '输入声骸名称' : '输入角色昵称'"
              @submit="submitGuess"
            />
            <button class="btn btn-submit" :disabled="!multiGameStore.canGuess" @click="submitGuess">
              <Icon icon="ph:paper-plane-right-duotone" class="btn-icon" /> 提交
            </button>
          </div>
        </footer>
      </div>
    </template>

    <div v-else class="mr-empty-shell">
      <EmptyState icon="ph:warning-circle-duotone" kicker="NOTICE" title="当前没有活跃房间" description="刷新后会自动尝试恢复房间，也可以返回大厅重新创建或加入一场对局。">
        <RouterLink class="btn" to="/multi" style="display:inline-flex;text-decoration:none">返回大厅</RouterLink>
      </EmptyState>
    </div>

    <Teleport to="body">
      <Transition name="mr-round-pop">
        <div v-if="showRoundPopup && multiGameStore.roundResult" class="mr-round-popup" @click="showRoundPopup = false; multiGameStore.roundResult = null">
          <div class="mr-round-popup-card">
            <div class="mr-round-popup-icon">
              <Icon
                :icon="multiGameStore.roundResult.roundWinner === (multiGameStore.roomState?.players.findIndex(p => p.isMe) ?? -1) ? 'ph:crown-duotone' : multiGameStore.roundResult.roundWinner === null ? 'ph:handshake-duotone' : 'ph:target-duotone'"
              />
            </div>
            <p class="mr-round-popup-title">
              {{ multiGameStore.roundResult.iWon === null ? '本局平局' : multiGameStore.roundResult.iWon ? '本局获胜' : '本局对方胜' }}
            </p>
            <p class="mr-round-popup-score">我方 {{ multiGameStore.roundResult.myWins }} : {{ multiGameStore.roundResult.opponentWins }} 对手</p>
            <p class="mr-round-popup-hint">点击关闭 · 5 秒后自动关闭</p>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ModalOverlay v-if="showMatchResult" panel-class="mr-result-modal" max-width="1100px" no-close @close="closeMatchResult">
      <div class="mr-result-header">
        <Icon
          :icon="matchResultText === '胜利' ? 'ph:crown-fill' : matchResultText === '平局' ? 'ph:handshake-duotone' : 'ph:hand-waving-duotone'"
          class="mr-result-icon"
          :class="{ 'mr-result-icon--win': matchResultText === '胜利' }"
        />
        <h2 class="mr-result-title" :class="{ 'mr-result-title--win': matchResultText === '胜利' }">{{ matchResultText }}</h2>
        <p v-if="matchScoreText" class="mr-result-score">{{ matchScoreText }}</p>
        <div v-if="answerText" class="mr-result-answer">
          <span class="mr-result-answer-label">正确答案</span>
          <span class="mr-result-answer-value">{{ answerText }}</span>
        </div>
      </div>
      <div class="mr-result-actions">
        <button class="btn" :disabled="hasVotedRematch" @click="multiGameStore.restartRoom()">
          {{ hasVotedRematch ? '已投票，等待对手...' : '再来一局' }}
        </button>
        <button class="btn-ghost" @click="openFullResultPage">查看完整对局</button>
        <button v-if="isCreator" class="btn-ghost" @click="closeMatchResult(); leaveRoom();">关闭房间</button>
      </div>
    </ModalOverlay>
  </div>
</template>

