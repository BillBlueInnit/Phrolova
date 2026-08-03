<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import gsap from "gsap";

import StatusBanner from "@/components/shared/StatusBanner.vue";
import { useAuthStore } from "@/stores/auth";
import { useMultiGameStore } from "@/stores/multiGame";
import type { Difficulty, QuizType } from "@/types/game";

const THEME_KEY = "phrolova_theme";

const authStore = useAuthStore();
const multiGameStore = useMultiGameStore();
const router = useRouter();

const config = reactive({
  quizType: "resonator" as QuizType,
  difficulty: "hard" as Difficulty,
  bestOf: 3,
  roomCode: "",
});

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

const queueSummary = computed(() => {
  if (config.quizType === "skeleton") {
    return `声骸 / ${config.difficulty === "easy" ? "简单" : "困难"} / BO${config.bestOf}`;
  }
  return `共鸣者 / BO${config.bestOf}`;
});

async function createRoom() {
  try {
    await multiGameStore.createRoom(config.quizType, config.bestOf, config.difficulty);
  } catch (reason) {
    multiGameStore.error = reason instanceof Error ? reason.message : "创建房间失败";
  }
}

async function joinRoom() {
  if (!config.roomCode.trim()) return;
  try {
    await multiGameStore.joinRoom(config.roomCode.trim().toUpperCase());
  } catch (reason) {
    multiGameStore.error = reason instanceof Error ? reason.message : "加入房间失败";
  }
}

async function randomMatch() {
  try {
    await multiGameStore.joinQueue(config.quizType, config.difficulty, config.bestOf);
  } catch (reason) {
    multiGameStore.error = reason instanceof Error ? reason.message : "进入匹配队列失败";
  }
}

watch(() => multiGameStore.roomState?.roomCode, (roomCode) => {
  if (roomCode) router.push("/multi/room");
});

onMounted(async () => {
  nextTick(() => {
    ctx = gsap.context(() => {
      gsap.from(".ml-glass-header", { opacity: 0, y: -20, duration: 0.45, ease: "power2.out" });
      gsap.from(".ml-card", { opacity: 0, y: 30, duration: 0.55, ease: "power3.out", stagger: 0.1, delay: 0.1 });
      gsap.from(".ml-foot", { opacity: 0, y: 16, duration: 0.4, ease: "power2.out", delay: 0.35 });
    });
  });
  if (authStore.isAuthenticated) {
    await multiGameStore.resumeRoom().catch(() => undefined);
  }
});

onBeforeUnmount(() => {
  ctx?.revert();
});
</script>

