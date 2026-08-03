<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, shallowRef, ref, watch } from "vue";
import { useRoute } from "vue-router";
import gsap from "gsap";

import { useAuthStore } from "@/stores/auth";
import { useMultiGameStore } from "@/stores/multiGame";
import type { CaptchaResponse } from "@/types/game";
import { apiPath, requestJson } from "@/utils/http";

const route = useRoute();
const authStore = useAuthStore();
const multiGameStore = useMultiGameStore();

const frolovaKey = ref(0);
const frolovaRef = shallowRef<HTMLElement | null>(null);
const menuRef = shallowRef<HTMLElement | null>(null);
let frolovaX: gsap.QuickToFunc | null = null;
let frolovaY: gsap.QuickToFunc | null = null;
let frolovaRX: gsap.QuickToFunc | null = null;
let frolovaRY: gsap.QuickToFunc | null = null;
let ctx: gsap.Context | null = null;

function onMouseMove(e: MouseEvent) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const tx = ((e.clientX - cx) / cx) * 30;
  const ty = ((e.clientY - cy) / cy) * 20;
  frolovaX?.(tx);
  frolovaY?.(ty);
  frolovaRX?.(tx * 0.3);
  frolovaRY?.(-ty * 0.3);
}

function setupGsap() {
  ctx = gsap.context(() => {
    const portrait = frolovaRef.value;
    if (portrait) {
      frolovaX = gsap.quickTo(portrait, "x", { duration: 0.6, ease: "power2.out" });
      frolovaY = gsap.quickTo(portrait, "y", { duration: 0.6, ease: "power2.out" });
      frolovaRX = gsap.quickTo(portrait, "rotateY", { duration: 0.6, ease: "power2.out" });
      frolovaRY = gsap.quickTo(portrait, "rotateX", { duration: 0.6, ease: "power2.out" });

      gsap.from(portrait, { opacity: 0, y: 40, duration: 1.5, ease: "power2.out" });
      gsap.to(portrait, { y: -18, scale: 1.015, duration: 4, ease: "sine.inOut", yoyo: true, repeat: -1, delay: 1.5 });

      const img = portrait.querySelector("img");
      if (img) {
        gsap.from(img, { opacity: 0, duration: 1.2, ease: "power2.out", delay: 0.3 });
      }
    }

    const items = menuRef.value?.querySelectorAll(".menu-li");
    if (items) {
      gsap.from(items, {
        opacity: 0,
        x: 60,
        duration: 0.7,
        ease: "power2.out",
        stagger: 0.15,
        delay: 0.15,
      });
    }
  });
}

async function resetFrolova() {
  frolovaKey.value = 0;
  await nextTick();
  frolovaKey.value = Date.now();
  await nextTick();
  ctx?.revert();
  setupGsap();
}

watch(() => route.name, (name) => {
  if (name === "home") resetFrolova();
}, { immediate: true });

onMounted(() => {
  window.addEventListener("mousemove", onMouseMove);
  setupGsap();
});

onBeforeUnmount(() => {
  window.removeEventListener("mousemove", onMouseMove);
  ctx?.revert();
});

const showAuthModal = shallowRef(false);
const authMode = shallowRef<"login" | "register">("login");
const captchaImage = shallowRef("");
const captchaId = shallowRef("");
const localError = shallowRef("");
const form = reactive({
  username: "",
  password: "",
  captchaText: "",
});

const menuItems = [
  { cn: "单人游戏", en: "Single Player", to: "/single", icon: "ph:user-duotone" },
  { cn: "多人对战", en: "Multiplayer", to: "/multi", icon: "ph:users-three-duotone" },
  { cn: "机制规则", en: "Game Rules", to: "/rules", icon: "ph:book-open-text-duotone" },
  { cn: "共鸣榜", en: "Leaderboard", to: "/leaderboard", icon: "ph:trophy-duotone" },
] as const;

