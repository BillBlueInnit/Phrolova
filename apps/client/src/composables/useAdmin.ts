import { apiPath, requestJson } from "@/utils/http";

export function useAdmin() {
  function adminHeaders(): Record<string, string> {
    return { "X-Admin-Token": localStorage.getItem("admin_token") || "" };
  }

  function doLogout() {
    requestJson(apiPath("/admin/logout"), { method: "POST", headers: adminHeaders() }).catch(() => {});
    localStorage.removeItem("admin_token");
  }

  return { adminHeaders, doLogout };
}
