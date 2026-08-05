import { reactive, shallowRef } from "vue";
import { apiPath, requestJson } from "@/utils/http";

const adminToken = shallowRef(localStorage.getItem("admin_token") || "");
const authLoading = shallowRef(false);
const authError = shallowRef("");
const loginForm = reactive({ username: "", password: "" });

function setToken(t: string) { adminToken.value = t; localStorage.setItem("admin_token", t); }
function clearToken() { adminToken.value = ""; localStorage.removeItem("admin_token"); }

async function doLogin() {
  authLoading.value = true; authError.value = "";
  try {
    const data = await requestJson<{ status: string; token?: string; message?: string }>(
      apiPath("/admin/login"), { method: "POST", body: JSON.stringify({ username: loginForm.username.trim(), password: loginForm.password }) },
    );
    if (data.status === "success" && data.token) {
      setToken(data.token);
      loginForm.username = "";
      loginForm.password = "";
    } else {
      authError.value = data.message || "登录失败";
    }
  } catch (e) {
    authError.value = e instanceof Error ? e.message : "登录请求失败";
  } finally {
    authLoading.value = false;
  }
}

function doLogout() {
  requestJson(apiPath("/admin/logout"), { method: "POST", headers: { "X-Admin-Token": adminToken.value } }).catch(() => {});
  clearToken();
}

function adminHeaders(): Record<string, string> {
  return { "X-Admin-Token": adminToken.value };
}

export function useAdmin() {
  return {
    adminToken,
    authLoading,
    authError,
    loginForm,
    doLogin,
    doLogout,
    adminHeaders,
    setToken,
    clearToken,
  };
}
