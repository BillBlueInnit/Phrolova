<script setup lang="ts">
import { computed, shallowRef, useTemplateRef } from "vue";
import { getCharacterAvatar, getSkeletonAvatar } from "@/utils/game";
import type { QuizType } from "@/types/game";

const props = defineProps<{
  names: Array<{ name: string }>;
  placeholder?: string;
  disabled?: boolean;
  quizType?: QuizType;
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
    const idx = activeIndex.value >= 0 ? activeIndex.value : 0;
    if (suggestions.value[idx]) {
      selectSuggestion(suggestions.value[idx].name);
    }
    emit("submit");
  }
}

/** 提交猜测之后focus输入框. */
function focus() {
  inputRef.value?.focus();
}

defineExpose({ focus });

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
        <img
          v-if="quizType"
          :src="quizType === 'resonator' ? getCharacterAvatar(item.name) : getSkeletonAvatar(item.name)"
          class="ac-avatar"
          alt=""
        />
        {{ item.name }}
      </button>
    </div>
  </div>
</template>

