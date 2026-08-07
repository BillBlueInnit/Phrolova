<script setup lang="ts">
import { reactive, shallowRef } from "vue";
import { useRouter, useRoute } from "vue-router";
import { apiPath, requestJson } from "@/utils/http";

const router = useRouter();
const route = useRoute();
const authLoading = shallowRef(false);
const authError = shallowRef("");
const loginForm = reactive({ username: "", password: "" });

// Already logged in → skip login
if (localStorage.getItem("admin_token")) {
  router.replace((route.query.redirect as string) || "/admin/diff");
}

async function doLogin() {
  authLoading.value = true; authError.value = "";
  try {
    const data = await requestJson<{ status: string; token?: string; message?: string }>(
      apiPath("/admin/login"), { method: "POST", body: JSON.stringify({ username: loginForm.username.trim(), password: loginForm.password }) },
    );
    if (data.status === "success" && data.token) {
      localStorage.setItem("admin_token", data.token);
      router.replace((route.query.redirect as string) || "/admin/diff");
    } else { authError.value = data.message || "登录失败"; }
  } catch (e) { authError.value = e instanceof Error ? e.message : "登录请求失败"; }
  finally { authLoading.value = false; }
}
</script>

<template>
<div class="ad-page">
<header class="ad-top">
  <button class="back-btn" @click="router.push('/')"><Icon icon="ph:arrow-left-duotone"/> BACK</button>
  <h1 class="ad-title">管理面板</h1>
  <div class="ad-top-right"/>
</header>
<section class="ad-card">
  <h2 class="ad-card-title"><Icon icon="ph:lock-duotone" class="ad-card-icon"/> 管理员登录</h2>
  <div v-if="authError" class="ad-error">{{ authError }}</div>
  <label class="form-field"><span class="form-label">用户名</span><input v-model="loginForm.username" class="form-input" type="text" placeholder="管理员账号"/></label>
  <label class="form-field"><span class="form-label">密码</span><input v-model="loginForm.password" class="form-input" type="password" placeholder="管理员密码" @keyup.enter="doLogin"/></label>
  <button class="btn" :disabled="authLoading" @click="doLogin">{{ authLoading?'登录中...':'登录' }}</button>
</section>
</div>
</template>
