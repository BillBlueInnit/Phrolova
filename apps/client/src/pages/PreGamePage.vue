<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import gsap from "gsap";

import { useDictionaryStore } from "@/stores/dictionary";
import { useSingleGameStore } from "@/stores/singleGame";
import type { Difficulty, QuizType } from "@/types/game";

const THEME_KEY = "phrolova_theme";

const dictionaryStore = useDictionaryStore();
const singleGameStore = useSingleGameStore();
const router = useRouter();

const config = reactive({
  quizType: "resonator" as QuizType,
  difficulty: "hard" as Difficulty,
});

const loading = ref(false);
let ctx: gsap.Context | null = null;

const currentTheme = ref<"phrolova-light" | "phrolova-night">(
  (localStorage.getItem(THEME_KEY) as "phrolova-light" | "phrolova-night") || "phrolova-light",
);

function toggleTheme() {
  const next = currentTheme.value === "phrolova-light" ? "phrolova-night" : "phrolova-light";
  currentTheme.value = next;
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
}

async function startGame() {
  if (loading.value) return;
  loading.value = true;
  try {
    singleGameStore.setConfig(config.quizType, config.difficulty);
    await dictionaryStore.ensureLoaded(config.quizType);
    router.push("/single/play");
  } catch {
    loading.value = false;
  }
}

onMounted(() => {
  nextTick(() => {
    ctx = gsap.context(() => {
      gsap.from(".pg-glass-header", { opacity: 0, y: -20, duration: 0.5, ease: "power2.out" });
      gsap.from(".pg-cards", { opacity: 0, y: 40, duration: 0.7, ease: "power3.out", delay: 0.12 });
      gsap.from(".pg-foot", { opacity: 0, y: 24, duration: 0.55, ease: "power2.out", delay: 0.3 });
      gsap.from(".pg-orb", { opacity: 0, scale: 0.6, duration: 1, ease: "power3.out", delay: 0.5 });
    });
  });
});

onBeforeUnmount(() => {
  ctx?.revert();
});
</script>

