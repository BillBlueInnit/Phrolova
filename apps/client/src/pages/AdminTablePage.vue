<script setup lang="ts">
import { reactive, ref } from "vue";
import { Icon } from "@iconify/vue";
import Pagination from "@/components/shared/Pagination.vue";
import AdminShell from "@/components/admin/AdminShell.vue";
import { useAdmin } from "@/composables/useAdmin";
import { apiPath, requestJson } from "@/utils/http";

const { adminHeaders } = useAdmin();

const syncing = ref(false);
const syncError = ref("");

const localData = ref<Record<string,any[]>|null>(null);
const loadingLocal = ref(false);
const tableRowsSelected = ref(new Set<string>());
const tableEdits = ref(new Map<string,string>());
const TABLE_PAGE = 30;
const tablePages = reactive<Record<string,number>>({chars:1,echoes:1});

function tablePageOf(k:string){return tablePages[k]||1;}
function setTablePage(k:string,p:number){tablePages[k]=p;}

const DIFF_FIELDS: Record<string, string[]> = { characters: ["attribute", "star_rating", "weapon"], echoes: ["skill_attribute", "cost", "is_aberration", "set_name", "drop_location"] };

function fieldLabel(f:string){
  const m:Record<string,string>={attribute:"属性",star_rating:"星级",weapon:"武器",skill_attribute:"技能属性",cost:"COST",is_aberration:"异相",drop_location:"掉落位置",set_name:"套装"};
  return m[f]||f;
}

async function loadLocalData(){
  loadingLocal.value=true;localData.value=null;
  try{
    const d = await requestJson<{status:string;data:Record<string,any[]>}>(apiPath("/admin/data"),{headers:adminHeaders()});
    localData.value = d.data;
  }catch(e){ syncError.value = e instanceof Error?e.message:"加载失败"; }
  finally{ loadingLocal.value=false; }
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
    const result = await requestJson<{status:string;updated:number;message?:string}>(
      apiPath("/admin/update"),{method:"POST",headers:adminHeaders(),body:JSON.stringify({entries})}
    );
    if(result.status==="success"){tableRowsSelected.value=new Set();tableEdits.value=new Map();syncError.value="";}
    else{syncError.value=result.message||"更新失败";}
  }catch(e){syncError.value=e instanceof Error?e.message:"更新失败";}
  finally{syncing.value=false;}
}

const logs=ref<Array<{time:string;level:string;message:string}>>([]);
const showLogs=ref(false);
async function loadLogs(){
  try{const d=await requestJson<{logs:Array<{time:string;level:string;message:string}>}>(apiPath("/admin/logs"),{headers:adminHeaders()});logs.value=d.logs||[];showLogs.value=!showLogs.value;}catch{}
}
</script>

<template>
  <AdminShell>
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
  </AdminShell>
</template>
