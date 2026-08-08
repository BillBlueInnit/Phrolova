<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from "vue";
import { Icon } from "@iconify/vue";
import AdminShell from "@/components/admin/AdminShell.vue";
import { useAdmin, handleAdminApiError } from "@/composables/useAdmin";
import {
  adminFetchAcknowledgements,
  adminAddAcknowledgement,
  adminUpdateAcknowledgement,
  adminDeleteAcknowledgement,
  type AcknowledgementItem,
} from "@/api";

const { adminHeaders } = useAdmin();

const loading = ref(false);
const saving = ref(false);
const list = ref<AcknowledgementItem[]>([]);
const errorMsg = ref("");

const CATEGORY_OPTIONS = [
  { value: "bug", label: "Bug 反馈" },
  { value: "feature", label: "功能建议" },
  { value: "support", label: "技术支持" },
  { value: "other", label: "其他贡献" },
] as const;

function categoryLabel(v: string) {
  return CATEGORY_OPTIONS.find(c => c.value === v)?.label ?? v;
}

// ── Add form ──
const showAddForm = ref(false);
const addForm = reactive({
  player_id: "",
  category: "bug",
  description: "",
  sort_order: 0,
});

function resetAddForm() {
  addForm.player_id = "";
  addForm.category = "bug";
  addForm.description = "";
  addForm.sort_order = 0;
}

// ── Editing ──
interface EditingState {
  id: number;
  field: "player_id" | "category" | "description" | "sort_order";
  value: string;
}
const editing = ref<EditingState | null>(null);
let editInputEl: HTMLInputElement | HTMLSelectElement | null = null;

function startEdit(row: AcknowledgementItem, field: EditingState["field"]) {
  if (editing.value) cancelEdit();
  const curValue = field === "sort_order" ? String(row.sort_order ?? 0) : String(row[field] ?? "");
  editing.value = { id: row.id, field, value: curValue };
  setTimeout(() => editInputEl?.focus(), 0);
}

function cancelEdit() {
  editing.value = null;
}

async function commitEdit() {
  const e = editing.value;
  if (!e) return;
  saving.value = true;
  errorMsg.value = "";
  try {
    const payload: Record<string, unknown> = {};
    if (e.field === "sort_order") {
      payload.sort_order = Number(e.value) || 0;
    } else {
      payload[e.field] = e.value.trim();
    }
    await adminUpdateAcknowledgement(adminHeaders(), e.id, payload);
    await loadList();
    editing.value = null;
  } catch (err) {
    if (!handleAdminApiError(err)) {
      errorMsg.value = err instanceof Error ? err.message : "更新失败";
    }
  } finally {
    saving.value = false;
  }
}

function onEditKey(ev: KeyboardEvent) {
  if (ev.key === "Escape") cancelEdit();
  else if (ev.key === "Enter" && editing.value?.field !== "description") commitEdit();
}

// ── Actions ──
async function loadList() {
  loading.value = true;
  errorMsg.value = "";
  try {
    const data = await adminFetchAcknowledgements(adminHeaders());
    list.value = data.list ?? [];
  } catch (err) {
    if (!handleAdminApiError(err)) {
      errorMsg.value = err instanceof Error ? err.message : "加载失败";
    }
  } finally {
    loading.value = false;
  }
}

async function doAdd() {
  if (!addForm.player_id.trim()) {
    errorMsg.value = "请输入玩家ID";
    return;
  }
  saving.value = true;
  errorMsg.value = "";
  try {
    await adminAddAcknowledgement(adminHeaders(), {
      player_id: addForm.player_id.trim(),
      category: addForm.category,
      description: addForm.description.trim(),
      sort_order: Number(addForm.sort_order) || 0,
    });
    resetAddForm();
    showAddForm.value = false;
    await loadList();
  } catch (err) {
    if (!handleAdminApiError(err)) {
      errorMsg.value = err instanceof Error ? err.message : "添加失败";
    }
  } finally {
    saving.value = false;
  }
}

async function doDelete(row: AcknowledgementItem) {
  if (!confirm(`确认删除「${row.player_id}」的致谢记录？`)) return;
  saving.value = true;
  errorMsg.value = "";
  try {
    await adminDeleteAcknowledgement(adminHeaders(), row.id);
    await loadList();
  } catch (err) {
    if (!handleAdminApiError(err)) {
      errorMsg.value = err instanceof Error ? err.message : "删除失败";
    }
  } finally {
    saving.value = false;
  }
}

const totalCount = computed(() => list.value.length);

onMounted(loadList);
</script>

