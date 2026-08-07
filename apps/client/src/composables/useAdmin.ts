import type { Router } from "vue-router";
import { computed, reactive, ref, shallowRef } from "vue";
import { ApiError, apiPath, requestJson } from "@/api/http";

const TOKEN_KEY = "admin_token";

export interface AdminTokenPayload {
  username: string;
  expiry: number;
}

export function parseAdminToken(token: string | null): AdminTokenPayload | null {
  if (!token) return null;
  try {
    const parts = token.split(":");
    if (parts.length < 3) return null;
    const username = parts[1];
    const expiry = parseInt(parts[2], 10);
    if (!username || Number.isNaN(expiry)) return null;
    return { username, expiry };
  } catch {
    return null;
  }
}

export function isAdminTokenExpired(token: string | null): boolean {
  const p = parseAdminToken(token);
  if (!p) return true;
  return Date.now() >= p.expiry * 1000;
}

const adminToken = shallowRef<string | null>(localStorage.getItem(TOKEN_KEY));
const authLoading = ref(false);
const authError = ref("");

const loginForm = reactive({ username: "", password: "" });

const isAdmin = computed(() => !!adminToken.value && !isAdminTokenExpired(adminToken.value));
const adminUsername = computed(() => parseAdminToken(adminToken.value)?.username ?? "");

export function setAdminToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  adminToken.value = token;
}

export function clearAdminToken() {
  setAdminToken(null);
}

export function adminHeaders(): Record<string, string> {
  const t = adminToken.value ?? localStorage.getItem(TOKEN_KEY) ?? "";
  return { "X-Admin-Token": t };
}

export async function doAdminLogin(): Promise<boolean> {
  authLoading.value = true;
  authError.value = "";
  try {
    const data = await requestJson<{ status: string; token?: string; message?: string }>(
      apiPath("/admin/login"),
      {
        method: "POST",
        body: JSON.stringify({
          username: loginForm.username.trim(),
          password: loginForm.password,
        }),
      },
    );
    if (data.status === "success" && data.token) {
      setAdminToken(data.token);
      return true;
    }
    authError.value = data.message || "登录失败";
    return false;
  } catch (e) {
    if (e instanceof Error) authError.value = e.message;
    else authError.value = "登录请求失败";
    return false;
  } finally {
    authLoading.value = false;
  }
}

export async function doAdminLogout() {
  try {
    await requestJson(apiPath("/admin/logout"), { method: "POST", headers: adminHeaders() });
  } catch {
    /* best-effort */
  } finally {
    clearAdminToken();
  }
}

let _router: Router | null = null;
export function bindAdminRouter(router: Router) {
  _router = router;
}

export function handleAdminApiError(e: unknown, currentPath?: string): boolean {
  if (e instanceof ApiError && e.status === 401) {
    clearAdminToken();
    if (_router) {
      const redirect = currentPath ?? _router.currentRoute.value.fullPath;
      _router.replace({ name: "admin-login", query: { redirect } });
    }
    return true;
  }
  return false;
}

export function useAdmin() {
  return {
    adminToken,
    isAdmin,
    adminUsername,
    authLoading,
    authError,
    loginForm,
    adminHeaders,
    doLogin: doAdminLogin,
    doLogout: doAdminLogout,
    setToken: setAdminToken,
    clearToken: clearAdminToken,
  };
}
