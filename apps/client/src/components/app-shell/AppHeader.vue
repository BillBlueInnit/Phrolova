<script setup lang="ts">
import { computed } from "vue";

interface Props {
  isAuthenticated: boolean;
  playerId: string;
  theme: "phrolova-light" | "phrolova-night";
}

const props = defineProps<Props>();

const emit = defineEmits<{
  logout: [];
  toggleTheme: [];
}>();

const themeLabel = computed(() => (props.theme === "phrolova-night" ? "浅色" : "深色"));
const themeIcon = computed(() => (props.theme === "phrolova-night" ? "ph:moon-duotone" : "ph:sun-duotone"));
const accountLabel = computed(() => (props.isAuthenticated ? props.playerId || "账号中心" : "登录"));
</script>

<template>
  <header class="app-header">
    <div class="app-header__inner">
      <RouterLink to="/" class="app-brand" aria-label="返回首页">
        <span class="app-brand__mark">弗</span>
        <span class="app-brand__copy">
          <span class="app-brand__name">弗一把</span>
          <span class="app-brand__meta">Game console</span>
        </span>
      </RouterLink>

      <div class="app-header__actions">
        <RouterLink v-if="!isAuthenticated" class="header-chip header-chip--accent" to="/auth">
          登录
        </RouterLink>
        <RouterLink v-else class="header-chip header-chip--ghost" to="/auth">
          {{ accountLabel }}
        </RouterLink>

        <button
          class="header-chip header-chip--ghost header-chip--icon"
          type="button"
          :aria-label="`切换到${themeLabel}`"
          :title="`切换到${themeLabel}`"
          @click="emit('toggleTheme')"
        >
          <Icon :icon="themeIcon" class="header-chip__icon" aria-hidden="true" />
        </button>

        <button
          v-if="isAuthenticated"
          class="header-chip header-chip--danger"
          type="button"
          @click="emit('logout')"
        >
          退出
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 20;
  padding: 0.75rem 1rem 0;
  pointer-events: none;
}

.app-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  max-width: 1480px;
  margin: 0 auto;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line-soft);
  background:
    linear-gradient(180deg, color-mix(in oklab, var(--surface-panel-strong) 92%, transparent), color-mix(in oklab, var(--surface-panel) 90%, transparent));
  backdrop-filter: blur(10px);
  box-shadow: 10px 10px 0 var(--shadow-plate);
  clip-path: polygon(0 12px, 12px 0, calc(100% - 16px) 0, 100% 16px, 100% calc(100% - 12px), calc(100% - 14px) 100%, 0 100%);
  pointer-events: auto;
}

.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.82rem;
  min-width: 0;
}

.app-brand__mark {
  display: grid;
  place-items: center;
  width: 2.7rem;
  height: 2.7rem;
  border: 1px solid color-mix(in oklab, var(--gold) 42%, transparent);
  background: linear-gradient(180deg, color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong)), var(--surface-panel));
  color: color-mix(in oklab, var(--gold) 72%, var(--text-main));
  font-size: 1.05rem;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.app-brand__copy {
  display: grid;
  gap: 0.16rem;
  min-width: 0;
}

.app-brand__name {
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.app-brand__meta {
  color: var(--text-faint);
  font-size: 0.72rem;
  letter-spacing: 0.26em;
  text-transform: uppercase;
}

.app-header__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.6rem;
}

.header-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0.45rem 0.86rem;
  border: 1px solid var(--line-strong);
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  color: var(--text-main);
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease, box-shadow 180ms ease;
}

.header-chip:hover {
  transform: translateY(-2px);
  border-color: color-mix(in oklab, var(--gold) 36%, transparent);
  box-shadow: 8px 8px 0 var(--shadow-plate);
}

.header-chip--accent {
  border-color: color-mix(in oklab, var(--gold) 42%, transparent);
  background: linear-gradient(180deg, color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong)), color-mix(in oklab, var(--gold) 8%, var(--surface-panel)));
  color: color-mix(in oklab, var(--gold) 58%, var(--text-main));
}

.header-chip--ghost {
  color: var(--text-sub);
}

.header-chip--danger {
  color: var(--text-main);
}

.header-chip--icon {
  min-width: 42px;
  padding-inline: 0.7rem;
}

.header-chip__icon {
  font-size: 1rem;
  line-height: 1;
}

@media (max-width: 720px) {
  .app-header {
    padding-inline: 0.5rem;
  }

  .app-header__inner {
    padding: 0.75rem 0.82rem;
  }

  .app-brand__meta {
    display: none;
  }
}
</style>
