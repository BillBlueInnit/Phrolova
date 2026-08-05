<script setup lang="ts">
import { reactive, shallowRef, ref } from "vue";
import { useRouter } from "vue-router";
import Pagination from "@/components/shared/Pagination.vue";
import { apiPath, requestJson } from "@/utils/http";

const router = useRouter();

// ── Auth ──
const adminToken = shallowRef(localStorage.getItem("admin_token") || "");
const authLoading = shallowRef(false);
const authError = shallowRef("");
const loginForm = reactive({ username: "", password: "" });
function setToken(t: string) { adminToken.value = t; localStorage.setItem("admin_token", t); }
function clearToken() { adminToken.value = ""; localStorage.removeItem("admin_token"); }
async function doLogin() {
  authLoading.value = true; authError.value = "";
  try {
    const data = await requestJson<{ status: string; token?: string; message?: string }>(
      apiPath("/admin/login"), { method: "POST", body: JSON.stringify({ username: loginForm.username.trim(), password: loginForm.password }) },
    );
    if (data.status === "success" && data.token) { setToken(data.token); loginForm.username = ""; loginForm.password = ""; }
    else { authError.value = data.message || "登录失败"; }
  } catch (e) { authError.value = e instanceof Error ? e.message : "登录请求失败"; }
  finally { authLoading.value = false; }
}
function doLogout() {
  requestJson(apiPath("/admin/logout"), { method: "POST", headers: { "X-Admin-Token": adminToken.value } }).catch(() => {});
  clearToken(); syncResult.value = null;
}
function adminHeaders(): Record<string, string> { return { "X-Admin-Token": adminToken.value }; }

// ── Diff section ──
const syncing = ref(false);
const syncResult = ref<Record<string, unknown> | null>(null);
const syncError = ref("");
const preview = ref<Record<string, unknown> | null>(null);
// name → Set<field> — only these fields will be synced. empty Set = sync all changed fields
const diffActions = ref(new Map<string, Set<string>>());
const DIFF_PAGE_SIZE = 30;
const diffPages = reactive<Record<string, number>>({});

function diffPageOf(key: string) { return diffPages[key] || 1; }
function setDiffPage(key: string, p: number) { diffPages[key] = p; }
function pagedDiff(arr: any[], key: string) { const p = diffPageOf(key); return arr.slice((p-1)*DIFF_PAGE_SIZE, p*DIFF_PAGE_SIZE); }

function setRemote(name: string) { diffActions.value.set(name, new Set()); diffActions.value = new Map(diffActions.value); }
function setLocal(name: string) { diffActions.value.delete(name); diffActions.value = new Map(diffActions.value); }
function toggleDiffField(name: string, field: string) {
  if (!diffActions.value.has(name)) diffActions.value.set(name, new Set());
  const s = diffActions.value.get(name)!;
  if (s.has(field)) s.delete(field); else s.add(field);
  if (s.size === 0) diffActions.value.delete(name);
  diffActions.value = new Map(diffActions.value);
}
function diffAction(name: string): "none" | "remote" | "partial" {
  const s = diffActions.value.get(name);
  if (!s) return "none";
  return s.size === 0 ? "remote" : "partial";
}
function isDiffFieldOn(name: string, field: string): boolean {
  const s = diffActions.value.get(name);
  return s ? (s.size === 0 || s.has(field)) : false;
}

async function loadPreview() {
  syncing.value = true; syncError.value = ""; syncResult.value = null; preview.value = null; diffActions.value = new Map();
  try {
    const data = await requestJson<{ status: string; result: Record<string, unknown> }>(
      apiPath("/admin/sync/preview"), { method: "POST", headers: adminHeaders(), body: JSON.stringify({ type: "all" }) },
    );
    preview.value = data.result;
  } catch (e) { syncError.value = e instanceof Error ? e.message : "预览失败"; }
  finally { syncing.value = false; }
}