<template>
  <div class="ml-screen">
    <div class="ml-shell">
      <!-- ── 毛玻璃 Header ── -->
      <header class="ml-glass-header">
        <div class="ml-glass-left">
          <button class="ml-glass-back" @click="router.push('/')" aria-label="返回主页">
            <Icon icon="ph:arrow-left-duotone" aria-hidden="true" />
          </button>
          <div class="ml-glass-info">
            <span class="ml-glass-kicker">多人 · 对战大厅</span>
            <span class="ml-glass-title">Multiplayer Lobby</span>
          </div>
        </div>

        <div class="ml-glass-actions">
          <button class="ml-glass-btn ml-glass-theme" @click="toggleTheme" :title="currentTheme === 'phrolova-light' ? '暗色模式' : '亮色模式'">
            <Icon :icon="currentTheme === 'phrolova-light' ? 'ph:moon-duotone' : 'ph:sun-duotone'" aria-hidden="true" />
          </button>
        </div>
      </header>

      <!-- ── 配置行 ── -->
      <div v-if="!multiGameStore.inQueue" class="ml-config">
        <div class="ml-tabs">
          <button class="ml-tab" :class="{ 'ml-tab--active': config.quizType === 'resonator' }" @click="config.quizType = 'resonator'">
            <Icon icon="ph:user-duotone" class="ml-tab-icon" aria-hidden="true" /> 共鸣者
          </button>
          <button class="ml-tab" :class="{ 'ml-tab--active': config.quizType === 'skeleton' }" @click="config.quizType = 'skeleton'">
            <Icon icon="ph:ghost-duotone" class="ml-tab-icon" aria-hidden="true" /> 声骸
          </button>
        </div>

        <div class="ml-tabs">
          <button v-for="v in [1,3,5]" :key="v" class="ml-tab" :class="{ 'ml-tab--active': config.bestOf === v }" @click="config.bestOf = v">BO{{ v }}</button>
        </div>

        <div v-if="config.quizType === 'skeleton'" class="ml-tabs">
          <button class="ml-tab" :class="{ 'ml-tab--active': config.difficulty === 'easy' }" @click="config.difficulty = 'easy'">简单</button>
          <button class="ml-tab" :class="{ 'ml-tab--active': config.difficulty === 'hard' }" @click="config.difficulty = 'hard'">困难</button>
        </div>

        <span class="ml-config-summary">{{ queueSummary }}</span>
      </div>

      <!-- ── 状态提示 ── -->
      <div class="status-stack">
        <StatusBanner v-if="!authStore.isAuthenticated" message="多人模式需要先登录账号" tone="error" />
        <StatusBanner v-else-if="multiGameStore.error" :message="multiGameStore.error" tone="error" />
      </div>

      <!-- ── 匹配大厅 ── -->
      <div v-if="authStore.isAuthenticated && multiGameStore.inQueue" class="ml-match" key="match">
        <div class="ml-match-orb" aria-hidden="true"></div>

        <div class="ml-match-spinner">
          <div v-for="i in 3" :key="i" class="ml-match-ring" :style="{ animationDelay: `${(i - 1) * 0.25}s` }"></div>
          <div class="ml-match-core">
            <Icon icon="ph:shuffle-duotone" aria-hidden="true" />
          </div>
        </div>

        <div class="ml-match-info">
          <h2 class="ml-match-title">正在匹配</h2>
          <p class="ml-match-desc">Searching for opponent...</p>
          <span class="ml-match-chip">{{ queueSummary }}</span>
        </div>

        <button class="ml-btn" style="margin-top:0.5rem" @click="multiGameStore.cancelQueue()">
          <Icon icon="ph:x-circle-duotone" class="ml-btn-icon" aria-hidden="true" /> 取消匹配
        </button>
      </div>

      <!-- ── 中部：操作面板 ── -->
      <div v-else-if="authStore.isAuthenticated" class="ml-grid">
        <article class="ml-card">
          <div class="ml-card-icon"><Icon icon="ph:plus-circle-duotone" aria-hidden="true" /></div>
          <div class="ml-card-copy">
            <p class="ml-card-kicker">CREATE ROOM</p>
            <h2 class="ml-card-title">创建房间</h2>
            <p class="ml-card-desc">自定义题型与赛制，生成房间码邀请对手加入。</p>
          </div>
          <button class="ml-btn" @click="createRoom">
            <Icon icon="ph:plus-duotone" class="ml-btn-icon" aria-hidden="true" /> 创建房间
          </button>
        </article>

        <article class="ml-card">
          <div class="ml-card-icon"><Icon icon="ph:shuffle-duotone" aria-hidden="true" /></div>
          <div class="ml-card-copy">
            <p class="ml-card-kicker">RANDOM MATCH</p>
            <h2 class="ml-card-title">随机匹配</h2>
            <p class="ml-card-desc">自动匹配在线玩家，固定 BO3 赛制，匹配成功即进入房间。</p>
          </div>
          <div class="ml-btn-row">
            <button class="ml-btn" @click="randomMatch">
              <Icon icon="ph:lightning-duotone" class="ml-btn-icon" aria-hidden="true" /> 开始匹配
            </button>
            <button class="ml-btn-ghost" @click="multiGameStore.cancelQueue()">取消</button>
          </div>
        </article>

        <article class="ml-card">
          <div class="ml-card-icon"><Icon icon="ph:sign-in-duotone" aria-hidden="true" /></div>
          <div class="ml-card-copy">
            <p class="ml-card-kicker">JOIN ROOM</p>
            <h2 class="ml-card-title">加入房间</h2>
            <p class="ml-card-desc">输入 6 位房间码，快速加入好友创建的已有房间。</p>
          </div>
          <div class="ml-join-row">
            <input v-model="config.roomCode" class="ml-input" maxlength="6" placeholder="输入房间码" />
            <button class="ml-btn" @click="joinRoom">加入</button>
          </div>
        </article>

        <article class="ml-card">
          <div class="ml-card-icon"><Icon icon="ph:arrow-u-up-left-duotone" aria-hidden="true" /></div>
          <div class="ml-card-copy">
            <p class="ml-card-kicker">RESUME</p>
            <h2 class="ml-card-title">恢复房间</h2>
            <p class="ml-card-desc">返回当前进行中的房间继续对战，断线重连保留状态。</p>
          </div>
          <RouterLink class="ml-btn" style="display:inline-flex;text-decoration:none" to="/multi/room">
            <Icon icon="ph:arrow-right-duotone" class="ml-btn-icon" aria-hidden="true" /> 前往房间
          </RouterLink>
        </article>
      </div>

      <div v-else class="ml-empty">
        <div class="ml-empty-glyph"><Icon icon="ph:lock-duotone" aria-hidden="true" /></div>
        <p class="ml-empty-kicker">NOTICE</p>
        <h2 class="ml-empty-title">登录后可进入多人大厅</h2>
        <p class="ml-empty-desc">账号体系接入实时房间、积分变动与排行榜同步。</p>
        <RouterLink class="ml-btn" style="display:inline-flex;text-decoration:none" to="/auth">前往登录</RouterLink>
      </div>

      <!-- ── 底部状态栏 ── -->
      <footer v-if="!multiGameStore.inQueue" class="ml-foot">
        <span class="ml-foot-status">
          <span class="ml-foot-dot" :class="{ 'ml-foot-dot--on': authStore.isAuthenticated }"></span>
          {{ authStore.isAuthenticated ? `已登录 · ${authStore.playerId}` : "未登录" }}
        </span>
        <span class="ml-foot-hint">选择一个模式开始</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.ml-screen {
  width: 100vw; height: 100dvh;
  margin-left: calc(50% - 50vw); max-width: 100vw;
  overflow: hidden;
}

