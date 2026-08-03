export {
  fetchCaptcha,
  initPlayer,
  getPlayerScore,
  updatePlayerId,
  login,
  register,
  logout,
} from "./auth";
export type { LoginPayload, RegisterPayload, UpdatePlayerIdPayload } from "./auth";

export {
  health,
  fetchResonatorNames,
  fetchSkeletonNames,
  drawTarget,
  submitGuess,
} from "./game";

export { fetchLeaderboard } from "./leaderboard";

export { C2S, S2C } from "./multiplayer";
export type {
  CreateRoomPayload,
  JoinRoomPayload,
  QueueJoinPayload,
  SubmitGuessPayload,
  LeaveRoomPayload,
  AuthedPayload,
  ErrorPayload,
  MatchingPayload,
  RoomCreatedPayload,
  RoomJoinedPayload,
  CountdownStartedPayload,
  RoundStartedPayload,
  GuessResultPayload,
  RoundFinishedPayload,
  MatchFinishedPayload,
  OpponentForfeitPayload,
  MultiplayerRoomState,
} from "./multiplayer";

export { ApiError, requestJson, apiPath } from "./http";
