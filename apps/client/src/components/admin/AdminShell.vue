<script setup lang="ts">
import { useRouter, useRoute } from "vue-router";
import { Icon } from "@iconify/vue";
import { useAdmin } from "@/composables/useAdmin";

const router = useRouter();
const route = useRoute();
const { doLogout } = useAdmin();

const tabs = [
  { key: "diff", label: "对比同步", icon: "ph:git-diff-duotone", to: "/admin/diff" },
  { key: "table", label: "数据表格", icon: "ph:table-duotone", to: "/admin/table" },
];

function onLogout() {
  doLogout();
  router.push({ name: "admin-login" });
}
</script>

<template>
  <div class="ad-page">
    <header class="ad-top">
      <button class="back-btn" @click="router.push('/')"><Icon icon="ph:arrow-left-duotone"/> BACK</button>
      <h1 class="ad-title">管理面板</h1>
      <div class="ad-top-right"><button class="ad-logout-btn" @click="onLogout">登出</button></div>
    </header>

    <nav class="ad-tabs">
      <router-link v-for="t in tabs" :key="t.key" :to="t.to" class="ad-tab" :class="{ 'ad-tab--active': route.path === t.to }">
        <Icon :icon="t.icon" class="ad-tab-icon"/>{{ t.label }}
      </router-link>
    </nav>

    <main class="ad-main">
      <slot />
    </main>
  </div>
</template>