async function loadCaptcha() {
  const data = await requestJson<CaptchaResponse>(apiPath("/auth/captcha"));
  captchaImage.value = data.image || "";
  captchaId.value = data.captcha_id || "";
}

async function submitAuth() {
  localError.value = "";
  try {
    const payload = {
      username: form.username.trim(),
      password: form.password,
      captchaId: captchaId.value,
      captchaText: form.captchaText.trim(),
    };
    if (authMode.value === "login") {
      await authStore.login(payload);
    } else {
      await authStore.register(payload);
    }
    closeAuthModal();
  } catch (reason) {
    localError.value = reason instanceof Error ? reason.message : "账号操作失败";
    await loadCaptcha();
    form.captchaText = "";
  }
}

function openAuthModal(mode: "login" | "register" = "login") {
  authMode.value = mode;
  showAuthModal.value = true;
  localError.value = "";
  form.username = "";
  form.password = "";
  form.captchaText = "";
  loadCaptcha().catch(() => {
    localError.value = "验证码加载失败";
  });
}

function closeAuthModal() {
  showAuthModal.value = false;
}

function handleLogout() {
  multiGameStore.disconnect();
  authStore.logout();
}

onMounted(async () => {
  await authStore.hydrate();
  if (authStore.isAuthenticated) {
    await multiGameStore.resumeRoom().catch(() => undefined);
  }
});
</script>