.ml-shell {
  height: 100dvh;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  gap: 0.6rem;
  padding: 0.5rem 1rem 0.6rem;
  overflow: hidden;
}

/* ── Header ── */
.ml-glass-header {
  display: flex; align-items: center; justify-content: space-between; gap: 0.8rem;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--line-soft); border-radius: 10px;
  background: color-mix(in oklab, var(--surface-panel-strong) 72%, transparent);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 4px 24px color-mix(in oklab, var(--shadow-plate) 40%, transparent);
}

.ml-glass-left { display: flex; align-items: center; gap: 0.7rem; min-width: 0; flex: 1; }
.ml-glass-back {
  display: grid; place-items: center; width: 2.2rem; height: 2.2rem;
  border: 1px solid var(--line-strong); border-radius: 8px;
  background: color-mix(in oklab, var(--surface-panel) 60%, transparent);
  color: var(--text-sub); font-size: 1.1rem; cursor: pointer; flex-shrink: 0;
  transition: color 0.2s, border-color 0.2s;
}
.ml-glass-back:hover { color: var(--gold); border-color: var(--gold); }

.ml-glass-info { display: grid; gap: 0.1rem; min-width: 0; }
.ml-glass-kicker { color: var(--text-faint); font-size: 0.65rem; letter-spacing: 0.22em; text-transform: uppercase; }
.ml-glass-title { color: var(--text-main); font-size: 0.88rem; font-weight: 700; letter-spacing: 0.05em; }

