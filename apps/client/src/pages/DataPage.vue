<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";

import type { QuizType, ResonatorNameEntry, SkeletonNameEntry } from "@/types/game";
import { useDictionaryStore } from "@/stores/dictionary";
import { getCharacterAvatar, getSkeletonAvatar } from "@/utils/game";

const router = useRouter();
const dictionaryStore = useDictionaryStore();
const tab = ref<QuizType>("resonator");
const search = ref("");
const loading = shallowRef(false);

const characters = computed(() => dictionaryStore.resonatorNames);
const skeletons = computed(() => dictionaryStore.skeletonNames);

const filteredCharacters = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return characters.value;
  return characters.value.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.attribute.toLowerCase().includes(q) ||
    c.weapon.toLowerCase().includes(q) ||
    c.birthplace.toLowerCase().includes(q) ||
    String(c.version).includes(q)
  );
});

const filteredSkeletons = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return skeletons.value;
  return skeletons.value.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.skill_attribute.toLowerCase().includes(q) ||
    s.set_name.toLowerCase().includes(q) ||
    s.drop_location.toLowerCase().includes(q) ||
    s.is_aberration.toLowerCase().includes(q) ||
    String(s.cost).includes(q)
  );
});

onMounted(async () => {
  loading.value = true;
  await Promise.all([
    dictionaryStore.loadResonatorNames(),
    dictionaryStore.loadSkeletonNames(),
  ]);
  loading.value = false;
});
</script>

<template>
  <div class="dp-page">
    <header class="dp-top">
      <button class="dp-back" @click="router.push('/')">
        <Icon icon="ph:arrow-left-duotone" /> BACK
      </button>
      <h1 class="dp-title">数据图鉴</h1>
      <div class="dp-top-right" />
    </header>

    <nav class="dp-tabs">
      <button class="dp-tab" :class="{ 'dp-tab--active': tab === 'resonator' }" @click="tab = 'resonator'">
        共鸣者 · {{ characters.length }}
      </button>
      <button class="dp-tab" :class="{ 'dp-tab--active': tab === 'skeleton' }" @click="tab = 'skeleton'">
        声骸 · {{ skeletons.length }}
      </button>
    </nav>

    <div class="dp-search">
      <Icon icon="ph:magnifying-glass-duotone" class="dp-search-icon" />
      <input v-model="search" class="dp-search-input" :placeholder="tab === 'resonator' ? '搜索角色名称或属性...' : '搜索声骸名称、属性或套装...'" />
    </div>

    <div v-if="loading" class="dp-loading">加载中...</div>

    <div v-else-if="tab === 'resonator'" class="dp-grid">
      <div v-for="char in filteredCharacters" :key="char.name" class="dp-card">
        <div class="dp-card-head">
          <img :src="getCharacterAvatar(char.name)" class="dp-card-avatar" alt="" loading="lazy" />
          <div class="dp-card-title">
            <strong class="dp-card-name">{{ char.name }}</strong>
            <span class="dp-card-stars">{{ '★'.repeat(char.star_rating) }}</span>
          </div>
        </div>
        <dl class="dp-card-detail">
          <div class="dp-row"><dt>属性</dt><dd>{{ char.attribute }}</dd></div>
          <div class="dp-row"><dt>武器</dt><dd>{{ char.weapon }}</dd></div>
          <div class="dp-row"><dt>出生地</dt><dd>{{ char.birthplace }}</dd></div>
          <div class="dp-row"><dt>版本</dt><dd>{{ char.version }}</dd></div>
        </dl>
      </div>
      <p v-if="!filteredCharacters.length" class="dp-empty">未找到匹配角色</p>
    </div>

    <div v-else class="dp-grid">
      <div v-for="sk in filteredSkeletons" :key="sk.name" class="dp-card">
        <div class="dp-card-head">
          <img :src="getSkeletonAvatar(sk.name)" class="dp-card-avatar" alt="" loading="lazy" />
          <div class="dp-card-title">
            <strong class="dp-card-name">{{ sk.name }}</strong>
            <span class="dp-card-stars">COST {{ sk.cost }} · {{ sk.is_aberration === '有' ? '异相' : '常规' }}</span>
          </div>
        </div>
        <dl class="dp-card-detail">
          <div class="dp-row"><dt>技能属性</dt><dd>{{ sk.skill_attribute }}</dd></div>
          <div class="dp-row"><dt>套装</dt><dd>{{ sk.set_name }}</dd></div>
          <div class="dp-row"><dt>掉落位置</dt><dd>{{ sk.drop_location }}</dd></div>
        </dl>
      </div>
      <p v-if="!filteredSkeletons.length" class="dp-empty">未找到匹配声骸</p>
    </div>
  </div>
