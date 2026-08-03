<script setup lang="ts">
import { computed } from "vue";

import { getBadgeMeta, type BadgeCategory } from "@/utils/presentation";

const props = withDefaults(
  defineProps<{
    label: string;
    category?: BadgeCategory;
    compact?: boolean;
  }>(),
  {
    category: "plain",
    compact: false,
  },
);

const meta = computed(() => getBadgeMeta(props.label, props.category));

const badgeStyle = computed(() => ({
  "--badge-accent": meta.value.accent,
}));
</script>

<template>
  <span class="lore-badge" :class="{ 'lore-badge-compact': compact }" :style="badgeStyle">
    <span class="lore-badge-mark">
      <img v-if="meta.iconUrl" :src="meta.iconUrl" :alt="`${label}图标`" loading="lazy" />
      <span v-else>{{ meta.mark }}</span>
    </span>
    <span class="lore-badge-text">{{ label }}</span>
  </span>
</template>

<style scoped>
.lore-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  min-height: 32px;
  padding: 0.28rem 0.7rem 0.28rem 0.34rem;
  border: 1px solid color-mix(in oklab, var(--badge-accent) 44%, var(--line-soft));
  background:
    linear-gradient(180deg, color-mix(in oklab, var(--badge-accent) 8%, var(--surface-panel)), color-mix(in oklab, var(--badge-accent) 3%, var(--surface-panel)));
  color: var(--text-main);
  clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 10px) 100%, 0 100%);
}

.lore-badge-compact {
  min-height: 29px;
  padding-right: 0.58rem;
}

.lore-badge-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  border: 1px solid color-mix(in oklab, var(--badge-accent) 60%, transparent);
  background: color-mix(in oklab, var(--badge-accent) 22%, var(--surface-card));
  color: color-mix(in oklab, var(--badge-accent) 70%, white);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
}

.lore-badge-mark img {
  width: 0.95rem;
  height: 0.95rem;
  object-fit: contain;
}

.lore-badge-text {
  white-space: nowrap;
}
</style>