.ml-glass-actions { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
.ml-glass-btn {
  display: grid; place-items: center; width: 2.2rem; height: 2.2rem;
  border: 1px solid var(--line-strong); border-radius: 8px;
  background: color-mix(in oklab, var(--surface-panel) 60%, transparent);
  color: var(--text-sub); font-size: 1.1rem; cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.ml-glass-btn:hover { color: var(--gold); border-color: var(--gold); }
.ml-glass-theme { color: var(--gold-soft); }

/* ── 配置行 ── */
.ml-config {
  display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;
}

.ml-tabs {
  display: flex; border: 1px solid var(--line-soft); border-radius: 6px;
  background: var(--surface-panel); overflow: hidden;
}
.ml-tab {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.4rem 0.85rem; border: none;
  background: transparent; color: var(--text-sub); font-size: 0.82rem; cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.ml-tab--active { background: color-mix(in oklab, var(--gold) 14%, transparent); color: var(--gold); font-weight: 600; }
.ml-tab-icon { font-size: 0.9rem; }

.ml-config-summary {
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--line-soft); border-radius: 6px;
  background: color-mix(in oklab, var(--gold) 4%, var(--surface-card));
  color: var(--text-sub); font-size: 0.8rem; font-weight: 600;
}

/* ── 卡片网格 ── */
.ml-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.8rem;
  min-height: 0; align-content: start; overflow: auto;
}

.ml-card {
  display: flex; flex-direction: column; gap: 0.6rem;
  padding: 1.1rem 1.15rem;
  border: 1px solid var(--line-soft); border-radius: 10px;
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  transition: border-color 0.3s, transform 0.3s;
}
.ml-card:hover { border-color: color-mix(in oklab, var(--gold) 30%, transparent); transform: translateY(-3px); }

.ml-card-icon { font-size: 1.8rem; color: var(--gold-soft); line-height: 1; }
.ml-card-copy { flex: 1; }

.ml-card-kicker { margin: 0; color: var(--text-faint); font-size: 0.68rem; letter-spacing: 0.22em; text-transform: uppercase; }
.ml-card-title { margin: 0.12rem 0 0; font-size: 1.15rem; font-weight: 900; letter-spacing: 0.05em; }
.ml-card-desc { margin: 0.25rem 0 0; color: var(--text-sub); font-size: 0.82rem; line-height: 1.55; }

/* ── 匹配大厅 ── */
.ml-match {
  display: grid; justify-items: center; align-content: center; gap: 1.2rem;
  min-height: 0; position: relative; overflow: hidden;
}

.ml-match-orb {
  position: absolute; top: 50%; left: 50%; translate: -50% -50%;
  width: min(40vw, 300px); height: min(40vw, 300px); border-radius: 50%;
  background: radial-gradient(circle, color-mix(in oklab, var(--gold) 14%, transparent) 0%, transparent 70%);
  pointer-events: none; z-index: 0;
  animation: mlMatchPulse 2s ease-in-out infinite;
}

@keyframes mlMatchPulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
  50% { transform: translate(-50%, -50%) scale(1.25); opacity: 1; }
}

.ml-match-spinner {
  position: relative; z-index: 1;
  width: 120px; height: 120px;
  display: grid; place-items: center;
}

.ml-match-ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 1.5px solid color-mix(in oklab, var(--gold) 20%, transparent);
  animation: mlRingExpand 1.2s ease-out infinite;
}

@keyframes mlRingExpand {
  0% { transform: scale(0.5); opacity: 0.8; }
  100% { transform: scale(1.4); opacity: 0; }
}

.ml-match-core {
  position: relative; z-index: 1;
  display: grid; place-items: center;
  width: 2.4rem; height: 2.4rem; border-radius: 50%;
  background: color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong));
  color: var(--gold); font-size: 1.3rem;
  box-shadow: 0 0 20px color-mix(in oklab, var(--gold) 20%, transparent);
}

.ml-match-info {
  position: relative; z-index: 1;
  display: grid; justify-items: center; gap: 0.3rem; text-align: center;
}

