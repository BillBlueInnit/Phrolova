import type {
  Difficulty,
  QuizType,
  ResonatorNameEntry,
  SingleDrawResponse,
  SingleGuessResponse,
  SkeletonNameEntry,
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

export function drawTarget(quizType: QuizType, difficulty: Difficulty, playerId?: string, token?: string) {
  return requestJson<SingleDrawResponse>(apiPath("/draw"), {
    method: "POST",
    body: JSON.stringify({
      type: quizType,
      difficulty,
      player_id: playerId || "",
      token: token || "",
    }),
  });
}

export function submitGuess(
  guessName: string,
  playerId: string,
  token: string,
) {
  return requestJson<SingleGuessResponse>(apiPath("/guess"), {
    method: "POST",
    body: JSON.stringify({
      guess: guessName,
      player_id: playerId,
      token,
    }),
  });
}
