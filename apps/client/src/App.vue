<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "@/stores/auth";
import { useMultiGameStore } from "@/stores/multiGame";

const THEME_KEY = "phrolova_theme";
const ACCENT_KEY = "phrolova_accent";

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

type AccentPreset = {
  id: string;
  label: string;
  dark: {
    gold: string;
    goldSoft: string;
    shellBg: string;
    shellBgDeep: string;
    surfacePanel: string;
    surfacePanelStrong: string;
    surfaceCard: string;
    textMain: string;
    textSub: string;
    textFaint: string;
  };
  light: {
    gold: string;
    goldSoft: string;
    shellBg: string;
    shellBgDeep: string;
    surfacePanel: string;
    surfacePanelStrong: string;
    surfaceCard: string;
    textMain: string;
    textSub: string;
    textFaint: string;
  };
};

const ACCENTS: AccentPreset[] = [
  {
    id: "violet", label: "紫罗兰",
    dark: { gold: "#a78bfa", goldSoft: "rgba(167,139,250,0.45)", shellBg: "#0a0810", shellBgDeep: "#120e1c", surfacePanel: "rgba(22,18,34,0.94)", surfacePanelStrong: "rgba(28,22,42,0.96)", surfaceCard: "rgba(20,16,30,0.96)", textMain: "#f5f0fa", textSub: "#a599c5", textFaint: "rgba(165,153,197,0.60)" },
    light: { gold: "#7c5cc4", goldSoft: "rgba(124,92,196,0.35)", shellBg: "#f3f0f8", shellBgDeep: "#e8e2f2", surfacePanel: "rgba(252,250,255,0.94)", surfacePanelStrong: "rgba(250,246,255,0.96)", surfaceCard: "rgba(250,246,255,0.96)", textMain: "#241a33", textSub: "#5e4d7a", textFaint: "rgba(94,77,122,0.55)" },
  },
  {
    id: "gold", label: "流金",
    dark: { gold: "#e6b84d", goldSoft: "rgba(230,184,77,0.45)", shellBg: "#080806", shellBgDeep: "#0f0e0a", surfacePanel: "rgba(22,20,14,0.94)", surfacePanelStrong: "rgba(28,25,18,0.96)", surfaceCard: "rgba(20,18,13,0.96)", textMain: "#faf8f0", textSub: "#b5ad90", textFaint: "rgba(181,173,144,0.60)" },
    light: { gold: "#b8922e", goldSoft: "rgba(184,146,46,0.35)", shellBg: "#f5f2e8", shellBgDeep: "#ede8d8", surfacePanel: "rgba(255,252,242,0.94)", surfacePanelStrong: "rgba(252,248,232,0.96)", surfaceCard: "rgba(250,246,230,0.96)", textMain: "#2a2416", textSub: "#6b6040", textFaint: "rgba(107,96,64,0.55)" },
  },
  {
    id: "cyan", label: "青碧",
    dark: { gold: "#22d3ee", goldSoft: "rgba(34,211,238,0.45)", shellBg: "#041012", shellBgDeep: "#08181c", surfacePanel: "rgba(14,28,32,0.94)", surfacePanelStrong: "rgba(18,36,42,0.96)", surfaceCard: "rgba(12,24,28,0.96)", textMain: "#eafafc", textSub: "#8db8c4", textFaint: "rgba(141,184,196,0.60)" },
    light: { gold: "#0891b2", goldSoft: "rgba(8,145,178,0.35)", shellBg: "#eff8fa", shellBgDeep: "#dcf0f4", surfacePanel: "rgba(248,252,254,0.94)", surfacePanelStrong: "rgba(242,250,252,0.96)", surfaceCard: "rgba(244,250,252,0.96)", textMain: "#0a2228", textSub: "#3a6878", textFaint: "rgba(58,104,120,0.55)" },
  },
  {
    id: "rose", label: "绯红",
    dark: { gold: "#fb7185", goldSoft: "rgba(251,113,133,0.45)", shellBg: "#100408", shellBgDeep: "#1c0a10", surfacePanel: "rgba(34,14,20,0.94)", surfacePanelStrong: "rgba(42,18,26,0.96)", surfaceCard: "rgba(30,12,18,0.96)", textMain: "#fdf0f2", textSub: "#c89099", textFaint: "rgba(200,144,153,0.60)" },
    light: { gold: "#e11d48", goldSoft: "rgba(225,29,72,0.35)", shellBg: "#faf0f2", shellBgDeep: "#f4dde2", surfacePanel: "rgba(255,248,250,0.94)", surfacePanelStrong: "rgba(252,242,246,0.96)", surfaceCard: "rgba(252,244,246,0.96)", textMain: "#280812", textSub: "#78304a", textFaint: "rgba(120,48,74,0.55)" },
  },
  {
    id: "emerald", label: "翠绿",
    dark: { gold: "#4ade80", goldSoft: "rgba(74,222,128,0.45)", shellBg: "#041008", shellBgDeep: "#081a10", surfacePanel: "rgba(14,30,20,0.94)", surfacePanelStrong: "rgba(18,38,24,0.96)", surfaceCard: "rgba(12,26,18,0.96)", textMain: "#eafdf0", textSub: "#88c89c", textFaint: "rgba(136,200,156,0.60)" },
    light: { gold: "#16a34a", goldSoft: "rgba(22,163,74,0.35)", shellBg: "#effaf2", shellBgDeep: "#dcf2e2", surfacePanel: "rgba(248,254,250,0.94)", surfacePanelStrong: "rgba(242,252,246,0.96)", surfaceCard: "rgba(244,252,248,0.96)", textMain: "#082014", textSub: "#306050", textFaint: "rgba(48,96,80,0.55)" },
  },
  {
    id: "amber", label: "琥珀",
    dark: { gold: "#fbbf24", goldSoft: "rgba(251,191,36,0.45)", shellBg: "#100c04", shellBgDeep: "#1a1408", surfacePanel: "rgba(30,24,14,0.94)", surfacePanelStrong: "rgba(38,30,18,0.96)", surfaceCard: "rgba(26,20,12,0.96)", textMain: "#fdf6e8", textSub: "#c4ac78", textFaint: "rgba(196,172,120,0.60)" },
    light: { gold: "#d97706", goldSoft: "rgba(217,119,6,0.35)", shellBg: "#faf6ee", shellBgDeep: "#f2e8d4", surfacePanel: "rgba(255,252,244,0.94)", surfacePanelStrong: "rgba(252,248,236,0.96)", surfaceCard: "rgba(250,246,234,0.96)", textMain: "#241604", textSub: "#6a4e18", textFaint: "rgba(106,78,24,0.55)" },
  },
];