<template>
  <div class="pg-root">
    <div class="pg-shell">
      <!-- ── 共享毛玻璃 Header ── -->
      <header class="pg-glass-header">
        <div class="pg-glass-left">
          <button class="pg-glass-back" @click="router.push('/')" aria-label="返回主页">
            <Icon icon="ph:arrow-left-duotone" aria-hidden="true" />
          </button>
          <div class="pg-glass-info">
            <span class="pg-glass-kicker">单人 · 模式选择</span>
            <span class="pg-glass-title">Select Mode</span>
          </div>
        </div>

        <div class="pg-glass-actions">
          <button class="pg-glass-btn pg-glass-theme" @click="toggleTheme" :title="currentTheme === 'phrolova-light' ? '暗色模式' : '亮色模式'">
            <Icon :icon="currentTheme === 'phrolova-light' ? 'ph:moon-duotone' : 'ph:sun-duotone'" aria-hidden="true" />
          </button>
        </div>
      </header>

      <!-- ── 装饰光球 ── -->
      <div class="pg-orb" aria-hidden="true"></div>

      <!-- ── 模式卡片 ── -->
      <div class="pg-cards">
        <button
          class="pg-card"
          :class="{ 'pg-card--active': config.quizType === 'resonator' }"
          @click="config.quizType = 'resonator'"
        >
          <div class="pg-card-border" aria-hidden="true"></div>
          <div class="pg-card-glow" aria-hidden="true"></div>

          <div class="pg-card-badge">
            <Icon icon="ph:user-circle-duotone" aria-hidden="true" />
          </div>

          <div class="pg-card-body">
            <span class="pg-card-kicker">RESONATOR</span>
            <strong class="pg-card-title">共鸣者模式</strong>
            <p class="pg-card-desc">每题 <em>4</em> 次猜测机会，比较属性、星级、武器、出生地与实装版本。</p>

            <div class="pg-card-stats">
              <div class="pg-card-stat">
                <Icon icon="ph:target-duotone" aria-hidden="true" />
                <span>4 次猜测</span>
              </div>
              <div class="pg-card-stat">
                <Icon icon="ph:columns-duotone" aria-hidden="true" />
                <span>5 个字段</span>
              </div>
            </div>
          </div>

          <div class="pg-card-check">
            <Icon v-if="config.quizType === 'resonator'" icon="ph:check-circle-duotone" aria-hidden="true" />
            <Icon v-else icon="ph:circle-duotone" aria-hidden="true" />
          </div>
        </button>

        <button
          class="pg-card"
          :class="{ 'pg-card--active': config.quizType === 'skeleton' }"
          @click="config.quizType = 'skeleton'"
        >
          <div class="pg-card-border" aria-hidden="true"></div>
          <div class="pg-card-glow" aria-hidden="true"></div>

          <div class="pg-card-badge">
            <Icon icon="ph:ghost-duotone" aria-hidden="true" />
          </div>

          <div class="pg-card-body">
            <span class="pg-card-kicker">SKELETON</span>
            <strong class="pg-card-title">声骸模式</strong>
            <p class="pg-card-desc">每题 <em>8</em> 次猜测机会，反馈属性、COST、技能、套装与掉落位置。</p>

            <div class="pg-card-stats">
              <div class="pg-card-stat">
                <Icon icon="ph:target-duotone" aria-hidden="true" />
                <span>8 次猜测</span>
              </div>
              <div class="pg-card-stat">
                <Icon icon="ph:columns-duotone" aria-hidden="true" />
                <span>3-5 个字段</span>
              </div>
            </div>
          </div>

          <div class="pg-card-check">
            <Icon v-if="config.quizType === 'skeleton'" icon="ph:check-circle-duotone" aria-hidden="true" />
            <Icon v-else icon="ph:circle-duotone" aria-hidden="true" />
          </div>
        </button>
      </div>

      <!-- ── 底部操作 ── -->
      <div class="pg-foot">
        <Transition name="pg-diff-fade">
          <div v-if="config.quizType === 'skeleton'" class="pg-diff" key="diff">
            <span class="pg-diff-label">DIFFICULTY</span>
            <div class="pg-diff-tabs">
              <button
                class="pg-diff-tab"
                :class="{ 'pg-diff-tab--active': config.difficulty === 'easy' }"
                @click="config.difficulty = 'easy'"
              >
                <Icon icon="ph:leaf-duotone" aria-hidden="true" /> 简单
              </button>
              <button
                class="pg-diff-tab"
                :class="{ 'pg-diff-tab--active': config.difficulty === 'hard' }"
                @click="config.difficulty = 'hard'"
              >
                <Icon icon="ph:flame-duotone" aria-hidden="true" /> 困难
              </button>
            </div>
          </div>
        </Transition>

        <button class="pg-start" :disabled="loading" @click="startGame">
          <Icon icon="ph:play-circle-duotone" aria-hidden="true" />
          {{ loading ? "加载中..." : "开始挑战" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pg-root {
  width: 100vw;
  height: 100dvh;
  margin-left: calc(50% - 50vw);
  max-width: 100vw;
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 60% at 50% 30%, color-mix(in oklab, var(--gold) 6%, transparent), transparent),
    radial-gradient(ellipse 60% 50% at 15% 80%, color-mix(in oklab, var(--gold) 4%, transparent), transparent),
    radial-gradient(ellipse 50% 40% at 85% 20%, color-mix(in oklab, var(--gold) 3%, transparent), transparent),
    var(--shell-bg-deep);
}

.pg-shell {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 1.2rem;
  padding: 0.5rem 1rem 1.2rem;
  overflow: hidden;
  position: relative;
}

/* ── 装饰光球 ── */
.pg-orb {
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  width: min(50vw, 420px);
  height: min(50vw, 420px);
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in oklab, var(--gold) 10%, transparent) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

/* ── Header ── */
.pg-glass-header {
  position: relative; z-index: 2;
  display: flex; align-items: center; justify-content: space-between; gap: 0.8rem;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--line-soft); border-radius: 10px;
  background: color-mix(in oklab, var(--surface-panel-strong) 72%, transparent);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 4px 24px color-mix(in oklab, var(--shadow-plate) 40%, transparent);
}

