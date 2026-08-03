<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from "vue";

const props = defineProps<{
  names: Array<{ name: string }>;
  placeholder?: string;
  disabled?: boolean;
}>();

const model = defineModel<string>({ default: "" });
const emit = defineEmits<{
  submit: [];
}>();

const inputRef = useTemplateRef<HTMLInputElement>("inputRef");
const activeIndex = shallowRef(-1);

const suggestions = computed(() => {
  const keyword = model.value.trim().toLowerCase();
  if (!keyword) return [];
  return props.names
    .filter((item) => item.name.toLowerCase().includes(keyword))
    .slice(0, 8);
});

function selectSuggestion(name: string) {
  model.value = name;
  activeIndex.value = -1;
  inputRef.value?.focus();
}

function handleKeydown(event: KeyboardEvent) {
  if (!suggestions.value.length) {
    if (event.key === "Enter") {
      event.preventDefault();
      emit("submit");
    }
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % suggestions.value.length;
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    activeIndex.value = activeIndex.value <= 0 ? suggestions.value.length - 1 : activeIndex.value - 1;
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (activeIndex.value >= 0 && suggestions.value[activeIndex.value]) {
      selectSuggestion(suggestions.value[activeIndex.value].name);
    }
    emit("submit");
  }
}
</script>

<template>
  <div class="autocomplete-shell">
    <input
      ref="inputRef"
      v-model="model"
      :disabled="disabled"
      :placeholder="placeholder || '输入名称开始猜测'"
      aria-label="输入猜测名称"
      class="guess-input"
      type="text"
      autocomplete="off"
      @keydown="handleKeydown"
    />

    <div v-if="suggestions.length && !disabled" class="autocomplete-panel">
      <button
        v-for="(item, index) in suggestions"
        :key="item.name"
        class="autocomplete-option"
        :class="{ 'autocomplete-option-active': activeIndex === index }"
        type="button"
        @click="selectSuggestion(item.name)"
      >
        {{ item.name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.autocomplete-shell {
  position: relative;
}

.guess-input {
  width: 100%;
  min-height: 52px;
  padding: 0.95rem 1rem;
  border: 1px solid var(--line-strong);
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  color: var(--text-main);
  clip-path: polygon(0 12px, 14px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%);
}

.autocomplete-panel {
  position: absolute;
  inset: auto 0 calc(100% + 0.45rem);
  z-index: 20;
  display: grid;
  gap: 0.35rem;
  padding: 0.45rem;
  border: 1px solid var(--line-soft);
  background: linear-gradient(180deg, var(--surface-panel-strong), var(--surface-panel));
  box-shadow: 10px 10px 0 var(--shadow-plate);
}

.autocomplete-option {
  width: 100%;
  padding: 0.78rem 0.9rem;
  border: 1px solid transparent;
  text-align: left;
  background: color-mix(in oklab, var(--gold) 4%, var(--surface-card));
  transition: background 180ms ease, transform 180ms ease, border-color 180ms ease;
}

.autocomplete-option:hover,
.autocomplete-option-active {
  border-color: color-mix(in oklab, var(--gold) 30%, transparent);
  background: color-mix(in oklab, var(--gold) 12%, var(--surface-card));
  transform: translateX(2px);
}
</style>