<template>
  <section class="page-shell">
    <div id="start-menu" class="home-stage">
      <div class="home-portrait" :key="frolovaKey" ref="frolovaRef">
        <div class="home-portrait-inner">
          <img src="/media/frolova.png" alt="弗洛洛" />
        </div>
      </div>

      <div class="menu-container">
        <ul ref="menuRef" class="menu-list" aria-label="主菜单">
          <li v-for="(item, index) in menuItems" :key="item.to" class="menu-li">
            <RouterLink class="menu-item" :to="item.to">
              <Icon :icon="item.icon" class="menu-icon" aria-hidden="true" />
              <span class="menu-text">
                <span class="cn">{{ item.cn }}</span>
                <span class="en">{{ item.en }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </div>

      <div class="home-detail">
        <div v-if="!authStore.isAuthenticated" class="home-detail-card home-detail-card--ghost">
          <span class="feature-panel-kicker">SIGN IN</span>
          <strong>登录后保存进度与排行</strong>
          <p>登录后才能解锁多人对战、排行榜和房间续连。</p>
          <button class="home-detail-link" type="button" @click="openAuthModal('login')">
            <Icon icon="ph:sign-in-duotone" class="home-detail-link-icon" aria-hidden="true" />
            ENTER
          </button>
        </div>

        <div v-else class="home-detail-card home-identity-card">
          <span class="feature-panel-kicker">PLAYER</span>
          <div class="home-identity-header">
            <span class="home-identity-avatar">{{ authStore.playerId?.charAt(0)?.toUpperCase() }}</span>
            <strong class="home-identity-name">{{ authStore.playerId }}</strong>
          </div>
          <div class="home-identity-stats">
            <div class="home-identity-stat">
              <span class="home-identity-stat-value">
                <Icon icon="ph:coin-duotone" class="home-stat-icon" aria-hidden="true" />
                {{ authStore.stats.score }}
              </span>
              <span class="home-identity-stat-label">积分</span>
            </div>
            <div class="home-identity-stat">
              <span class="home-identity-stat-value">
                <Icon icon="ph:crown-duotone" class="home-stat-icon" aria-hidden="true" />
                {{ authStore.stats.wins }}
              </span>
              <span class="home-identity-stat-label">胜场</span>
            </div>
            <div class="home-identity-stat">
              <span class="home-identity-stat-value">
                <Icon icon="ph:game-controller-duotone" class="home-stat-icon" aria-hidden="true" />
                {{ authStore.stats.matches }}
              </span>
              <span class="home-identity-stat-label">总场次</span>
            </div>
          </div>
          <button class="home-detail-link" type="button" @click="handleLogout">退出登录</button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showAuthModal" class="auth-modal-overlay" @click.self="closeAuthModal">
        <div class="auth-modal">
          <button class="auth-modal-close" type="button" @click="closeAuthModal" aria-label="关闭">
            <Icon icon="ph:x-bold" aria-hidden="true" />
          </button>

          <header class="auth-modal-header">
            <p class="auth-modal-kicker">Account</p>
            <h2 class="auth-modal-title">{{ authMode === "login" ? "账号登录" : "创建账号" }}</h2>
          </header>

          <div v-if="localError || authStore.error" class="auth-modal-error">
            {{ localError || authStore.error }}
          </div>

          <div class="auth-modal-body">
            <div class="auth-tabs">
              <button
                class="auth-tab"
                :class="{ 'auth-tab--active': authMode === 'login' }"
                type="button"
                @click="authMode = 'login'"
              >
                登录
              </button>
              <button
                class="auth-tab"
                :class="{ 'auth-tab--active': authMode === 'register' }"
                type="button"
                @click="authMode = 'register'"
              >
                注册
              </button>
            </div>

            <label class="auth-field">
              <span class="auth-field-label">账号</span>
              <input v-model="form.username" class="auth-input" type="text" placeholder="输入账号名称" />
            </label>

            <label class="auth-field">
              <span class="auth-field-label">密码</span>
              <input v-model="form.password" class="auth-input" type="password" placeholder="至少 6 位密码" />
            </label>

            <div class="auth-field">
              <span class="auth-field-label">验证码</span>
              <div class="auth-captcha-row">
                <div class="auth-captcha-box" @click="loadCaptcha">
                  <img v-if="captchaImage" class="auth-captcha-img" :src="captchaImage" alt="验证码" />
                  <span v-else class="auth-captcha-placeholder">点击加载</span>
                </div>
                <input v-model="form.captchaText" class="auth-input" type="text" maxlength="5" placeholder="输入验证码" />
              </div>
            </div>

            <button class="auth-btn" type="button" :disabled="authStore.loading" @click="submitAuth">
              {{ authMode === "login" ? "确认登录" : "确认注册" }}
            </button>

            <p class="auth-modal-foot">
              {{ authMode === "login" ? "还没有账号？" : "已有账号？" }}
              <button class="auth-switch-link" type="button" @click="authMode = authMode === 'login' ? 'register' : 'login'">
                {{ authMode === "login" ? "去注册" : "去登录" }}
              </button>
            </p>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
#start-menu {
  position: relative;
  display: flex;
  flex: 1;
  overflow: hidden;
  border: 1px solid var(--line-soft);
  background: radial-gradient(circle at 75% 50%, var(--shell-bg-deep) 0%, var(--shell-bg) 50%);
}

.home-stage {
  position: relative;
  width: 100%;
  height: 100%;
  padding: clamp(1.2rem, 2vw, 1.8rem);
}

.home-portrait {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 1;
  width: min(52%, 680px);
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  pointer-events: none;
}

.home-portrait::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  background: linear-gradient(to left, color-mix(in oklab, var(--shell-bg) 15%, transparent) 0%, transparent 60%),
              linear-gradient(to top, color-mix(in oklab, var(--shell-bg) 40%, transparent) 0%, transparent 35%);
  pointer-events: none;
}

.home-portrait-inner {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 100%;
}

.home-portrait-inner img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
  object-position: bottom right;
  filter: drop-shadow(0 0 60px color-mix(in oklab, var(--gold) 22%, transparent));
}

.menu-container {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 1.45rem;
  width: min(45rem, 46%);
  min-height: 100%;
  padding: clamp(1rem, 1.8vw, 1.5rem);
}

.menu-list {
  display: flex;
  flex-direction: column;
  gap: 1.8rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.menu-item {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 1.15rem;
  width: 100%;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid var(--line-strong);
  text-decoration: none;
  transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), border-color 0.4s ease;
}