</template>

<style scoped>
.dp-page {
  display: flex; flex-direction: column; align-items: center;
  min-height: 100vh; width: 100%;
  padding: 1.5rem 1.5rem 3rem;
}

.dp-top {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; max-width: 1100px; margin-bottom: 0.8rem;
}
.dp-back {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--line-strong); border-radius: 6px;
  background: var(--shell-bg-deep); color: var(--text-sub);
  font-size: 0.85rem; font-weight: 600; cursor: pointer;
}
.dp-back:hover { color: var(--gold); border-color: var(--gold); }
.dp-title { margin: 0; font-size: 1.4rem; font-weight: 900; letter-spacing: 0.06em; }
.dp-top-right { width: 80px; }

.dp-tabs {
  display: flex; justify-content: center; gap: 0;
  margin-bottom: 1rem;
  border: 1px solid var(--line-soft); border-radius: 8px;
  overflow: hidden;
}
.dp-tab {
  padding: 0.5rem 1.5rem; border: none; background: transparent;
  color: var(--text-faint); font-size: 0.85rem; font-weight: 600; cursor: pointer;
}
.dp-tab:hover { color: var(--text-sub); }
.dp-tab--active { background: color-mix(in oklab, var(--gold) 14%, transparent); color: var(--gold); }

.dp-search {
  display: flex; align-items: center; gap: 0.5rem;
  width: 100%; max-width: 500px; margin-bottom: 1.2rem;
  padding: 0.5rem 0.8rem;
  border: 1px solid var(--line-soft); border-radius: 8px;
  background: var(--surface-panel);
}
.dp-search-icon { color: var(--text-faint); font-size: 1rem; flex-shrink: 0; }
.dp-search-input {
  flex: 1; border: none; background: transparent;
  color: var(--text-main); font-size: 0.88rem; outline: none;
}

.dp-loading, .dp-empty {
  margin: 3rem 0; color: var(--text-faint); font-size: 0.9rem;
}

.dp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.9rem;
  width: 100%; max-width: 1100px;
}

.dp-card {
  display: flex; flex-direction: column; gap: 0.6rem;
  padding: 0.85rem;
  border: 1px solid var(--line-soft); border-radius: 12px;
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  transition: border-color 0.2s, transform 0.2s;
}
.dp-card:hover {
  border-color: color-mix(in oklab, var(--gold) 35%, transparent);
  transform: translateY(-2px);
}

.dp-card-head {
  display: flex; align-items: center; gap: 0.7rem;
}
.dp-card-avatar {
  width: 60px; height: 60px; border-radius: 10px; object-fit: cover;
  border: 1px solid var(--line-soft); flex-shrink: 0;
}
.dp-card-title {
  display: flex; flex-direction: column; gap: 0.2rem; min-width: 0;
}
.dp-card-name {
  font-size: 0.95rem; font-weight: 700; letter-spacing: 0.04em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dp-card-stars {
  font-size: 0.75rem; color: var(--gold); font-weight: 600;
  letter-spacing: 0.03em;
}

.dp-card-detail {
  margin: 0; display: flex; flex-direction: column; gap: 0.3rem;
  padding-top: 0.5rem; border-top: 1px solid var(--line-soft);
}
.dp-row {
  display: flex; align-items: baseline; gap: 0.5rem;
  font-size: 0.8rem; line-height: 1.4;
}
.dp-row dt {
  flex-shrink: 0; min-width: 3.5rem;
  color: var(--text-faint); font-weight: 500;
}
.dp-row dd {
  margin: 0; color: var(--text-sub); flex: 1;
  word-break: break-all;
}

@media (max-width: 540px) {
  .dp-page { padding: 0.8rem 0.6rem 2rem; }
  .dp-grid { grid-template-columns: 1fr; gap: 0.6rem; }
  .dp-card { padding: 0.6rem; gap: 0.5rem; }
  .dp-card-avatar { width: 48px; height: 48px; }
  .dp-card-name { font-size: 0.85rem; }
  .dp-row { font-size: 0.75rem; }
  .dp-row dt { min-width: 3rem; }
}
</style>