const accentId = ref("violet");
const showAccentPicker = ref(false);

function applyTheme(nextTheme: "phrolova-light" | "phrolova-night") {
  theme.value = nextTheme;
  document.documentElement.setAttribute("data-theme", nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
  applyAccent(accentId.value);
}

function toggleTheme() {
  applyTheme(theme.value === "phrolova-light" ? "phrolova-night" : "phrolova-light");
}

function applyAccent(id: string) {
  const preset = ACCENTS.find(a => a.id === id) || ACCENTS[0];
  accentId.value = id;
  const colors = theme.value === "phrolova-night" ? preset.dark : preset.light;
  const root = document.documentElement;
  root.style.setProperty("--gold", colors.gold);
  root.style.setProperty("--gold-soft", colors.goldSoft);
  root.style.setProperty("--shell-bg", colors.shellBg);
  root.style.setProperty("--shell-bg-deep", colors.shellBgDeep);
  root.style.setProperty("--surface-panel", colors.surfacePanel);
  root.style.setProperty("--surface-panel-strong", colors.surfacePanelStrong);
  root.style.setProperty("--surface-card", colors.surfaceCard);
  root.style.setProperty("--text-main", colors.textMain);
  root.style.setProperty("--text-sub", colors.textSub);
  root.style.setProperty("--text-faint", colors.textFaint);
  localStorage.setItem(ACCENT_KEY, id);
}

function selectAccent(id: string) {
  applyAccent(id);
  showAccentPicker.value = false;
}

function handleLogout() {
  multiGameStore.disconnect();
  authStore.logout();
  router.push("/");
}

function handleKickedConfirm() {
  authStore.logout();
  multiGameStore.kicked = false;
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
    theme.value = savedTheme;
  } else {
    theme.value = "phrolova-light";
  }
  document.documentElement.setAttribute("data-theme", theme.value);

  const savedAccent = localStorage.getItem(ACCENT_KEY);
  if (savedAccent && ACCENTS.some(a => a.id === savedAccent)) {
    accentId.value = savedAccent;
  }
  applyAccent(accentId.value);

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

    <Teleport to="body">
      <div v-if="multiGameStore.kicked" class="kicked-overlay" @click.self="handleKickedConfirm">
        <div class="kicked-modal">
          <Icon icon="ph:warning-duotone" class="kicked-icon" />
          <h2 class="kicked-title">账号在别处登录</h2>
          <p class="kicked-desc">你的账号已在其他设备登录，当前会话已被强制退出。</p>
          <button class="kicked-btn" @click="handleKickedConfirm">确定</button>
        </div>
      </div>
    </Teleport>

    <div v-if="isHomeRoute" class="theme-controls">
      <button class="theme-toggle" type="button" @click="toggleTheme"
        :aria-label="theme === 'phrolova-light' ? '切换到暗色模式' : '切换到亮色模式'">
        <Icon :icon="theme === 'phrolova-light' ? 'ph:moon-duotone' : 'ph:sun-duotone'" />
      </button>
      <button class="theme-accent-btn" type="button" @click="showAccentPicker = !showAccentPicker"
        aria-label="选择主题色">
        <Icon icon="ph:palette-duotone" />
        <span class="theme-accent-dot" :style="{ background: 'var(--gold)' }" />
      </button>
      <Transition name="accent-pop">
        <div v-if="showAccentPicker" class="accent-picker">
          <p class="accent-picker-title">主题色</p>
          <div class="accent-grid">
            <button
              v-for="accent in ACCENTS"
              :key="accent.id"
              class="accent-swatch"
              :class="{ 'accent-swatch--active': accentId === accent.id }"
              :style="{ '--swatch-color': theme === 'phrolova-night' ? accent.dark.gold : accent.light.gold }"
              @click="selectAccent(accent.id)"
            >
              <span class="accent-swatch-dot" />
              <span class="accent-swatch-label">{{ accent.label }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style>
.theme-controls {
  position: fixed;
  top: 1.2rem;
  right: 1.2rem;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.theme-toggle {
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

.theme-accent-btn {
  position: relative;
  width: 2.6rem;
  height: 2.6rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: var(--surface-panel-strong);
  color: var(--text-sub);
  font-size: 1.2rem;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: transform 0.3s, border-color 0.3s, color 0.3s;
}

.theme-accent-btn:hover {
  border-color: var(--gold);
  color: var(--gold);
  transform: scale(1.1);
}

.theme-accent-dot {
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--shell-bg);
}

.accent-picker {
  position: absolute;
  top: calc(100% + 0.6rem);
  right: 0;
  z-index: 101;
  width: 220px;
  padding: 0.9rem;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--surface-panel-strong);
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.accent-picker-title {
  margin: 0 0 0.7rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-faint);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.accent-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.accent-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.5rem 0.3rem;
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.accent-swatch:hover {
  border-color: var(--swatch-color);
  background: color-mix(in oklab, var(--swatch-color) 8%, transparent);
}

.accent-swatch--active {
  border-color: var(--swatch-color);
  background: color-mix(in oklab, var(--swatch-color) 12%, transparent);
}

.accent-swatch-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--swatch-color);
}

.accent-swatch-label {
  font-size: 0.72rem;
  color: var(--text-sub);
  font-weight: 500;
}

.accent-swatch--active .accent-swatch-label {
  color: var(--text-main);
}

.accent-pop-enter-active,
.accent-pop-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.accent-pop-enter-from,
.accent-pop-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

.kicked-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px);
}
.kicked-modal {
  display: grid; justify-items: center; gap: 0.8rem;
  width: 100%; max-width: 360px; padding: 2rem 1.8rem;
  border: 1px solid color-mix(in oklab, var(--color-error) 40%, transparent);
  border-radius: 12px;
  background: var(--surface-panel-strong);
  text-align: center;
}
.kicked-icon {
  font-size: 2.8rem; color: var(--color-error);
}
.kicked-title {
  margin: 0; font-size: 1.2rem; font-weight: 900; color: var(--text-main);
}
.kicked-desc {
  margin: 0; color: var(--text-sub); font-size: 0.88rem; line-height: 1.6;
}
.kicked-btn {
  margin-top: 0.5rem; padding: 0.6rem 2rem;
  border: 1px solid var(--line-strong); border-radius: 8px;
  background: var(--surface-panel);
  color: var(--text-main); font-size: 0.9rem; font-weight: 600; cursor: pointer;
}
.kicked-btn:hover { border-color: var(--gold); color: var(--gold); }
</style>