.pg-glass-left { display: flex; align-items: center; gap: 0.7rem; min-width: 0; flex: 1; }
.pg-glass-back {
  display: grid; place-items: center; width: 2.2rem; height: 2.2rem;
  border: 1px solid var(--line-strong); border-radius: 8px;
  background: color-mix(in oklab, var(--surface-panel) 60%, transparent);
  color: var(--text-sub); font-size: 1.1rem; cursor: pointer; flex-shrink: 0;
  transition: color 0.2s, border-color 0.2s;
}
.pg-glass-back:hover { color: var(--gold); border-color: var(--gold); }

.pg-glass-info { display: grid; gap: 0.1rem; min-width: 0; }
.pg-glass-kicker { color: var(--text-faint); font-size: 0.65rem; letter-spacing: 0.22em; text-transform: uppercase; }
.pg-glass-title { color: var(--text-main); font-size: 0.88rem; font-weight: 700; letter-spacing: 0.05em; }

.pg-glass-actions { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
.pg-glass-btn {
  display: grid; place-items: center; width: 2.2rem; height: 2.2rem;
  border: 1px solid var(--line-strong); border-radius: 8px;
  background: color-mix(in oklab, var(--surface-panel) 60%, transparent);
  color: var(--text-sub); font-size: 1.1rem; cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.pg-glass-btn:hover { color: var(--gold); border-color: var(--gold); }
.pg-glass-theme { color: var(--gold-soft); }

/* ── 卡片 ── */
.pg-cards {
  position: relative; z-index: 1;
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem;
  align-content: center; align-self: center;
  max-width: 56rem; width: 100%; margin: 0 auto;
}

.pg-card {
  position: relative;
  display: flex; flex-direction: column; gap: 1rem;
  padding: 1.8rem 1.6rem;
  border: 1px solid var(--line-soft); border-radius: 14px;
  background: linear-gradient(180deg, color-mix(in oklab, var(--surface-panel-strong) 94%, transparent), color-mix(in oklab, var(--surface-panel) 90%, transparent));
  backdrop-filter: blur(4px);
  cursor: pointer; text-align: left;
  transition: border-color 0.35s, background 0.35s, transform 0.35s, box-shadow 0.35s;
  overflow: hidden;
}
.pg-card:hover {
  border-color: color-mix(in oklab, var(--gold) 30%, transparent);
  transform: translateY(-4px);
}

.pg-card--active {
  border-color: color-mix(in oklab, var(--gold) 60%, transparent);
  background: linear-gradient(180deg, color-mix(in oklab, var(--gold) 10%, var(--surface-panel-strong)), color-mix(in oklab, var(--gold) 4%, var(--surface-panel)));
  box-shadow: 0 0 48px color-mix(in oklab, var(--gold) 14%, transparent), 0 12px 32px color-mix(in oklab, var(--shadow-plate) 60%, transparent);
}

.pg-card-border {
  position: absolute; inset: 0; border-radius: 14px; pointer-events: none;
  background: linear-gradient(135deg, transparent 0%, color-mix(in oklab, var(--gold) 6%, transparent) 100%);
  opacity: 0; transition: opacity 0.35s;
}
.pg-card--active .pg-card-border { opacity: 1; }

.pg-card-glow {
  position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
  background: radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--gold) 8%, transparent), transparent 60%);
  opacity: 0; transition: opacity 0.35s; pointer-events: none;
}
.pg-card--active .pg-card-glow { opacity: 1; }

.pg-card-badge {
  display: grid; place-items: center;
  width: 3.2rem; height: 3.2rem;
  border-radius: 12px;
  background: color-mix(in oklab, var(--gold) 10%, var(--surface-panel));
  color: var(--gold-soft); font-size: 1.8rem;
  transition: background 0.35s, color 0.35s, box-shadow 0.35s;
}
.pg-card--active .pg-card-badge {
  background: color-mix(in oklab, var(--gold) 18%, var(--surface-panel-strong));
  color: var(--gold);
  box-shadow: 0 0 20px color-mix(in oklab, var(--gold) 18%, transparent);
}

.pg-card-body { display: grid; gap: 0.4rem; }