.ml-match-title { margin: 0; font-size: 1.4rem; font-weight: 900; letter-spacing: 0.06em; }
.ml-match-desc { margin: 0; color: var(--text-sub); font-size: 0.9rem; }

.ml-match-chip {
  display: inline-block; margin-top: 0.3rem;
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--line-soft); border-radius: 6px;
  background: color-mix(in oklab, var(--gold) 4%, var(--surface-card));
  color: var(--text-sub); font-size: 0.8rem; font-weight: 600;
}

/* ── 空状态 ── */
.ml-empty {
  display: grid; justify-items: center; align-content: center; gap: 0.6rem;
  text-align: center; min-height: 0;
}
.ml-empty-glyph { font-size: 2.2rem; color: var(--text-faint); }
.ml-empty-kicker { margin: 0; color: var(--text-faint); font-size: 0.7rem; letter-spacing: 0.24em; text-transform: uppercase; }
.ml-empty-title { margin: 0; font-size: 1.2rem; font-weight: 900; }
.ml-empty-desc { margin: 0; color: var(--text-sub); font-size: 0.84rem; line-height: 1.6; }

/* ── 按钮 ── */
.ml-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.5rem 1rem;
  border: 1px solid color-mix(in oklab, var(--gold) 40%, transparent); border-radius: 6px;
  background: color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong));
  color: var(--gold); font-size: 0.85rem; font-weight: 600; cursor: pointer;
  transition: background 0.2s; white-space: nowrap; margin-top: auto;
}
.ml-btn:hover { background: color-mix(in oklab, var(--gold) 24%, var(--surface-panel-strong)); }
.ml-btn-icon { font-size: 0.95rem; }

.ml-btn-ghost {
  padding: 0.5rem 1rem;
  border: 1px solid var(--line-strong); border-radius: 6px;
  background: transparent; color: var(--text-sub); font-size: 0.85rem; cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.ml-btn-ghost:hover { border-color: var(--text-sub); color: var(--text-main); }
.ml-btn-row { display: flex; gap: 0.5rem; margin-top: auto; }

.ml-join-row { display: flex; gap: 0.5rem; margin-top: auto; }
.ml-input {
  flex: 1; min-width: 0; min-height: 42px;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--line-strong); border-radius: 6px;
  background: var(--shell-bg); color: var(--text-main);
  text-transform: uppercase; letter-spacing: 0.18em; text-align: center;
}
.ml-input:focus { outline: none; border-color: color-mix(in oklab, var(--gold) 50%, transparent); }
.ml-input::placeholder { color: var(--text-faint); text-transform: none; letter-spacing: normal; }

/* ── 底部状态栏 ── */
.ml-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 0.8rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--line-soft); border-radius: 8px;
  background: var(--surface-panel);
}
.ml-foot-status { display: flex; align-items: center; gap: 0.45rem; color: var(--text-sub); font-size: 0.8rem; }
.ml-foot-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-faint); }
.ml-foot-dot--on { background: var(--color-success); box-shadow: 0 0 6px var(--color-success); }
.ml-foot-hint { color: var(--text-faint); font-size: 0.76rem; }

/* ── 响应式 ── */
@media (max-width: 960px) {
  .ml-grid { grid-template-columns: 1fr; }
}

@media (max-width: 720px) {
  .ml-shell { padding: 0.4rem 0.5rem 0.5rem; gap: 0.45rem; }
  .ml-glass-header { border-radius: 0; border-left: none; border-right: none; border-top: none; padding: 0.5rem 0.7rem; }
  .ml-card { border-radius: 8px; }
}

@media (max-width: 480px) {
  .ml-config { gap: 0.4rem; }
  .ml-tab { padding: 0.35rem 0.6rem; font-size: 0.78rem; }
  .ml-join-row { flex-direction: column; }
  .ml-foot { flex-direction: column; align-items: flex-start; gap: 0.3rem; }
}
</style>
