<script setup lang="ts">
import { computed } from "vue";

import LoreBadge from "@/components/shared/LoreBadge.vue";
import type { CellStatus, CompareStatus, GuessHistoryRow, QuizType, ResonatorCompare, SkeletonCompare } from "@/types/game";
import { formatGuessValue, getCharacterAvatar, getColumns, getStatusClass, getWeaponIcon, renderGroupItem } from "@/utils/game";
import { resolveBadgeCategory } from "@/utils/presentation";

const props = defineProps<{
  quizType: QuizType;
  rows: GuessHistoryRow[];
  emptyLabel: string;
  targetVersion?: number | null;
  targetCost?: number | null;
}>();

const columns = computed(() => getColumns(props.quizType));

function getCompareCell(compare: ResonatorCompare | SkeletonCompare, key: string) {
  return (compare as Record<string, unknown>)[key];
}

function isGroupedCompare(value: unknown): value is { cell: CellStatus; items: Array<Record<string, unknown>> } {
  return typeof value === "object" && value !== null && "items" in value && "cell" in value;
}

function getCellClass(row: GuessHistoryRow, key: string) {
  if (key === "name") {
    return "";
  }
  const value = getCompareCell(row.compare, key);
  if (isGroupedCompare(value)) {
    return getStatusClass(value.cell);
  }
  return getStatusClass(value as CompareStatus);
}

function getGroupItems(row: GuessHistoryRow, key: string) {
  const value = getCompareCell(row.compare, key);
  return isGroupedCompare(value) ? value.items : [];
}

function isGroupField(row: GuessHistoryRow, key: string) {
  return isGroupedCompare(getCompareCell(row.compare, key));
}

function getItemStatus(item: Record<string, unknown>) {
  return (item.status as CompareStatus) || "different";
}

function shouldRenderBadge(key: string) {
  return ["attribute", "birthplace", "weapon", "set_name"].includes(key);
}

function formatCellValue(row: GuessHistoryRow, key: string) {
  return formatGuessValue(row.guess, key, {
    targetVersion: props.targetVersion ?? null,
    targetCost: props.targetCost ?? null,
  });
}
</script>

<template>
  <div class="guess-table-shell">
    <table class="guess-table">
      <thead>
        <tr>
          <th class="guess-table-head">序号</th>
          <th v-for="column in columns" :key="column.key" class="guess-table-head">
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody v-if="rows.length">
        <tr v-for="(row, index) in rows" :key="`${index}-${row.guess.name}`">
          <td class="guess-table-index">{{ index + 1 }}</td>
          <td
            v-for="column in columns"
            :key="column.key"
            class="guess-table-cell"
            :class="getCellClass(row, column.key)"
          >
            <template v-if="column.key === 'name'">
              <div class="gt-name-cell">
                <img
                  v-if="row.revealed"
                  :src="getCharacterAvatar(String(row.guess.name))"
                  class="gt-avatar"
                  alt=""
                />
                <span class="guess-table-name">{{ row.revealed ? row.guess.name : "***" }}</span>
              </div>
            </template>

            <template v-else-if="isGroupField(row, column.key)">
              <span v-if="!row.revealed" class="guess-table-masked">***</span>
              <div v-else class="compare-token-list">
                <LoreBadge
                  v-for="item in getGroupItems(row, column.key)"
                  :key="renderGroupItem(item)"
                  :category="resolveBadgeCategory(column.key, renderGroupItem(item))"
                  :class="getStatusClass(getItemStatus(item))"
                  :label="renderGroupItem(item)"
                  compact
                />
              </div>
            </template>

            <template v-else-if="shouldRenderBadge(column.key)">
              <div class="gt-badge-row">
                <img
                  v-if="column.key === 'weapon' && row.revealed"
                  :src="getWeaponIcon(String(row.guess.weapon))"
                  class="gt-weapon-icon"
                  alt=""
                />
                <LoreBadge :label="String(formatCellValue(row, column.key))" :category="resolveBadgeCategory(column.key, String(row.guess[column.key as keyof typeof row.guess]))" compact />
              </div>
            </template>

            <template v-else>
              <span
                class="guess-table-value"
                :class="{ 'guess-table-stars': column.key === 'star_rating' }"
              >
                {{ formatCellValue(row, column.key) }}
              </span>
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="!rows.length" class="guess-table-empty">{{ emptyLabel }}</p>
  </div>
</template>

<style scoped>
.gt-name-cell {
  display: flex; align-items: center; gap: 0.45rem;
}
.gt-avatar {
  width: 28px; height: 28px; border-radius: 4px; object-fit: cover;
  border: 1px solid var(--line-soft); flex-shrink: 0;
}
.gt-badge-row {
  display: flex; align-items: center; gap: 0.35rem;
}
.gt-weapon-icon {
  width: 24px; height: 24px; object-fit: contain; flex-shrink: 0;
  filter: drop-shadow(0 0 2px rgba(0,0,0,0.4));
}
.guess-table-name {
  font-weight: 600;
}

.guess-table-masked {
  color: var(--text-faint);
  letter-spacing: 0.16em;
}

.guess-table-value {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
}

.guess-table-stars {
  color: color-mix(in oklab, var(--gold) 70%, var(--text-main));
  letter-spacing: 0.12em;
}

.compare-token-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
</style>