.pg-card-kicker {
  color: var(--text-faint); font-size: 0.7rem; letter-spacing: 0.24em;
  text-transform: uppercase; font-weight: 600;
}

.pg-card-title { font-size: 1.4rem; font-weight: 900; letter-spacing: 0.05em; color: var(--text-main); }

.pg-card-desc { margin: 0; color: var(--text-sub); font-size: 0.86rem; line-height: 1.65; }
.pg-card-desc em { font-style: normal; font-weight: 700; color: var(--gold); }

.pg-card-stats {
  display: flex; gap: 1rem; margin-top: 0.3rem;
}

.pg-card-stat {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.25rem 0.55rem; border-radius: 6px;
  background: color-mix(in oklab, var(--text-main) 4%, transparent);
  color: var(--text-sub); font-size: 0.76rem; font-weight: 600;
}
.pg-card-stat :deep(svg) { font-size: 0.85rem; color: var(--gold-soft); }

.pg-card-check {
  position: absolute; top: 1rem; right: 1rem;
  font-size: 1.4rem; color: var(--text-faint);
  transition: color 0.35s;
}
.pg-card--active .pg-card-check { color: var(--gold); }

/* ── 底部 ── */
.pg-foot {
  position: relative; z-index: 2;
  display: flex; align-items: center; justify-content: center; gap: 1.5rem; flex-wrap: wrap;
  max-width: 56rem; width: 100%; margin: 0 auto;
}

.pg-diff { display: flex; align-items: center; gap: 0.6rem; }
.pg-diff-label { color: var(--text-faint); font-size: 0.68rem; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 600; }

.pg-diff-tabs {
  display: flex; border: 1px solid var(--line-soft); border-radius: 8px;
  background: var(--surface-panel); overflow: hidden;
}
.pg-diff-tab {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.5rem 0.95rem; border: none;
  background: transparent; color: var(--text-sub); font-size: 0.85rem; cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.pg-diff-tab--active { background: color-mix(in oklab, var(--gold) 14%, transparent); color: var(--gold); font-weight: 600; }

.pg-start {
  display: inline-flex; align-items: center; gap: 0.55rem;
  padding: 0.8rem 2.6rem;
  border: 1px solid color-mix(in oklab, var(--gold) 50%, transparent); border-radius: 12px;
  background: linear-gradient(135deg, color-mix(in oklab, var(--gold) 22%, var(--surface-panel-strong)), color-mix(in oklab, var(--gold) 12%, var(--surface-panel)));
  color: var(--gold); font-size: 1.05rem; font-weight: 700; letter-spacing: 0.06em;
  cursor: pointer; transition: all 0.3s;
  box-shadow: 0 4px 24px color-mix(in oklab, var(--gold) 12%, transparent);
}
.pg-start:hover {
  background: linear-gradient(135deg, color-mix(in oklab, var(--gold) 32%, var(--surface-panel-strong)), color-mix(in oklab, var(--gold) 18%, var(--surface-panel)));
  transform: translateY(-3px);
  box-shadow: 0 8px 32px color-mix(in oklab, var(--gold) 22%, transparent);
}
.pg-start:disabled { opacity: 0.5; cursor: wait; transform: none; }

/* ── difficulty 过渡 ── */
.pg-diff-fade-enter-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.pg-diff-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.pg-diff-fade-enter-from,
.pg-diff-fade-leave-to { opacity: 0; transform: translateY(8px); }

/* ── 响应式 ── */
@media (max-width: 720px) {
  .pg-shell { padding: 0.4rem 0.5rem 0.7rem; gap: 0.8rem; }
  .pg-glass-header { padding: 0.5rem 0.7rem; }
  .pg-cards { grid-template-columns: 1fr; gap: 0.8rem; }
  .pg-card { padding: 1.4rem 1.2rem; }
  .pg-card-badge { width: 2.6rem; height: 2.6rem; font-size: 1.5rem; }
  .pg-card-title { font-size: 1.2rem; }
  .pg-foot { flex-direction: column; gap: 0.8rem; }
  .pg-start { width: 100%; justify-content: center; }
}

@media (max-width: 480px) {
  .pg-card-stats { flex-direction: column; gap: 0.4rem; }
}
</style>