async function triggerSync() {
  syncing.value = true; syncError.value = "";
  try {
    const entries = diffActions.value.size > 0
      ? [...diffActions.value.entries()].map(([name, fields]) => ({ name, fields: fields.size > 0 ? [...fields] : undefined }))
      : undefined;
    const start = await requestJson<{ status: string; message: string }>(
      apiPath("/admin/sync"), { method: "POST", headers: adminHeaders(), body: JSON.stringify({ type: "all", entries }) },
    );
    if (start.status !== "started") { syncError.value = start.message || "启动失败"; return; }
    for (let i=0;i<180;i++) {
      await new Promise(r=>setTimeout(r,1000));
      const s=await requestJson<{status:string;result:Record<string,unknown>|null}>(apiPath("/admin/sync/status"),{headers:adminHeaders()});
      if(s.status==="idle"){syncResult.value=s.result;preview.value=null;break;}
    }
  } catch(e){syncError.value=e instanceof Error?e.message:"同步请求失败";}
  finally{syncing.value=false;}
}

function tableTitle(key:string){return key==="characters"?"角色":"声骸";}
function fieldLabel(f:string){
  const m:Record<string,string>={attribute:"属性",star_rating:"星级",weapon:"武器",skill_attribute:"技能属性",cost:"COST",is_aberration:"异相",drop_location:"掉落位置",set_name:"套装"};
  return m[f]||f;
}
const DIFF_FIELDS:Record<string,string[]>={characters:["attribute","star_rating","weapon"],echoes:["skill_attribute","cost","is_aberration","set_name","drop_location"]};
function diffRows(r:any):any[]{
  const rows:any[]=[];
  for(const item of(r.new||[]))rows.push({...item,_kind:"new"});
  for(const item of(r.changed||[])){
    rows.push({name:item.name,_kind:"changed",before:item.before,after:item.after});
  }
  return rows;
}

// ── Table section ──
const localData = ref<Record<string,any[]>|null>(null);
const loadingLocal = ref(false);
const tableRowsSelected = ref(new Set<string>());
const tableEdits = ref(new Map<string,string>());
const TABLE_PAGE = 30;
const tablePages = reactive<Record<string,number>>({chars:1,echoes:1});

function tablePageOf(k:string){return tablePages[k]||1;}
function setTablePage(k:string,p:number){tablePages[k]=p;}

async function loadLocalData(){
  loadingLocal.value=true;localData.value=null;
  try{
    const d=await requestJson<{status:string;data:Record<string,any[]>}>(
      apiPath("/admin/data"),{headers:adminHeaders()}
    );
    localData.value=d.data;
  }catch(e){syncError.value=e instanceof Error?e.message:"加载失败";}
  finally{loadingLocal.value=false;}
}

function toggleTableRow(name:string){
  if(tableRowsSelected.value.has(name))tableRowsSelected.value.delete(name);
  else tableRowsSelected.value.add(name);
  tableRowsSelected.value=new Set(tableRowsSelected.value);
}
function isTableSelected(n:string){return tableRowsSelected.value.has(n);}
function editTableCell(name:string,field:string,cur:string){
  const key=`${name}|${field}`;
  const val=prompt(`编辑 ${name} · ${fieldLabel(field)}`,tableEdits.value.get(key)??cur);
  if(val!==null&&val!==cur){
    tableEdits.value.set(key,val);tableEdits.value=new Map(tableEdits.value);
    if(!tableRowsSelected.value.has(name)){tableRowsSelected.value.add(name);tableRowsSelected.value=new Set(tableRowsSelected.value);}
  }
}
function getTableEdit(name:string,field:string,fb:string):string{return tableEdits.value.get(`${name}|${field}`)??fb;}
async function syncTable(){
  const entries:{name:string;overwrites:Record<string,string>}[]=[];
  for(const name of tableRowsSelected.value){
    const ov:Record<string,string>={};
    for(const[key,val]of tableEdits.value.entries()){
      const idx=key.indexOf("|");
      if(idx===-1)continue;
      const n=key.slice(0,idx),f=key.slice(idx+1);
      if(n===name)ov[f]=val;
    }
    if(Object.keys(ov).length>0) entries.push({name,overwrites:ov});
  }
  if(!entries.length){syncError.value="请先编辑单元格";return;}
  syncing.value=true;syncError.value="";
  try{
    const result=await requestJson<{status:string;updated:number;message?:string}>(
      apiPath("/admin/update"),{method:"POST",headers:adminHeaders(),body:JSON.stringify({entries})}
    );
    if(result.status==="success"){tableRowsSelected.value=new Set();tableEdits.value=new Map();syncResult.value={ok:true,message:`已更新${result.updated}条`};}
    else{syncError.value=result.message||"更新失败";}
  }catch(e){syncError.value=e instanceof Error?e.message:"更新失败";}
  finally{syncing.value=false;}
}

