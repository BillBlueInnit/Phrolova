<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { useRouter } from "vue-router";

import TabGroup from "@/components/shared/TabGroup.vue";
import type { QuizType, ResonatorNameEntry, SkeletonNameEntry, TabOption } from "@/types";
import { useDictionaryStore } from "@/stores/dictionary";
import { getCharacterAvatar, getSkeletonAvatar } from "@/utils/game";

const router = useRouter();
const dictionaryStore = useDictionaryStore();
const tab = ref<QuizType>("resonator");
const search = ref("");
const loading = shallowRef(false);

const tabOptions: TabOption[] = [
  { key: "resonator", label: "共鸣者" },
  { key: "skeleton", label: "声骸" },
];

const characters = computed(() => dictionaryStore.resonatorNames);
const skeletons = computed(() => dictionaryStore.skeletonNames);

const filteredCharacters = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return characters.value;
  return characters.value.filter(c =>
    c.name.toLowerCase().includes(q) || c.attribute.toLowerCase().includes(q) ||
    c.weapon.toLowerCase().includes(q) || c.birthplace.toLowerCase().includes(q) ||
    String(c.version).includes(q)
  );
});

const filteredSkeletons = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return skeletons.value;
  return skeletons.value.filter(s =>
    s.name.toLowerCase().includes(q) || s.skill_attribute.toLowerCase().includes(q) ||
    s.set_name.toLowerCase().includes(q) || s.drop_location.toLowerCase().includes(q) ||
    s.is_aberration.toLowerCase().includes(q) || String(s.cost).includes(q)
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
      <button class="back-btn" @click="router.push('/')">
        <Icon icon="ph:arrow-left-duotone" /> BACK
      </button>
      <h1 class="dp-title">数据图鉴</h1>
      <div class="dp-top-right" />
    </header>

    <TabGroup :tabs="tabOptions" :active-key="tab" @select="tab = $event as QuizType" />

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

