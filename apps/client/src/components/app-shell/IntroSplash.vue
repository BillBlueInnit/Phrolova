<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from "vue";
import gsap from "gsap";
import { FLOROVA_ART } from "@/utils/presentation";

const emit = defineEmits<{
  enter: [muted: boolean];
}>();

const isLoading = ref(true);
const introRef = ref<HTMLElement | null>(null);
let ctx: gsap.Context | null = null;

watch(() => isLoading.value, async (loading) => {
  if (!loading) {
    await nextTick();
    ctx = gsap.context(() => {
      const portrait = introRef.value?.querySelector(".intro-portrait") as HTMLElement | null;
      if (portrait) {
        gsap.set(portrait, { y: 0 });
        gsap.to(portrait, {
          y: -12,
          scale: 1.015,
          duration: 5.8,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
      }

      const cards = introRef.value?.querySelectorAll(
        ".intro-timeline-card, .intro-side-card, .intro-action-row, .intro-kicker, .intro-title, .intro-desc",
      );
      if (cards && cards.length > 0) {
        gsap.from(cards, {
          opacity: 0,
          y: 24,
          duration: 0.6,
          ease: "power2.out",
          stagger: 0.1,
        });
      }
    });
  }
});

onBeforeUnmount(() => {
  ctx?.revert();
});

const stageLabels = [
  {
    title: "弗洛洛开屏",
    desc: "进入应用前先以角色立绘建立视觉记忆，避免主页直接掉进工具页语境。",
  },
  {
    title: "云游戏式入口",
    desc: "按钮与信息卡都维持扁平切角，不用荧光和发光描边抢戏。",
  },
  {
    title: "实时对战保留",
    desc: "规则、BO 制与实时通信逻辑继续沿用当前后端实现，不牺牲可玩性。",
  },
];
</script>

<template>
  <Transition name="intro-fade">
    <section v-if="isLoading" id="loading-screen" class="screen active">
        <div class="loader-ring"></div>
        <div class="loading-text">LOADING...</div>
    </section>
    <section v-else ref="introRef" class="intro-shell" :style="{ '--intro-cover': `url(${FLOROVA_ART.cover})` }">
      <div class="intro-backdrop"></div>

      <div class="intro-panel">
        <div class="intro-copy">
          <p class="intro-kicker">PHROLOVA MEMORY TRACE</p>
          <h1 class="intro-title">
            鸣潮猜角色
            <span>以官网活动页的气质进入游戏，而不是直接落到后台面板。</span>
          </h1>
          <p class="intro-desc">
            这版开屏先把风格、节奏与进入路径建立起来。点击进入后会启动一段轻量环境音，你也可以静音进入。
          </p>

          <div class="intro-action-row">
            <button class="primary-action-button intro-enter-button" type="button" @click="$emit('enter', false)">
              进入游戏
            </button>
            <button class="ghost-action-button" type="button" @click="$emit('enter', true)">静音进入</button>
          </div>

          <div class="intro-timeline">
            <article v-for="item in stageLabels" :key="item.title" class="intro-timeline-card">
              <strong>{{ item.title }}</strong>
              <p>{{ item.desc }}</p>
            </article>
          </div>
        </div>

        <div class="intro-visual">
          <div class="intro-portrait-shell">
            <span class="intro-portrait-tag">FLOROVA / 2.5</span>
            <img class="intro-portrait" :src="FLOROVA_ART.portrait" alt="鸣潮角色弗洛洛立绘" />
          </div>

          <div class="intro-side-card">
            <span>当前版本</span>
            <strong>扁平黑金 / 双主题 / 实时房间</strong>
            <p>角色字段、对局规则、排行榜和 Socket.IO 对战都继续保留，只重塑前端呈现方式。</p>
          </div>
        </div>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
/* ================= 1. 开屏加载动画 (Loading) ================= */
#loading-screen {
    background-color: var(--shell-bg-deep);
    z-index: 1000;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    position: fixed; inset: 0;
}
.loader-ring {
    width: 50px; height: 50px;
    border: 2px solid rgba(255,255,255,0.05);
    border-top: 2px solid var(--gold);
    border-right: 2px solid var(--gold);
    border-radius: 50%;
    animation: spin 1s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
    margin-bottom: 20px;
}
.loading-text {
    font-family: 'Rajdhani', sans-serif;
    font-size: 14px; letter-spacing: 0.5em;
    color: var(--gold);
    animation: pulse 2s ease-in-out infinite;
    margin-left: 0.5em;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }

.intro-shell {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  align-items: stretch;
  min-height: 100dvh;
  padding: clamp(1rem, 2vw, 1.8rem);
  background:
    linear-gradient(110deg, color-mix(in oklab, var(--shell-bg-deep) 92%, transparent) 18%, color-mix(in oklab, var(--shell-bg-deep) 66%, transparent) 44%, color-mix(in oklab, var(--shell-bg-deep) 90%, transparent) 100%),
    var(--intro-cover) center top / cover no-repeat;
}

.intro-backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 68% 32%, color-mix(in oklab, var(--gold) 20%, transparent), transparent 28%),
    linear-gradient(180deg, color-mix(in oklab, var(--shell-bg-deep) 20%, transparent), color-mix(in oklab, var(--shell-bg-deep) 72%, transparent));
}

