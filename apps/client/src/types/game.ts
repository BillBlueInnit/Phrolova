export type QuizType = "resonator" | "skeleton";
export type Difficulty = "easy" | "hard";
export type CompareStatus = "match" | "near" | "different";
export type CellStatus = "match" | "partial" | "different";

export interface ResonatorRow {
  id: number;
  name: string;
  attribute: string;
  star_rating: number;
  weapon: string;
  birthplace: string;
  version: number;
}

export interface SkeletonRow {
  id: number;
  name: string;
  skill_attribute: string;
  cost: number;
  is_aberration: string;
  set_name: string;
  drop_location: string;
}

export interface ResonatorNameEntry {
  name: string;
  attribute: string;
  star_rating: number;
}

export interface SkeletonNameEntry {
  name: string;
  skill_attribute: string;
  cost: number;
  set_name: string;
}

export interface CompareAttrItem {
  attr: string;
  status: CompareStatus;
}

export interface CompareSetItem {
  set: string;
  status: CompareStatus;
  has_image: boolean;
  whiten: boolean;
}

export interface CompareLocationItem {
  loc: string;
  status: CompareStatus;
}

export interface CompareGroup<TItem> {
  cell: CellStatus;
  items: TItem[];
}

export interface SkeletonCompare {
  skill_attribute: CompareGroup<CompareAttrItem>;
  cost: CompareStatus;
  is_aberration: CompareStatus;
  set_name: CompareGroup<CompareSetItem>;
  drop_location: CompareGroup<CompareLocationItem>;
}

export interface ResonatorCompare {
  attribute: CompareStatus;
  star_rating: CompareStatus;
  weapon: CompareStatus;
  birthplace: CompareStatus;
  version: CompareStatus;
}

export interface GuessHistoryRow {
  revealed: boolean;
  guess: ResonatorRow | SkeletonRow | Record<string, string>;
  compare: ResonatorCompare | SkeletonCompare;
}

export interface ApiStatusResponse {
  status: "success" | "error";
  message?: string;
}

export interface AuthResponse extends ApiStatusResponse {
  player?: {
    player_id: string;
    score: number;
    wins: number;
    matches: number;
  };
  token?: string;
}

export interface CaptchaResponse extends ApiStatusResponse {
  captcha_id?: string;
  image?: string;
}

export interface SingleDrawResponse extends ApiStatusResponse {
  type?: QuizType;
  character?: ResonatorRow | SkeletonRow;
}

export interface SingleGuessResponse extends ApiStatusResponse {
  type?: QuizType;
  target?: ResonatorRow | SkeletonRow;
  guess?: ResonatorRow | SkeletonRow;
  compare?: ResonatorCompare | SkeletonCompare;
}

export interface LeaderboardRow {
  player_id: string;
  score: number;
  wins: number;
  matches: number;
  win_rate: number;
}

export interface LeaderboardResponse extends ApiStatusResponse {
  leaderboard: LeaderboardRow[];
  my_info: {
    player_id: string;
    score?: number;
    wins?: number;
    matches?: number;
    win_rate?: number;
    rank?: number;
    in_top: boolean;
  } | null;
}

export interface RoomPlayerView {
  playerId: string;
  roundWins: number;
  attemptsUsed: number;
  attemptsLimit: number;
  guesses: GuessHistoryRow[];
  isMe: boolean;
}

export interface MultiplayerRoomState {
  roomCode: string;
  quizType: QuizType;
  difficulty: Difficulty;
  bestOf: number;
  scoreDelta: number;
  roomStatus: "waiting" | "countdown" | "playing" | "finished";
  roundStatus: "idle" | "active" | "resolved";
  round: number;
  roundWinner: number | null;
  roundWins: number[];
  timeLeft: number;
  timeLimit: number;
  countdownLeft: number;
  target: ResonatorRow | SkeletonRow | null;
  targetVersion: number | null;
  targetCost: number | null;
  overallWinner: number | null;
  forfeitBy: string | null;
  players: RoomPlayerView[];
  opponentId: string;
}
