<script setup lang="ts">
import { watch } from "vue";
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import { useAdmin } from "@/composables/useAdmin";

const router = useRouter();
const { adminToken, authLoading, authError, loginForm, doLogin } = useAdmin();

watch(adminToken, (v) => {
  if (v) router.replace({ name: "admin-diff" });
});
</script>

<template>
  <div class="ad-login-page">
    <section class="ad-login-card">
      <div class="ad-login-glyph"><Icon icon="ph:shield-check-duotone" /></div>
      <p class="ad-login-kicker">ADMIN CONSOLE</p>
      <h2 class="ad-login-title">管理员登录</h2>
      <p class="ad-login-sub">仅限授权账号 · 所有操作将被记录</p>
      <div v-if="authError" class="ad-error">{{ authError }}</div>
      <form class="ad-login-form" @submit.prevent="doLogin">
        <label class="form-field"><span class="form-label">用户名</span><input v-model="loginForm.username" class="form-input" type="text" placeholder="管理员账号" autocomplete="username"/></label>
        <label class="form-field"><span class="form-label">密码</span><input v-model="loginForm.password" class="form-input" type="password" placeholder="管理员密码" autocomplete="current-password" @keyup.enter="doLogin"/></label>
        <button class="btn ad-login-btn" type="submit" :disabled="authLoading || !loginForm.username || !loginForm.password">
          <Icon v-if="authLoading" icon="ph:spinner-gap-bold-duotone" class="btn-icon ph-spin"/>
          <Icon v-else icon="ph:arrow-right-duotone" class="btn-icon"/>
          {{ authLoading ? "登录中..." : "进入管理台" }}
        </button>
      </form>
    </section>
  </div>
</template>