.intro-panel {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 1.2rem;
  align-items: end;
  max-width: 1480px;
  width: 100%;
  margin: auto;
  padding: clamp(1.2rem, 2vw, 2rem);
  border: 1px solid color-mix(in oklab, var(--gold-soft) 50%, transparent);
  background: linear-gradient(180deg, color-mix(in oklab, var(--shell-bg-deep) 52%, transparent), color-mix(in oklab, var(--shell-bg-deep) 34%, transparent));
  backdrop-filter: blur(8px);
}

.intro-copy {
  display: grid;
  gap: 1rem;
}

.intro-kicker {
  margin: 0;
  color: color-mix(in oklab, var(--text-sub) 85%, var(--text-main));
  font-size: 0.78rem;
  letter-spacing: 0.34em;
  text-transform: uppercase;
}

.intro-title {
  max-width: 10ch;
  margin: 0;
  font-size: clamp(2.8rem, 2.1rem + 3.4vw, 5.8rem);
  line-height: 0.95;
  font-weight: 700;
}

.intro-title span {
  display: block;
  margin-top: 0.9rem;
  max-width: 11ch;
  color: color-mix(in oklab, var(--text-main) 78%, transparent);
  font-size: clamp(1rem, 0.82rem + 0.7vw, 1.38rem);
  line-height: 1.35;
  font-weight: 500;
}

.intro-desc {
  max-width: 56ch;
  margin: 0;
  color: color-mix(in oklab, var(--text-main) 78%, transparent);
  line-height: 1.9;
}

.intro-action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
}

.intro-enter-button {
  min-width: min(360px, 100%);
}

.intro-timeline {
  display: grid;
  gap: 0.8rem;
}

.intro-timeline-card,
.intro-side-card {
  padding: 0.95rem 1rem;
  border: 1px solid color-mix(in oklab, var(--gold-soft) 55%, transparent);
  background: color-mix(in oklab, var(--shell-bg-deep) 56%, transparent);
}

.intro-timeline-card strong,
.intro-side-card strong {
  display: block;
  font-size: 1rem;
}

.intro-timeline-card p,
.intro-side-card p {
  margin: 0.55rem 0 0;
  color: rgba(224, 218, 205, 0.72);
  line-height: 1.8;
}

.intro-visual {
  display: grid;
  gap: 0.95rem;
}

.intro-portrait-shell {
  position: relative;
  min-height: 420px;
  overflow: hidden;
  border: 1px solid rgba(220, 204, 168, 0.24);
  background:
    radial-gradient(circle at 50% 20%, rgba(236, 214, 140, 0.18), transparent 32%),
    linear-gradient(180deg, rgba(18, 20, 24, 0.28), rgba(18, 20, 24, 0.84));
}

.intro-portrait-tag {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 1;
  padding: 0.36rem 0.72rem;
  border: 1px solid rgba(220, 204, 168, 0.26);
  background: rgba(14, 16, 18, 0.74);
  color: rgba(237, 226, 198, 0.78);
  font-size: 0.75rem;
  letter-spacing: 0.18em;
}

.intro-portrait {
  position: absolute;
  right: -4%;
  bottom: -2%;
  max-width: min(560px, 100%);
  width: 100%;
  object-fit: contain;
  filter: drop-shadow(0 24px 40px rgba(0, 0, 0, 0.35));
}

.intro-fade-enter-active,
.intro-fade-leave-active {
  transition: opacity 420ms ease;
}

.intro-fade-enter-from,
.intro-fade-leave-to {
  opacity: 0;
}

@media (min-width: 1080px) {
  .intro-panel {
    grid-template-columns: minmax(0, 1.08fr) minmax(440px, 0.92fr);
  }

  .intro-timeline {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
