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
    c.name.toLowerCase().includes(q) || c.attribute.includes(q)
  );
});

const filteredSkeletons = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return skeletons.value;
  return skeletons.value.filter(s =>
    s.name.toLowerCase().includes(q) || s.skill_attribute.includes(q) || s.set_name.includes(q)
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
        <img :src="getCharacterAvatar(char.name)" class="dp-card-avatar" alt="" loading="lazy" />
        <div class="dp-card-info">
          <strong class="dp-card-name">{{ char.name }}</strong>
          <span class="dp-card-meta">{{ char.attribute }} · {{ '★'.repeat(char.star_rating) }}</span>
        </div>
      </div>
      <p v-if="!filteredCharacters.length" class="dp-empty">未找到匹配角色</p>
    </div>

    <div v-else class="dp-grid">
      <div v-for="sk in filteredSkeletons" :key="sk.name" class="dp-card">
        <img :src="getSkeletonAvatar(sk.name)" class="dp-card-avatar" alt="" loading="lazy" />
        <div class="dp-card-info">
          <strong class="dp-card-name">{{ sk.name }}</strong>
          <span class="dp-card-meta">{{ sk.skill_attribute }} · COST {{ sk.cost }} · {{ sk.set_name }}</span>
        </div>
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
  width: 100%; max-width: 900px; margin-bottom: 0.8rem;
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
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.8rem;
  width: 100%; max-width: 900px;
}

.dp-card {
  display: flex; align-items: center; gap: 0.7rem;
  padding: 0.7rem;
  border: 1px solid var(--line-soft); border-radius: 10px;
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  transition: border-color 0.2s;
}
.dp-card:hover { border-color: color-mix(in oklab, var(--gold) 30%, transparent); }

.dp-card-avatar {
  width: 52px; height: 52px; border-radius: 8px; object-fit: cover;
  border: 1px solid var(--line-soft); flex-shrink: 0;
}
.dp-card-info { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
.dp-card-name {
  font-size: 0.9rem; font-weight: 700; letter-spacing: 0.04em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dp-card-meta {
  font-size: 0.7rem; color: var(--text-sub);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

@media (max-width: 540px) {
  .dp-page { padding: 0.8rem 0.6rem 2rem; }
  .dp-grid { grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
  .dp-card { padding: 0.5rem; gap: 0.4rem; }
  .dp-card-avatar { width: 40px; height: 40px; }
  .dp-card-name { font-size: 0.78rem; }
  .dp-card-meta { font-size: 0.64rem; }
}
</style>
