import type {
  Difficulty,
  QuizType,
  ResonatorNameEntry,
  ResonatorRow,
  SingleDrawResponse,
  SingleGuessResponse,
  SkeletonNameEntry,
  SkeletonRow,
} from "@/types/game";
import { apiPath, requestJson } from "./http";

export function health() {
  return requestJson<{ status: string }>(apiPath("/health"));
}

export function fetchResonatorNames() {
  return requestJson<{ status: string; names: ResonatorNameEntry[] }>(apiPath("/names"));
}

export function fetchSkeletonNames() {
  return requestJson<{ status: string; names: SkeletonNameEntry[] }>(apiPath("/skeleton_names"));
}

export function drawTarget(quizType: QuizType, difficulty: Difficulty) {
  const url = `${apiPath("/draw")}?type=${quizType}&difficulty=${difficulty}`;
  return requestJson<SingleDrawResponse>(url);
}

export function submitGuess(
  target: ResonatorRow | SkeletonRow,
  guessName: string,
  quizType: QuizType,
) {
  return requestJson<SingleGuessResponse>(apiPath("/guess"), {
    method: "POST",
    body: JSON.stringify({ target, guess: guessName, type: quizType }),
  });
}