.menu-item::before {
  content: "";
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 0;
  height: 1px;
  background-color: var(--gold);
  transition: width 0.4s ease;
}

.menu-item:hover {
  transform: translateX(18px);
  border-bottom-color: transparent;
}

.menu-item:hover::before {
  width: 100%;
}

.menu-icon {
  flex-shrink: 0;
  font-size: 2.4rem;
  color: var(--text-faint);
  transition: color 0.3s ease;
  margin-bottom: -0.2rem;
}

.menu-item:hover .menu-icon {
  color: var(--gold-soft);
}

.menu-text {
  display: flex;
  align-items: flex-end;
  gap: 1.15rem;
}

.menu-item .cn {
  color: var(--text-main);
  font-size: clamp(2rem, 1.5rem + 1.4vw, 3.15rem);
  font-weight: 900;
  letter-spacing: 0.18em;
  transition: color 0.3s ease;
}

.menu-item .en {
  margin-bottom: 0.28rem;
  color: var(--text-sub);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  transition: color 0.3s ease;
}

.menu-item:hover .cn {
  color: var(--gold);
}

.menu-item:hover .en {
  color: var(--gold-soft);
}

.home-detail {
  position: absolute;
  left: clamp(1rem, 2vw, 2rem);
  bottom: clamp(1rem, 2vw, 2rem);
  z-index: 3;
  display: grid;
  gap: 1rem;
  width: min(28rem, 32%);
}

.home-detail-card {
  padding: 1rem 1.05rem;
  border: 1px solid var(--line-soft);
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
}

.home-detail-card--ghost {
  background: transparent;
  border: 1px solid var(--line-strong);
  backdrop-filter: blur(4px);
}

.home-detail-card strong {
  display: block;
  margin-top: 0.45rem;
  font-size: 1.1rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  color: var(--text-main);
}

.home-detail-card p {
  margin: 0.65rem 0 0;
  color: var(--text-sub);
  line-height: 1.78;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.home-detail-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 1rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--gold);
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  cursor: pointer;
  font-size: 0.92rem;
}

.home-detail-link-icon {
  font-size: 1.2rem;
}

.home-detail-link:hover {
  color: var(--text-main);
}

/* ── identity card ── */

