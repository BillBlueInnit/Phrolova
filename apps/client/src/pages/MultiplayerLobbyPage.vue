<script setup lang="ts">
import { computed, onMounted, reactive, watch } from "vue";
import { useRouter } from "vue-router";

import StatusBanner from "@/components/shared/StatusBanner.vue";
import { useAuthStore } from "@/stores/auth";
import { useMultiGameStore } from "@/stores/multiGame";
import type { Difficulty, QuizType } from "@/types/game";

const authStore = useAuthStore();
const multiGameStore = useMultiGameStore();
const router = useRouter();

const config = reactive({
  quizType: "resonator" as QuizType,
  difficulty: "hard" as Difficulty,
  bestOf: 3,
  roomCode: "",
});

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
    await multiGameStore.joinQueue(config.quizType, config.difficulty);
  } catch (reason) {
    multiGameStore.error = reason instanceof Error ? reason.message : "进入匹配队列失败";
  }
}

watch(() => multiGameStore.roomState?.roomCode, (roomCode) => {
  if (roomCode) router.push("/multi/room");
});

onMounted(async () => {
  if (authStore.isAuthenticated) {
    await multiGameStore.resumeRoom().catch(() => undefined);
  }
});
</script>

<template>
  <div class="ml-screen">
    <div class="ml-shell">
      <!-- ── 顶部：标题 + 配置 ── -->
      <header class="ml-top">
        <div class="ml-top-copy">
          <p class="ml-kicker">多人 · 对战大厅</p>
          <h1 class="ml-page-title">Multiplayer Lobby</h1>
        </div>

        <div class="ml-config">
          <div class="ml-tabs">
            <button class="ml-tab" :class="{ 'ml-tab--active': config.quizType === 'resonator' }" @click="config.quizType = 'resonator'">
              <Icon icon="ph:user-duotone" class="ml-tab-icon" aria-hidden="true" /> 共鸣者
            </button>
            <button class="ml-tab" :class="{ 'ml-tab--active': config.quizType === 'skeleton' }" @click="config.quizType = 'skeleton'">
              <Icon icon="ph:ghost-duotone" class="ml-tab-icon" aria-hidden="true" /> 声骸
            </button>
          </div>

          <div class="ml-tabs">
            <button v-for="v in [1,3,5]" :key="v" class="ml-tab" :class="{ 'ml-tab--active': config.bestOf === v }" @click="config.bestOf = v">
              BO{{ v }}
            </button>
          </div>

          <div v-if="config.quizType === 'skeleton'" class="ml-tabs">
            <button class="ml-tab" :class="{ 'ml-tab--active': config.difficulty === 'easy' }" @click="config.difficulty = 'easy'">简单</button>
            <button class="ml-tab" :class="{ 'ml-tab--active': config.difficulty === 'hard' }" @click="config.difficulty = 'hard'">困难</button>
          </div>

          <span class="ml-config-summary">{{ queueSummary }}</span>
        </div>
      </header>

      <!-- ── 状态提示 ── -->
      <div class="status-stack">
        <StatusBanner v-if="!authStore.isAuthenticated" message="多人模式需要先登录账号" tone="error" />
        <StatusBanner v-else-if="multiGameStore.error" :message="multiGameStore.error" tone="error" />
        <StatusBanner v-else-if="multiGameStore.infoMessage" :message="multiGameStore.infoMessage" />
      </div>

      <!-- ── 中部：操作面板 ── -->
      <div v-if="authStore.isAuthenticated" class="ml-grid">
        <article class="ml-card ml-card--action">
          <div class="ml-card-icon">
            <Icon icon="ph:plus-circle-duotone" aria-hidden="true" />
          </div>
          <div class="ml-card-copy">
            <p class="ml-card-kicker">CREATE ROOM</p>
            <h2 class="ml-card-title">创建房间</h2>
            <p class="ml-card-desc">自定义题型与赛制，生成房间码邀请对手加入。</p>
          </div>
          <button class="ml-btn" @click="createRoom">
            <Icon icon="ph:plus-duotone" class="ml-btn-icon" aria-hidden="true" /> 创建房间
          </button>
        </article>

        <article class="ml-card ml-card--action">
          <div class="ml-card-icon">
            <Icon icon="ph:shuffle-duotone" aria-hidden="true" />
          </div>
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

        <article class="ml-card ml-card--action">
          <div class="ml-card-icon">
            <Icon icon="ph:sign-in-duotone" aria-hidden="true" />
          </div>
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

        <article class="ml-card ml-card--action">
          <div class="ml-card-icon">
            <Icon icon="ph:arrow-u-up-left-duotone" aria-hidden="true" />
          </div>
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

      <div v-else class="ml-card ml-card--empty">
        <div class="ml-empty-glyph">
          <Icon icon="ph:lock-duotone" aria-hidden="true" />
        </div>
        <p class="ml-kicker">NOTICE</p>
        <h2 class="ml-card-title">登录后可进入多人大厅</h2>
        <p class="ml-card-desc">账号体系接入实时房间、积分变动与排行榜同步。</p>
        <RouterLink class="ml-btn" style="display:inline-flex;text-decoration:none;margin-top:0.8rem" to="/auth">前往登录</RouterLink>
      </div>

      <!-- ── 底部：状态栏 ── -->
      <footer class="ml-foot">
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
  width: 100vw;
  margin-left: calc(50% - 50vw);
  max-width: 100vw;
  min-height: calc(100dvh - var(--site-header-height) - 1rem);
}

