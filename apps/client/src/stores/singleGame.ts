import { computed, ref, shallowRef } from "vue";
import { defineStore } from "pinia";

import type {
  Difficulty,
  GuessHistoryRow,
  QuizType,
  ResonatorCompare,
  ResonatorRow,
  SingleDrawResponse,
  SingleGuessResponse,
  SkeletonCompare,
  SkeletonRow,
} from "@/types/game";
import { apiPath, requestJson } from "@/utils/http";
import { toHistoryRow } from "@/utils/game";

function isWinningCompare(compare: ResonatorCompare | SkeletonCompare) {
  if ("skill_attribute" in compare) {
    return (
      compare.skill_attribute.cell === "match" &&
      compare.cost === "match" &&
      compare.is_aberration === "match" &&
      compare.set_name.cell === "match" &&
      compare.drop_location.cell === "match"
    );
  }
  return Object.values(compare).every((status) => status === "match");
}

export const useSingleGameStore = defineStore("singleGame", () => {
  const quizType = shallowRef<QuizType>("resonator");
  const difficulty = shallowRef<Difficulty>("hard");
  const target = ref<ResonatorRow | SkeletonRow | null>(null);
  const guessHistory = ref<GuessHistoryRow[]>([]);
  const loading = shallowRef(false);
  const error = shallowRef("");
  const gameOver = shallowRef(false);
  const answerVisible = shallowRef(false);
  const resultMessage = shallowRef("");

  const attemptsLimit = computed(() => (quizType.value === "skeleton" ? 8 : 4));
  const attemptsUsed = computed(() => guessHistory.value.length);
  const attemptsLeft = computed(() => Math.max(0, attemptsLimit.value - attemptsUsed.value));
  const canSubmit = computed(() => Boolean(target.value) && !gameOver.value && attemptsLeft.value > 0);

  function setConfig(nextQuizType: QuizType, nextDifficulty: Difficulty) {
    quizType.value = nextQuizType;
    difficulty.value = nextDifficulty;
  }

  async function startGame() {
    loading.value = true;
    error.value = "";
    gameOver.value = false;
    answerVisible.value = false;
    resultMessage.value = "";
    guessHistory.value = [];
    try {
      const url = `${apiPath("/draw")}?type=${quizType.value}&difficulty=${difficulty.value}`;
      const data = await requestJson<SingleDrawResponse>(url);
      target.value = (data.character ?? null) as ResonatorRow | SkeletonRow | null;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : "开局失败";
      throw reason;
    } finally {
      loading.value = false;
    }
  }

  async function submitGuess(guessName: string) {
    if (!target.value) {
      throw new Error("请先开始游戏");
    }
    if (!guessName.trim()) {
      throw new Error("请输入角色或声骸名称");
    }
    loading.value = true;
    error.value = "";
    try {
      const data = await requestJson<SingleGuessResponse>(apiPath("/guess"), {
        method: "POST",
        body: JSON.stringify({
          target: target.value,
          guess: guessName,
          type: quizType.value,
        }),
      });
      if (!data.guess || !data.compare) {
        throw new Error("返回结果不完整");
      }
      guessHistory.value = [...guessHistory.value, toHistoryRow(data.guess, data.compare)];
      const win = isWinningCompare(data.compare);
      if (win) {
        gameOver.value = true;
        answerVisible.value = true;
        resultMessage.value = "回答正确，本局已完成。";
      } else if (guessHistory.value.length >= attemptsLimit.value) {
        gameOver.value = true;
        answerVisible.value = true;
        resultMessage.value = "机会已用尽，可以重新开始。";
      }
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : "提交猜测失败";
      throw reason;
    } finally {
      loading.value = false;
    }
  }

  function revealAnswer() {
    if (!target.value) return;
    answerVisible.value = true;
    gameOver.value = true;
    resultMessage.value = "已显示本局答案。";
  }

  return {
    quizType,
    difficulty,
    target,
    guessHistory,
    loading,
    error,
    gameOver,
    answerVisible,
    resultMessage,
    attemptsLimit,
    attemptsUsed,
    attemptsLeft,
    canSubmit,
    setConfig,
    startGame,
    submitGuess,
    revealAnswer,
  };
});
