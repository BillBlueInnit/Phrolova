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

export function drawTarget(
  quizType: QuizType,
  difficulty: Difficulty,
  playerId?: string,
  token?: string,
) {
  if (playerId && token) {
    return requestJson<SingleDrawResponse>(apiPath("/draw"), {
      method: "POST",
      body: JSON.stringify({ type: quizType, difficulty, player_id: playerId, token }),
    });
  }
  const url = `${apiPath("/draw")}?type=${quizType}&difficulty=${difficulty}`;
  return requestJson<SingleDrawResponse>(url);
}

export function submitGuess(
  guessName: string,
  playerId: string,
  token: string,
  target?: ResonatorRow | SkeletonRow,
  quizType?: QuizType,
) {
  const body: Record<string, unknown> = { guess: guessName, player_id: playerId, token };
  if (!playerId || !token) {
    body.target = target;
    body.type = quizType;
  }
  return requestJson<SingleGuessResponse>(apiPath("/guess"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}
