import type { AuthResponse, CaptchaResponse } from "@/types/game";
import { apiPath, requestJson } from "./http";

export interface LoginPayload {
  username: string;
  password: string;
  captchaId: string;
  captchaText: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
  captchaId: string;
  captchaText: string;
}

export interface UpdatePlayerIdPayload {
  oldId: string;
  newId: string;
  token: string;
}

export function fetchCaptcha() {
  return requestJson<CaptchaResponse>(apiPath("/auth/captcha"));
}

export function initPlayer(playerId: string) {
  return requestJson<AuthResponse>(apiPath("/player/init"), {
    method: "POST",
    body: JSON.stringify({ player_id: playerId }),
  });
}

export function getPlayerScore(playerId: string) {
  return requestJson<AuthResponse>(apiPath("/player/score"), {
    method: "POST",
    body: JSON.stringify({ player_id: playerId }),
  });
}

export function updatePlayerId(payload: UpdatePlayerIdPayload) {
  return requestJson<AuthResponse>(apiPath("/player/update_id"), {
    method: "POST",
    body: JSON.stringify({
      old_id: payload.oldId,
      new_id: payload.newId,
      token: payload.token,
    }),
  });
}

export function login(payload: LoginPayload) {
  return requestJson<AuthResponse>(apiPath("/auth/login"), {
    method: "POST",
    body: JSON.stringify({
      username: payload.username,
      password: payload.password,
      captcha_id: payload.captchaId,
      captcha_text: payload.captchaText,
    }),
  });
}

export function register(payload: RegisterPayload) {
  return requestJson<AuthResponse>(apiPath("/auth/register"), {
    method: "POST",
    body: JSON.stringify({
      username: payload.username,
      password: payload.password,
      captcha_id: payload.captchaId,
      captcha_text: payload.captchaText,
    }),
  });
}

export function logout() {
  return requestJson<{ status: string; message: string }>(apiPath("/auth/logout"), {
    method: "POST",
  });
}