// ── Logs ──
const logs=ref<Array<{time:string;level:string;message:string}>>([]);
const showLogs=ref(false);
async function loadLogs(){
  try{const d=await requestJson<{logs:Array<{time:string;level:string;message:string}>}>(apiPath("/admin/logs"),{headers:adminHeaders()});logs.value=d.logs||[];showLogs.value=!showLogs.value;}catch{}
}
</script>

<template>
<div class="ad-page">
<header class="ad-top">
  <button class="back-btn" @click="router.push('/')"><Icon icon="ph:arrow-left-duotone"/> BACK</button>
  <h1 class="ad-title">管理面板</h1>
  <div class="ad-top-right"><button v-if="adminToken" class="ad-logout-btn" @click="doLogout">登出</button></div>
</header>

<template v-if="!adminToken">
  <section class="ad-card">
    <h2 class="ad-card-title"><Icon icon="ph:lock-duotone" class="ad-card-icon"/> 管理员登录</h2>
    <div v-if="authError" class="ad-error">{{ authError }}</div>
    <label class="form-field"><span class="form-label">用户名</span><input v-model="loginForm.username" class="form-input" type="text" placeholder="管理员账号"/></label>
    <label class="form-field"><span class="form-label">密码</span><input v-model="loginForm.password" class="form-input" type="password" placeholder="管理员密码" @keyup.enter="doLogin"/></label>
    <button class="btn" :disabled="authLoading" @click="doLogin">{{ authLoading?'登录中...':'登录' }}</button>
  </section>
</template>