.ml-shell {
  min-height: calc(100dvh - var(--site-header-height) - 1rem);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 0.75rem;
  padding: 0 1rem 1rem;
}

/* ── 顶部 ── */
.ml-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.2rem;
  flex-wrap: wrap;
  padding-top: 0.4rem;
}

.ml-top-copy {
  display: grid;
  gap: 0.35rem;
}

.ml-kicker,
.ml-card-kicker {
  margin: 0;
  color: var(--text-faint);
  font-size: 0.72rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.ml-page-title {
  margin: 0;
  font-size: clamp(1.42rem, 1.18rem + 0.7vw, 2.1rem);
  font-weight: 900;
  letter-spacing: 0.05em;
}

.ml-config {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.ml-tabs {
  display: flex;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  background: var(--surface-panel);
  overflow: hidden;
}

.ml-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.45rem 0.9rem;
  border: none;
  background: transparent;
  color: var(--text-sub);
  font-size: 0.84rem;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.ml-tab--active {
  background: color-mix(in oklab, var(--gold) 14%, transparent);
  color: var(--gold);
  font-weight: 600;
}

.ml-tab-icon { font-size: 0.95rem; }

.ml-config-summary {
  margin-left: 0.4rem;
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  background: color-mix(in oklab, var(--gold) 4%, var(--surface-card));
  color: var(--text-sub);
  font-size: 0.82rem;
  font-weight: 600;
}

/* ── 中部卡片网格 ── */
.ml-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  min-height: 0;
  align-content: start;
}

.ml-card {
  padding: 1.15rem 1.18rem;
  border: 1px solid var(--line-soft);
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  box-shadow: 10px 10px 0 var(--shadow-plate);
  clip-path: polygon(0 18px, 18px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 18px) 100%, 0 100%);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  transition: transform 180ms ease, border-color 180ms ease;
}

.ml-card::after {
  content: "";
  position: absolute;
  inset: 0 auto auto 0;
  width: 84px;
  height: 1px;
  background: linear-gradient(90deg, var(--gold), transparent);
}

.ml-card--action {
  position: relative;
  min-height: 220px;
}

.ml-card--action:hover {
  transform: translateY(-4px);
  border-color: color-mix(in oklab, var(--gold) 34%, transparent);
}

.ml-card-icon {
  font-size: 2rem;
  color: var(--gold-soft);
  line-height: 1;
}

.ml-card-copy { flex: 1; }

.ml-card-title {
  margin: 0.15rem 0 0;
  font-size: 1.2rem;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.ml-card-desc {
  margin: 0.3rem 0 0;
  color: var(--text-sub);
  font-size: 0.84rem;
  line-height: 1.6;
}

.ml-card--empty {
  max-width: 520px;
  margin: 1rem auto 0;
  text-align: center;
  align-items: center;
}

.ml-empty-glyph {
  font-size: 2.4rem;
  color: var(--text-faint);
}

/* ── 按钮 ── */
.ml-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 1rem;
  border: 1px solid color-mix(in oklab, var(--gold) 40%, transparent);
  border-radius: 6px;
  background: color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong));
  color: var(--gold);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: auto;
}
.ml-btn:hover { background: color-mix(in oklab, var(--gold) 24%, var(--surface-panel-strong)); }

.ml-btn-icon { font-size: 1rem; }

.ml-btn-ghost {
  padding: 0.5rem 1rem;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--text-sub);
  font-size: 0.88rem;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.ml-btn-ghost:hover { border-color: var(--text-sub); color: var(--text-main); }

.ml-btn-row { display: flex; gap: 0.5rem; margin-top: auto; }

.ml-join-row {
  display: flex;
  gap: 0.5rem;
  margin-top: auto;
}

.ml-input {
  flex: 1;
  min-width: 0;
  min-height: 42px;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--shell-bg);
  color: var(--text-main);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  text-align: center;
}
.ml-input:focus { outline: none; border-color: color-mix(in oklab, var(--gold) 50%, transparent); }
.ml-input::placeholder { color: var(--text-faint); text-transform: none; letter-spacing: normal; }

/* ── 底部状态栏 ── */
.ml-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.6rem 1rem;
  border: 1px solid var(--line-soft);
  background: var(--surface-panel);
  border-radius: 6px;
}

.ml-foot-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-sub);
  font-size: 0.82rem;
}

.ml-foot-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-faint);
}

.ml-foot-dot--on {
  background: var(--color-success);
  box-shadow: 0 0 6px var(--color-success);
}

.ml-foot-hint {
  color: var(--text-faint);
  font-size: 0.78rem;
}

/* ── 响应式 ── */
@media (max-width: 960px) {
  .ml-shell { min-height: auto; }
  .ml-grid { grid-template-columns: 1fr; }
  .ml-top { flex-direction: column; }
}

@media (max-width: 720px) {
  .ml-shell { padding-inline: 0.5rem; }
  .ml-card { clip-path: polygon(0 12px, 12px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 12px) 100%, 0 100%); }
}

@media (max-width: 480px) {
  .ml-config { width: 100%; }
  .ml-join-row { flex-direction: column; }
  .ml-foot { flex-direction: column; align-items: flex-start; text-align: left; }
}
</style>
