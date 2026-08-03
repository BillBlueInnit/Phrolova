<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "@/stores/auth";
import { useMultiGameStore } from "@/stores/multiGame";

const THEME_KEY = "phrolova_theme";

const authStore = useAuthStore();
const multiGameStore = useMultiGameStore();
const route = useRoute();
const router = useRouter();
const theme = shallowRef<"phrolova-light" | "phrolova-night">("phrolova-light");
const isHomeRoute = computed(() => route.name === "home");
const isGameRoute = computed(() => {
  const name = route.name;
  return name === "single" || name === "single-play" || name === "multi-lobby" || name === "multi-room";
});

function applyTheme(nextTheme: "phrolova-light" | "phrolova-night") {
  theme.value = nextTheme;
  document.documentElement.setAttribute("data-theme", nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
}

function toggleTheme() {
  applyTheme(theme.value === "phrolova-light" ? "phrolova-night" : "phrolova-light");
}

function handleLogout() {
  multiGameStore.disconnect();
  authStore.logout();
  router.push("/");
}

watch(
  () => multiGameStore.roomState?.roomCode,
  (roomCode) => {
    if (roomCode && route.name !== "multi-room") {
      router.push("/multi/room");
    }
  },
);

onMounted(async () => {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === "phrolova-night" || savedTheme === "phrolova-light") {
    applyTheme(savedTheme);
  } else {
    applyTheme("phrolova-light");
  }

  await authStore.hydrate();
  if (authStore.isAuthenticated) {
    await multiGameStore.resumeRoom().catch(() => undefined);
  }
});
</script>

<template>
  <div class="app-root">
    <main class="app-main" :class="{ 'app-main-home': isHomeRoute, 'app-main-game': isGameRoute }">
      <RouterView />
    </main>
    <button class="theme-toggle" type="button" @click="toggleTheme"
      :aria-label="theme === 'phrolova-light' ? '切换到暗色模式' : '切换到亮色模式'">
      <Icon :icon="theme === 'phrolova-light' ? 'ph:moon-duotone' : 'ph:sun-duotone'" />
    </button>
  </div>
</template>

<style>
.theme-toggle {
  position: fixed;
  bottom: 1.2rem;
  right: 1.2rem;
  z-index: 100;
  width: 2.6rem;
  height: 2.6rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface-panel-strong);
  color: var(--gold);
  font-size: 1.2rem;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: transform 0.3s, border-color 0.3s;
}

.theme-toggle:hover {
  border-color: var(--gold);
  transform: scale(1.1);
}
</style>