<template v-else>
  <!-- ═══ 对比 & 同步 ═══ -->
  <section class="ad-card">
    <h2 class="ad-card-title"><Icon icon="ph:git-diff-duotone" class="ad-card-icon"/> 对比 & 同步</h2>
    <p class="ad-card-desc">拉取远程数据与本地对比，选择差异条目同步到数据库</p>
    <div class="ad-btn-row">
      <button class="btn" :disabled="syncing" @click="loadPreview"><Icon icon="ph:magnifying-glass-duotone" class="btn-icon"/>{{ syncing?'对比中...':'对比差异' }}</button>
      <button v-if="preview" class="btn-ghost" :disabled="syncing" @click="preview=null;syncResult=null;syncError=''">清除</button>
    </div>
    <div v-if="syncError" class="ad-error">{{ syncError }}</div>
  </section>

  <template v-if="preview">
    <template v-for="(r,key) in {characters:preview.characters,echoes:preview.echoes}" :key="key">
      <section v-if="r?.ok" class="ad-card">
        <h3 class="ad-card-title">{{ tableTitle(key as string) }} — 远程{{ r.total_remote }}/本地{{ r.total_local }}</h3>
        <div class="ad-stat-row">
          <span class="ad-stat-pill ad-stat-pill--new">新增{{ r.new?.length||0 }}</span>
          <span class="ad-stat-pill ad-stat-pill--changed">变更{{ r.changed?.length||0 }}</span>
          <span class="ad-stat-pill">未变{{ r.unchanged }}</span>
        </div>
        <div v-if="!r.new?.length&&!r.changed?.length" class="ad-no-diff"><Icon icon="ph:check-circle-duotone"/> 已是最新</div>
        <template v-if="r.new?.length||r.changed?.length">
          <div class="ad-table-wrap">
            <table class="ad-table"><thead><tr>
              <th class="ad-th-sel">同步</th><th>名称</th><th>类型</th>
              <th v-for="f in DIFF_FIELDS[key as string]" :key="f">{{ fieldLabel(f) }}</th>
            </tr></thead><tbody>
              <tr v-for="item in pagedDiff(diffRows(r as any),key as string)" :key="item.name"
                :class="{'ad-row-new':item._kind==='new','ad-row-changed':item._kind==='changed','ad-row-sel':diffAction(item.name)!=='none'}">
                <td class="ad-td-sel">
                  <div class="ad-act-group">
                    <button class="ad-act-btn" :class="{'ad-act-btn--remote':diffAction(item.name)==='remote','ad-act-btn--partial':diffAction(item.name)==='partial'}"
                      @click.stop="diffAction(item.name)==='none'?setRemote(item.name):setLocal(item.name)"
                      :title="diffAction(item.name)==='none'?'点击同步远程':'点击保留本地'">
                      {{ diffAction(item.name)==='remote'?'远程':diffAction(item.name)==='partial'?'部分':'本地' }}
                    </button>
                  </div>
                </td>
                <td class="ad-td-name">{{ item.name }}</td>
                <td class="ad-td-kind"><span :class="item._kind==='new'?'ad-kind-tag--new':'ad-kind-tag--changed'">{{ item._kind==='new'?'新增':'变更' }}</span></td>
                <td v-for="f in DIFF_FIELDS[key as string]" :key="f" class="ad-td-val"
                  :class="{'ad-td-diff':item._kind==='changed'&&String(item.before?.[f])!==String(item.after?.[f]),'ad-td-edited':isDiffFieldOn(item.name,f)}"
                  @click.stop="item._kind==='changed'&&diffAction(item.name)!=='none'?toggleDiffField(item.name,f):null">
                  <template v-if="item._kind==='changed'&&String(item.before?.[f])!==String(item.after?.[f])">
                    <div class="ad-val-compact"><span class="ad-val-old">{{ item.before[f] }}</span><span class="ad-val-arr">→</span><span class="ad-val-new" :class="{'ad-val-edited':isDiffFieldOn(item.name,f)}">{{ item.after[f] }}</span></div>
                  </template>
                  <template v-else>{{ (item as any)[f]??'-' }}</template>
                </td>
              </tr>
            </tbody></table>
          </div>
          <Pagination v-if="diffRows(r).length>DIFF_PAGE_SIZE" :current="diffPageOf(key as string)" :total="diffRows(r).length" :size="DIFF_PAGE_SIZE" @change="setDiffPage(key as string,$event)"/>
        </template>
      </section>
    </template>
    <section class="ad-card">
      <div class="ad-btn-row">
        <button class="btn" :disabled="syncing||!diffActions.size" @click="triggerSync"><Icon icon="ph:cloud-arrow-down-duotone" class="btn-icon"/>{{ syncing?'同步中...':`应用${diffActions.size?`${diffActions.size}项`:'全部'}` }}</button>
        <button v-if="diffActions.size" class="btn-ghost" @click="diffActions=new Map()">全部保留本地</button>
      </div>
    </section>
  </template>

  <template v-if="syncResult">
    <section class="ad-card"><h2 class="ad-card-title">同步结果</h2>
      <template v-if="syncResult.ok===false"><p class="ad-result-error">{{ syncResult.message }}</p></template>
      <template v-else><div class="ad-stat-row"><span class="ad-stat-pill">版本{{ syncResult.version }}</span></div></template>
    </section>
  </template>

  <!-- ═══ 数据表格 ═══ -->
  <section class="ad-card">
    <h2 class="ad-card-title"><Icon icon="ph:table-duotone" class="ad-card-icon"/> 数据表格</h2>
    <p class="ad-card-desc">查看和编辑本地数据库中的所有数据，选中行后同步修改</p>
    <div class="ad-btn-row">
      <button class="btn" :disabled="loadingLocal" @click="loadLocalData">{{ loadingLocal?'加载中...':'加载数据' }}</button>
    </div>
  </section>

  <template v-if="localData">
    <template v-for="(records,key) in {char:localData.characters,echo:localData.echoes}" :key="key">
      <section v-if="records?.length" class="ad-card">
        <h3 class="ad-card-title">{{ key==='char'?'角色':'声骸' }} — {{ records.length }} 条</h3>
        <div class="ad-table-wrap">
          <table class="ad-table"><thead><tr>
            <th class="ad-th-sel">同步</th><th>名称</th>
            <th v-for="f in (key==='char'?DIFF_FIELDS.characters:DIFF_FIELDS.echoes)" :key="f">{{ fieldLabel(f) }}</th>
          </tr></thead><tbody>
            <tr v-for="row in records.slice((tablePageOf(key)-1)*TABLE_PAGE,tablePageOf(key)*TABLE_PAGE)" :key="row.name"
              :class="{'ad-row-sel':isTableSelected(row.name)}" @click="toggleTableRow(row.name)">
              <td class="ad-td-sel"><div class="ad-sel-dot" :class="{'ad-sel-dot--on':isTableSelected(row.name)}"/></td>
              <td class="ad-td-name">{{ row.name }}</td>
              <td v-for="f in (key==='char'?DIFF_FIELDS.characters:DIFF_FIELDS.echoes)" :key="f" class="ad-td-val"
                :class="{'ad-td-edited':tableEdits.has(`${row.name}|${f}`)}"
                @click.stop="editTableCell(row.name,f,String(row[f]??''))">
                <span :class="{'ad-val-edited':tableEdits.has(`${row.name}|${f}`)}">{{ getTableEdit(row.name,f,String(row[f]??'-')) }}</span>
              </td>
            </tr>
          </tbody></table>
        </div>
        <Pagination v-if="records.length>TABLE_PAGE" :current="tablePageOf(key)" :total="records.length" :size="TABLE_PAGE" @change="setTablePage(key,$event)"/>
      </section>
    </template>
    <section class="ad-card">
      <div v-if="syncError" class="ad-error">{{ syncError }}</div>
      <div class="ad-btn-row">
        <button class="btn" :disabled="syncing||!tableRowsSelected.size" @click="syncTable">{{ syncing?'同步中...':`同步修改${tableRowsSelected.size?`(${tableRowsSelected.size})`:''}` }}</button>
        <button v-if="tableRowsSelected.size" class="btn-ghost" @click="tableRowsSelected=new Set();tableEdits=new Map()">取消全部</button>
      </div>
    </section>
  </template>

  <!-- Logs -->
  <section class="ad-card ad-logs-card">
    <div class="ad-logs-header" @click="loadLogs">
      <h2 class="ad-card-title"><Icon icon="ph:terminal-duotone" class="ad-card-icon"/> 错误日志</h2>
      <Icon :icon="showLogs?'ph:caret-up-duotone':'ph:caret-down-duotone'" class="ad-logs-toggle"/>
    </div>
    <div v-if="showLogs" class="ad-logs-body">
      <p v-if="!logs.length" class="ad-logs-empty">暂无日志</p>
      <div v-for="(e,i) in logs" :key="i" class="ad-log-entry" :class="`ad-log-${e.level.toLowerCase()}`">
        <span class="ad-log-time">{{ e.time }}</span><span class="ad-log-level">{{ e.level }}</span><pre class="ad-log-msg">{{ e.message }}</pre>
      </div>
    </div>
  </section>
</template>
</div>
</template>
