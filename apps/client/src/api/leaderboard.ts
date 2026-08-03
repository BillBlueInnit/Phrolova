import type { LeaderboardResponse } from "@/types/game";
import { apiPath, requestJson } from "./http";

export function fetchLeaderboard(playerId?: string) {
  const url = playerId ? `${apiPath("/leaderboard")}?player_id=${encodeURIComponent(playerId)}` : apiPath("/leaderboard");
  return requestJson<LeaderboardResponse>(url);
}