.home-identity-card {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.home-identity-header {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.home-identity-avatar {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border: 1px solid var(--gold);
  border-radius: 6px;
  background: color-mix(in oklab, var(--gold) 14%, var(--shell-bg-deep));
  color: var(--gold);
  font-size: 1.1rem;
  font-weight: 900;
}

.home-identity-name {
  font-size: 1.05rem;
  font-weight: 900;
  letter-spacing: 0.16em;
}

.home-identity-stats {
  display: flex;
  gap: 1.2rem;
}

.home-identity-stat {
  display: flex;
  flex-direction: column;
}

.home-identity-stat-value {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 1.15rem;
  font-weight: 900;
  color: var(--gold);
  letter-spacing: 0.08em;
}

.home-stat-icon {
  font-size: 1rem;
  opacity: 0.8;
}

.home-identity-stat-label {
  color: var(--text-faint);
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-weight: 600;
}

/* override global kicker style to match nav font */
.home-detail-card .feature-panel-kicker {
  font-weight: 600;
  letter-spacing: 0.22em;
}

/* ── auth modal ── */

.auth-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

.auth-modal {
  position: relative;
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  overflow-y: auto;
  padding: 2rem 1.8rem;
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  background: var(--shell-bg-deep);
  animation: slideUp 0.25s ease;
}

.auth-modal-close {
  position: absolute;
  top: 0.6rem;
  right: 0.8rem;
  border: none;
  background: none;
  color: var(--text-faint);
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
  display: grid;
  place-items: center;
  transition: color 0.2s ease;
}

.auth-modal-close:hover {
  color: var(--text-main);
}

.auth-modal-header {
  margin-bottom: 1.2rem;
  text-align: center;
}

.auth-modal-kicker {
  margin: 0;
  color: var(--text-faint);
  font-size: 0.7rem;
  letter-spacing: 0.26em;
  text-transform: uppercase;
}

.auth-modal-title {
  margin: 0.35rem 0 0;
  font-size: 1.35rem;
  font-weight: 700;
}

.auth-modal-error {
  margin-bottom: 0.8rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--color-error);
  border-radius: 4px;
  background: color-mix(in oklab, var(--color-error) 12%, transparent);
  color: var(--color-error);
  font-size: 0.82rem;
}

.auth-modal-body {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.auth-tabs {
  display: flex;
  border: 1px solid var(--line-soft);
  border-radius: 6px;
  overflow: hidden;
}

.auth-tab {
  flex: 1;
  padding: 0.55rem 0;
  border: none;
  background: transparent;
  color: var(--text-sub);
  font-size: 0.88rem;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.auth-tab--active {
  background: color-mix(in oklab, var(--gold) 14%, transparent);
  color: var(--gold);
  font-weight: 600;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.auth-field-label {
  color: var(--text-faint);
  font-size: 0.8rem;
}

.auth-input {
  min-height: 42px;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--shell-bg);
  color: var(--text-main);
}

.auth-input::placeholder {
  color: var(--text-faint);
}

.auth-input:focus {
  outline: none;
  border-color: color-mix(in oklab, var(--gold) 50%, transparent);
}

.auth-captcha-row {
  display: flex;
  gap: 0.5rem;
}

.auth-captcha-box {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 100px;
  min-height: 42px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--shell-bg);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.2s ease;
}

.auth-captcha-box:hover {
  border-color: color-mix(in oklab, var(--gold) 40%, transparent);
}

.auth-captcha-img {
  display: block;
  image-rendering: pixelated;
}

.auth-captcha-placeholder {
  color: var(--text-faint);
  font-size: 0.76rem;
}

.auth-btn {
  min-height: 42px;
  border: 1px solid color-mix(in oklab, var(--gold) 40%, transparent);
  border-radius: 6px;
  background: color-mix(in oklab, var(--gold) 16%, var(--surface-panel-strong));
  color: var(--gold);
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.auth-btn:hover {
  background: color-mix(in oklab, var(--gold) 24%, var(--surface-panel-strong));
}

.auth-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auth-modal-foot {
  margin: 0;
  text-align: center;
  color: var(--text-faint);
  font-size: 0.82rem;
}

.auth-switch-link {
  border: none;
  background: none;
  color: var(--gold);
  cursor: pointer;
  font-size: 0.82rem;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 960px) {
  .home-portrait {
    width: 50%;
    opacity: 0.4;
  }

  .menu-container {
    width: 100%;
    padding-inline: 0.2rem;
  }

  .home-detail {
    position: relative;
    inset: auto;
    width: min(100%, 34rem);
    margin: 2rem auto 0;
  }

  .home-detail-card {
    text-align: center;
  }

  .home-identity-stats {
    justify-content: center;
  }

  .home-identity-header {
    justify-content: center;
  }

  .home-detail-link {
    margin-left: auto;
    margin-right: auto;
  }

  .menu-li {
    opacity: 1;
    transform: none;
  }

  .menu-item:hover {
    transform: none;
  }

  .menu-item:hover::before {
    width: 0;
  }

  .menu-item:active {
    transform: translateX(8px);
  }

  .menu-item:active::before {
    width: 100%;
  }

  .menu-item:active .cn {
    color: var(--gold);
  }

  .menu-item:active .en {
    color: var(--gold-soft);
  }
}

@media (max-width: 720px) {
  .home-stage {
    padding: 0.9rem;
  }

  .menu-container {
    padding: 0.7rem;
  }

  .menu-icon {
    font-size: 1.8rem;
  }

  .auth-modal {
    max-width: 92vw;
    padding: 1.4rem 1.1rem;
  }
}
</style>
