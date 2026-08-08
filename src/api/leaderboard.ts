import type { LeaderboardResponse, QuizType } from "@/types/game";
import { apiPath, requestJson } from "./http";

export function fetchLeaderboard(playerId?: string, mode = "multi", quizType?: QuizType, page = 1, pageSize = 20) {
  const params = new URLSearchParams();
  if (playerId) params.set("player_id", playerId);
  params.set("mode", mode);
  if (quizType) params.set("type", quizType);
  params.set("page", String(page));
  params.set("page_size", String(pageSize));
  return requestJson<LeaderboardResponse>(`${apiPath("/leaderboard")}?${params.toString()}`);
}
