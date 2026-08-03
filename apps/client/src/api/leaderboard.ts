import type { LeaderboardResponse, QuizType } from "@/types/game";
import { apiPath, requestJson } from "./http";

export function fetchLeaderboard(playerId?: string, mode = "multi", quizType?: QuizType) {
  const params = new URLSearchParams();
  if (playerId) params.set("player_id", playerId);
  params.set("mode", mode);
  if (quizType) params.set("type", quizType);
  return requestJson<LeaderboardResponse>(`${apiPath("/leaderboard")}?${params.toString()}`);
}
