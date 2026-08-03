<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  message: string;
  tone?: "info" | "error" | "success";
}>();

const toneClass = computed(() => {
  if (props.tone === "error") return "status-banner-error";
  if (props.tone === "success") return "status-banner-success";
  return "status-banner-info";
});

const toneLabel = computed(() => {
  if (props.tone === "error") return "异常";
  if (props.tone === "success") return "状态";
  return "提示";
});
</script>

<template>
  <p v-if="message" class="status-banner" :class="toneClass">
    <span class="status-banner-mark">{{ toneLabel }}</span>
    <span>{{ message }}</span>
  </p>
</template>

<style scoped>
.status-banner {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.8rem;
  align-items: start;
  margin: 0;
  padding: 0.9rem 1rem;
  border: 1px solid var(--line-soft);
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  border-radius: 8px;
}

.status-banner-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 54px;
  min-height: 28px;
  padding: 0.12rem 0.5rem;
  border: 1px solid currentColor;
  border-radius: 6px;
  font-size: 0.74rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.status-banner-info {
  color: color-mix(in oklab, var(--color-info) 64%, var(--text-main));
}

.status-banner-error {
  color: color-mix(in oklab, var(--color-error) 72%, var(--text-main));
}

.status-banner-success {
  color: color-mix(in oklab, var(--color-success) 66%, var(--text-main));
}
</style>