<template>
  <AdminShell>
    <section class="ad-card">
      <h2 class="ad-card-title"><Icon icon="ph:hand-heart-duotone" class="ad-card-icon" /> 致谢名单管理</h2>
      <p class="ad-card-desc">
        管理公开致谢名单，支持添加、编辑、删除。类别：Bug 反馈 / 功能建议 / 技术支持 / 其他贡献。
        可通过 <strong>sort_order</strong> 控制显示顺序（数字小的靠前）。
      </p>
      <div class="ad-btn-row">
        <button class="btn" :disabled="loading" @click="loadList">
          <Icon v-if="loading" icon="ph:spinner-gap-bold" class="ph-spin" />
          {{ loading ? "加载中..." : "刷新列表" }}
        </button>
        <button class="btn btn-accent" :disabled="saving" @click="showAddForm = !showAddForm">
          <Icon icon="ph:plus-duotone" />
          {{ showAddForm ? "收起表单" : "新增条目" }}
        </button>
      </div>
    </section>

    <!-- Add form -->
    <section v-if="showAddForm" class="ad-card">
      <h3 class="ad-card-title"><Icon icon="ph:plus-circle-duotone" /> 新增致谢条目</h3>
      <div class="ad-form-grid">
        <label class="ad-form-field">
          <span class="ad-form-label">玩家 ID <em>*</em></span>
          <input v-model="addForm.player_id" class="ad-form-input" type="text" placeholder="输入玩家ID" maxlength="64" />
        </label>
        <label class="ad-form-field">
          <span class="ad-form-label">类别</span>
          <select v-model="addForm.category" class="ad-form-input">
            <option v-for="c in CATEGORY_OPTIONS" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
        </label>
        <label class="ad-form-field ad-form-field--w100">
          <span class="ad-form-label">描述（可选）</span>
          <input v-model="addForm.description" class="ad-form-input" type="text" placeholder="例如：报告了XX页面崩溃问题" maxlength="200" />
        </label>
        <label class="ad-form-field">
          <span class="ad-form-label">排序值</span>
          <input v-model.number="addForm.sort_order" class="ad-form-input" type="number" placeholder="0" />
        </label>
      </div>
      <div class="ad-btn-row">
        <button class="btn btn-accent" :disabled="saving" @click="doAdd">
          <Icon v-if="saving" icon="ph:spinner-gap-bold" class="ph-spin" />
          {{ saving ? "提交中..." : "确认添加" }}
        </button>
        <button class="btn-ghost" @click="showAddForm = false; resetAddForm()">取消</button>
      </div>
    </section>

    <!-- List -->
    <section v-if="!loading" class="ad-card">
      <div v-if="errorMsg" class="ad-error">{{ errorMsg }}</div>
      <h3 class="ad-card-title">
        列表 — 共 {{ totalCount }} 条
        <span class="ad-sub-hint">（点击单元格编辑）</span>
      </h3>

      <div v-if="!list.length" class="ad-empty">暂无数据，点击「新增条目」添加</div>

      <div v-else class="ad-table-wrap">
        <table class="ad-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>玩家 ID</th>
              <th>类别</th>
              <th>描述</th>
              <th>排序</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in list" :key="row.id">
              <td class="ad-td-mono">#{{ row.id }}</td>

              <!-- player_id -->
              <td
                class="ad-td-val"
                :class="{ 'ad-td-editing': editing?.id === row.id && editing.field === 'player_id' }"
                @click.stop="!editing ? startEdit(row, 'player_id') : null"
              >
                <template v-if="editing?.id === row.id && editing.field === 'player_id'">
                  <input
                    :ref="(el) => { editInputEl = el as HTMLInputElement | null; }"
                    class="ad-edit-input"
                    type="text"
                    :value="editing.value"
                    maxlength="64"
                    @input="(e) => { editing!.value = (e.target as HTMLInputElement).value; }"
                    @blur="commitEdit"
                    @keydown="onEditKey"
                    @click.stop
                  />
                </template>
                <template v-else>{{ row.player_id }}</template>
              </td>

              <!-- category -->
              <td
                class="ad-td-val"
                :class="{ 'ad-td-editing': editing?.id === row.id && editing.field === 'category' }"
                @click.stop="!editing ? startEdit(row, 'category') : null"
              >
                <template v-if="editing?.id === row.id && editing.field === 'category'">
                  <select
                    :ref="(el) => { editInputEl = el as HTMLSelectElement | null; }"
                    class="ad-edit-input"
                    :value="editing.value"
                    @change="(e) => { editing!.value = (e.target as HTMLSelectElement).value; commitEdit(); }"
                    @click.stop
                  >
                    <option v-for="c in CATEGORY_OPTIONS" :key="c.value" :value="c.value">{{ c.label }}</option>
                  </select>
                </template>
                <template v-else>{{ categoryLabel(row.category) }}</template>
              </td>

              <!-- description -->
              <td
                class="ad-td-val ad-td-desc"
                :class="{ 'ad-td-editing': editing?.id === row.id && editing.field === 'description' }"
                @click.stop="!editing ? startEdit(row, 'description') : null"
              >
                <template v-if="editing?.id === row.id && editing.field === 'description'">
                  <input
                    :ref="(el) => { editInputEl = el as HTMLInputElement | null; }"
                    class="ad-edit-input"
                    type="text"
                    :value="editing.value"
                    maxlength="200"
                    @input="(e) => { editing!.value = (e.target as HTMLInputElement).value; }"
                    @blur="commitEdit"
                    @keydown="onEditKey"
                    @click.stop
                  />
                </template>
                <template v-else>
                  <template v-if="row.description">{{ row.description }}</template>
                  <span v-else class="ad-td-empty">—</span>
                </template>
              </td>

              <!-- sort_order -->
              <td
                class="ad-td-val ad-td-num"
                :class="{ 'ad-td-editing': editing?.id === row.id && editing.field === 'sort_order' }"
                @click.stop="!editing ? startEdit(row, 'sort_order') : null"
              >
                <template v-if="editing?.id === row.id && editing.field === 'sort_order'">
                  <input
                    :ref="(el) => { editInputEl = el as HTMLInputElement | null; }"
                    class="ad-edit-input ad-edit-input--num"
                    type="number"
                    :value="editing.value"
                    @input="(e) => { editing!.value = (e.target as HTMLInputElement).value; }"
                    @blur="commitEdit"
                    @keydown="onEditKey"
                    @click.stop
                  />
                </template>
                <template v-else>{{ row.sort_order }}</template>
              </td>

              <!-- actions -->
              <td class="ad-td-actions">
                <button class="ad-del-btn" :disabled="saving" @click.stop="doDelete(row)">
                  <Icon icon="ph:trash-duotone" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </AdminShell>
</template>
