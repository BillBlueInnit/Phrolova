# 网络层架构重构计划

## 一、现状调研结论

### 1.1 当前项目（Phrolova）网络层架构

```
src/api/
├── http.ts                # 极简 fetch 封装：requestJson() / apiPath() / ApiError
├── auth.ts                # 认证相关 API 函数（登录/注册/initPlayer 等）
├── game.ts                # 游戏相关 API 函数（draw/submit 等）
├── leaderboard.ts         # 排行榜 API
├── acknowledgements.ts    # 致谢&管理后台 API
├── multiplayer.ts         # 仅事件名常量+类型定义，无 WS 连接代码
└── index.ts               # 统一 barrel 导出
src/utils/http.ts          # 仅 re-export @/api/http，无实际逻辑
src/composables/useAdmin.ts # 管理员会话，直连 requestJson()，绕过统一层
src/stores/
├── auth.ts                # 玩家会话（playerId/token 存 localStorage），直连 @/api/*
├── singleGame.ts          # 单人游戏 store，直连 @/api/*
├── dictionary.ts          # 字典 store，直连 @/api/*
└── multiGame.ts           # ★ 内联 150 行 GameWebSocket 类 + 连接/重连/心跳/状态机
```

**核心问题：**

| 问题点 | 现状描述 | 影响 |
|---|---|---|
| HTTP 客户端无拦截器 | `requestJson()` 是裸 fetch 包装，无请求/响应拦截器 | ① Token 过期 401 时无法透明刷新+重试，用户被踢需重登；② 无统一请求 ID / 超时 / 重试机制；③ 每个 API 函数手动 JSON.stringify body、手动拼 headers |
| Token 注入分散 | 玩家 token 手动放入 POST body（`drawTarget`/`submitGuess`），管理员 token 手动传 headers 对象 | 新增接口容易漏传；Auth 过期时所有调用方各自处理 401，代码重复 |
| 错误处理分散 | 无统一错误码→用户消息映射；每页 `try/catch` 手写 `reason instanceof Error ? reason.message : "xxx失败"` 共 48 处 | 错误文案不统一；后端新增错误码前端要改多处 |
| 认证与会话耦合混乱 | 会话初始化（hydrate）在 `authStore.hydrate()`；管理员会话在 `useAdmin.ts`；无 auth hint → 无法在请求发出前预判是否要带认证头，也无法统一触发刷新 | 401 处理重复；启动时身份初始化时序不清晰 |
| WebSocket 与 Store 耦合 | `GameWebSocket` 类（~150 行）直接写在 `multiGame.ts` 内，和业务状态机、事件 handler 混在一起 | 无法独立测试 WS 层；连接策略（重试次数、退避、超时、连接状态 toast）无法复用到其他场景 |
| WS 错误静默 | `gameWs.onerror` 是空函数；`noteSocketConnectionFailure` 类策略不存在 | 连接失败只有在 Promise reject 时才暴露；中途断连用户无感知直到操作失败 |
| 无并发请求去重 | `refreshPlayer`、`ensureGuestSession` 类操作无 singleton Promise 保护 | 重复触发时多次打到后端，有竞态风险 |

### 1.2 参考项目（csgofriberg）网络层核心架构

```
client/src/api/
├── client.ts          # ★ 核心：axios 实例 + 请求/响应拦截器 + errMsg()
│                      #   请求拦截：注入 PoW header、X-Auth-Expected header
│                      #   响应拦截：POW_REQUIRED→重做 PoW→重试；AUTH_EXPIRED→刷新会话→重试
│                      #   errMsg()：统一错误码→i18n 文案
├── authSession.ts     # ★ 认证会话 hint + 刷新（refreshAuthenticatedSession 单例 Promise）
├── session.ts         # 身份初始化：ensureGuestSession / initializeIdentity（含并发去重）
├── socket.ts          # ★ socket.io 单例管理：懒连接、连接失败阈值提示、恢复后提示、AUTH_EXPIRED 恢复、resourceVersion 广播
├── pow.ts             # 工作量证明（当前项目无需）
├── geetest.ts         # 极验（当前项目无需）
└── ...                # 其他业务模块 API 函数（业务函数只调 api.xxx()，不直接碰 fetch/axios）
```

**4 个核心设计模式（要迁移的就是这 4 个）：**

1. **`client.ts` 统一 HTTP 客户端 + 拦截器链**  
   - 业务代码从不直接调 fetch，只调 `api.get/post/put/delete`
   - 请求拦截器：统一注入 baseURL、Content-Type、认证期望 header、通用请求元数据
   - 响应拦截器：**透明重试**（POW_REQUIRED / AUTH_EXPIRED 自动处理后重放原请求，业务层无感知）
   - `errMsg(err)`：一处集中错误码→用户可读消息映射

2. **`authSession.ts` 会话 hint + 单例 refresh**  
   - `localStorage` 存 `AUTH_HINT = '1'` / `GUEST_HINT = '1'`，不存敏感信息（敏感信息走 HttpOnly Cookie 或现有 token）
   - `hasAuthHint()` 可在**请求前**快速判断身份，避免打无意义的请求
   - `refreshAuthenticatedSession()` 用模块级 `refreshRequest` Promise 做并发去重，同时多个 401 触发只刷新 1 次

3. **`session.ts` 身份初始化层**  
   - `ensureGuestSession()`：保证有身份；并发去重（模块级 `guestRequest`）
   - `initializeIdentity()`：应用启动时跑一次，按 hint 决定是拉 `/auth/me` 还是走游客

4. **`socket.ts` WebSocket 单例管理层**  
   - 模块级 `socket` 单例 + `connectTask` / `identityRecovery` Promise 去重
   - 懒连接：`getSocket()` 首次调用才 `connect()`
   - 连接状态通知策略：`SOCKET_FAILURES_BEFORE_NOTICE = 2` 次失败才 toast 一次；恢复成功自动 toast + 清错误
   - AUTH_EXPIRED：自动 `refreshAuthenticatedSession()` → 失败则降级游客 → 重连

---

## 二、重构目标 & 边界

### 2.1 要做的（按参考架构对齐）

- [x] 引入 axios 作为 HTTP 客户端（替代裸 fetch + requestJson）
- [x] 建立 `src/api/client.ts`：axios 实例 + 请求/响应拦截器 + `errMsg()` + 透明重试
- [x] 建立 `src/api/authSession.ts`：AUTH_HINT / 单例 `refreshAuthenticatedSession()`
- [x] 建立 `src/api/session.ts`：`ensureIdentity()` / `initializeIdentity()` 启动初始化
- [x] 建立 `src/api/socket.ts`：抽离 WS 连接层（从 `multiGame.ts` 中拆出 `GameWebSocket` 单例），含连接状态提示
- [x] 迁移 `src/api/*.ts` 业务函数到新客户端（auth/game/leaderboard/acknowledgements）
- [x] 改造 `useAdmin.ts` 使用新客户端（管理员 401 自动跳转不再分散）
- [x] 改造 3 个 stores（auth/singleGame/dictionary）使用新会话层
- [x] 改造 48 处页面 try/catch 使用 `errMsg()`，移除重复错误文案硬编码

### 2.2 不做的（保持现有约束）

- ❌ **不迁移 PoW（工作量证明）**：当前项目后端无 PoW 校验，不引入 `pow.ts` 相关机制
- ❌ **不迁移极验/邮件验证**：当前项目无此类功能
- ❌ **不迁移 i18n 框架**：当前项目无 i18n，`errMsg()` 直接用硬编码中文映射表（后续要加 i18n 时仅改这一处）
- ❌ **不把原生 WebSocket 换成 socket.io-client**：当前后端 Durable Object 用原生 WS 协议 + JSON 消息，socket.io-client 不兼容。socket 层保留原生 WebSocket，但参考参考架构的**连接管理模式**
- ❌ **不改后端协议**：token 仍放 query params（WS）或 body（HTTP）；后端响应格式仍为 `{ status, message, ...fields }`，不强制套 `{ code }` 外壳
- ❌ **不引入 HttpOnly Cookie 会话**：当前 token 存在 localStorage，重构期间保持存储方式不变，否则要同步改后端
- ❌ **不拆除旧文件**：`src/api/http.ts`、`src/utils/http.ts` 保留但标记 deprecated，确保有过渡阶段可用

---

## 三、文件/模块变更清单

### 3.1 新增文件

| 文件 | 职责 | 对齐参考 |
|---|---|---|
| `src/api/client.ts` | axios 实例、请求/响应拦截器、透明重试、`errMsg()` 映射 | `csgofriberg:client/src/api/client.ts` |
| `src/api/authSession.ts` | AUTH_HINT 读写、`refreshAuthenticatedSession()` 单例刷新 | `csgofriberg:client/src/api/authSession.ts` |
| `src/api/session.ts` | `ensureIdentity()` 身份保证、`initializeIdentity()` 启动初始化、并发去重 | `csgofriberg:client/src/api/session.ts` |
| `src/api/socket.ts` | 原生 WS 单例工厂、连接状态通知、身份恢复、`getGameSocket()` / `closeGameSocket()` / 订阅连接状态 | 参考 `csgofriberg:client/src/api/socket.ts` 模式，协议保持项目原生 JSON-over-WS |

### 3.2 需修改文件

| 文件 | 修改内容 | 风险级 |
|---|---|---|
| `package.json` | 添加 `axios` 依赖（当前未安装） | 低（纯新增） |
| `src/api/auth.ts` | 函数体从 `requestJson()` 切到 `api.post()`/`api.get()`；参数名映射保持不变 | 中 |
| `src/api/game.ts` | 同上；`drawTarget`/`submitGuess` 的 player_id/token 改为由拦截器注入（如果后端支持 header）或保留 body（保持兼容） | 中 |
| `src/api/leaderboard.ts` | 切换到新客户端 | 低 |
| `src/api/acknowledgements.ts` | 切换到新客户端；admin headers 改为由 admin 拦截器注入而非参数传入 | 中（函数签名变化→调用方也要改） |
| `src/api/index.ts` | 新增导出：`api`, `errMsg`, `ensureIdentity`, `initializeIdentity`, `hasAuthHint`, `getGameSocket`, `closeGameSocket` | 低 |
| `src/api/http.ts` | 所有导出标记 `@deprecated`，内部实现改由新 client 兜底（过渡期双写） | 低 |
| `src/utils/http.ts` | 标记 `@deprecated`，re-export 指向不变 | 低 |
| `src/composables/useAdmin.ts` | ① 登录/登出切到新 client；② `adminHeaders()` 改为由请求拦截器自动注入（新增 `ADMIN_TOKEN_HINT`）；③ `handleAdminApiError` 改为由拦截器统一处理 | 中（和 acknowledgements 联动） |
| `src/stores/auth.ts` | ① `hydrate()` 改为调用 `initializeIdentity()`；② `login/register/upgradePassword` 成功后 `markAuthenticated()`；③ `logout()` 调 `clearAuthenticated()`；④ `refreshPlayer` 做并发去重 | 中 |
| `src/stores/singleGame.ts` | 不用改调用（走 `@/api` 导出，API 层已切换），但 catch 中错误文案改调 `errMsg()` | 低 |
| `src/stores/dictionary.ts` | 同上 | 低 |
| `src/stores/multiGame.ts` | ① 删除内联 `GameWebSocket` 类（~150 行）；② `gameWs` 改为从 `getGameSocket()` 获取；③ 连接状态 toast 策略改由 `socket.ts` 统一触发；④ 保留业务事件处理（ROOM_STATE 等）和状态机 | **高**（核心逻辑最大块） |
| `src/App.vue` | 启动流程改为先 `initializeIdentity()` 再 `resumeRoom()` | 低 |
| `src/components/shared/StatusBanner.vue` / 新增 `Toast.ts` | 参考项目有 `toast.success/error/dismiss`；当前项目仅 `StatusBanner`。需新增极简全局 Toast（或复用 StatusBanner 暴露 API）以便 `socket.ts` 和拦截器能发通知 | 低 |
| `src/pages/*.vue` 共 ~48 处 catch 块 | 错误文案从手写字符串改为 `errMsg(reason)` | 低（批量替换，单处改动极小但量大） |

---

## 四、实施步骤（分阶段，建议每阶段自测后再推进下一阶段）

### 阶段 0：前置准备

1. **安装 axios**
   - `pnpm add axios`（项目当前未安装）
   - 无需改 vite.config，axios 支持 ESM + browser

2. **准备全局通知机制**
   - 方案 A（优先，最小改动）：在 `src/composables/useToast.ts` 新建一个基于 `reactive([])` 的全局 toast 队列，`App.vue` 渲染队列；提供 `toast.error(msg, { id })` / `toast.dismiss(id)` / `toast.success(msg)` API，模仿参考项目
   - 方案 B：直接复用 `StatusBanner` + 一个全局 ref 暴露 `pushBanner`
   - 拦截器和 socket 层**只依赖 toast API**，不耦合 UI 组件实现

### 阶段 1：建立 4 个核心模块（不动业务代码）

3. **实现 `src/api/client.ts`**
   - 创建 axios 实例：`baseURL: import.meta.env.VITE_API_BASE || '/api'`，`timeout: 15000`
   - **请求拦截器**：
     - 统一 `Content-Type: application/json`（已有 body 时）
     - 若 `hasAuthHint()`：从 authStore 取 `{ player_id, token }` 注入（兼容两种方式：① 若后端接受 header，放 `X-Player-Id` / `X-Player-Token`；**过渡期保持现有 body 注入方式**，拦截器不强制改 payload，只记录 hint 给响应拦截器用）
     - 若有 admin hint，注入 `X-Admin-Token` header
     - 记录请求 ID + 开始时间（方便调试）
   - **响应拦截器成功分支**：
     - 若响应头有会话过期提示，透传给 authSession
     - `return response.data`（直接解包 axios 的 `data` 层，业务层拿到的结构和现在 `requestJson` 相同，减少改动）
   - **响应拦截器错误分支**：
     - 若 `!response`（网络失败）→ 抛标准化消息
     - 若 `status === 401`：
       - 玩家会话：**检查 hint** → `refreshAuthenticatedSession()` → 成功则原请求重放（config 上打 `_authRetried` 标记防无限循环）；失败则 `clearAuthenticated()` + 让调用方拿到原 401
       - 管理员会话：`clearAdminToken()` + 触发路由跳转（由 `handleAdminApiError` 注册的回调或直接 import router）
     - 若业务层 `data.status === 'error'`：也走 ApiError（和当前 `requestJson` 行为对齐）
   - 实现 `errMsg(err: unknown): string`：
     - 建一张错误码表（初始为空，遇到一个加一个，兜底 `NETWORK_ERROR` / `INTERNAL_ERROR`）
     - 区分：axios 错误（`isAxiosError`）/ 网络错误（无 response）/ 业务 ApiError / 未知 Error
     - 兼容当前项目：`ApiError` 的 `message` 优先返回（即后端 message 字段直接透传），无则 fallthrough 到默认文案

4. **实现 `src/api/authSession.ts`**
   - `AUTH_HINT = 'phrolova_auth_hint'`（用项目前缀，避免和缓存旧 key 冲突）
   - `ADMIN_HINT = 'phrolova_admin_hint'`
   - `markAuthenticated()` / `clearAuthenticated()` / `hasAuthHint()`：localStorage 读写 `'1'`
   - `markAdmin()` / `clearAdmin()` / `hasAdminHint()`：同上
   - `refreshAuthenticatedSession(force=false): Promise<boolean>`
     - 模块级 `refreshRequest: Promise<boolean> | null = null` 做并发去重
     - 实际刷新：调用 `api.post('/player/init', { player_id: authStore.playerId })` 等价于现有 `refreshPlayer()`
     - 成功 → `markAuthenticated()` + 更新 authStore stats；返回 `true`
     - 401 → `clearAuthenticated()` + authStore.clearSession；返回 `false`
     - 其他错误 → 向外抛（由拦截器决定是否重试）

5. **实现 `src/api/session.ts`**
   - `ensureIdentity()`：若 `hasAuthHint()` → 不做额外事（信任拦截器会刷新）；否则触发匿名 init（可用现有 `initPlayer` 不带 playerId 时的匿名逻辑，或仅保证 hint 一致）
   - `initializeIdentity()`：**应用启动时调用一次**
     - 有 auth hint → 调 `/player/score` 或 `/player/init` 刷新身份；失败则清 hint
     - 无 auth hint → 清残留 token，确保状态干净
     - 返回 Promise，App 启动后可 await（或 fire-and-forget 但要 catch 用 toast）
   - 模块级 `_initTask` 防止并发重复初始化

6. **实现 `src/api/socket.ts`（原生 WebSocket，但管理模式对齐参考）**
   - 类型：`type GameSocketInstance = { send, disconnect, connected, on(event, handler) }`（或沿用原有回调风格，最小改动）
   - 模块级变量：
     - `_socket: GameWebSocket | null = null`（类实现可以先复用现有代码，搬迁到该文件后再逐步优化）
     - `_connectTask: Promise<void> | null = null`
     - `_identityRecovery: Promise<void> | null = null`
     - `_failedConnections = 0`，`SOCKET_FAILURES_BEFORE_NOTICE = 2`
     - `_errorNotified = false`，`_errorToastId = 0`
   - 导出：
     - `getGameSocket(path, { playerId, token }): Promise<GameWebSocket>` — 懒连接 + 复用
     - `closeGameSocket()` — 彻底断开并清状态
     - `subscribeSocketStatus(listener)` — 可选，供 UI 绑连接灯
   - 关键行为（和参考对齐）：
     - **连接成功**：清失败计数，若之前有错误 toast 则 dismiss + toast.success("连接已恢复")
     - **连接失败**：失败计数+1；累计达到阈值才 `toast.error("网络连接失败")`（避免闪一下就报）；失败错误码若能识别（如后端 `AUTH_EXPIRED` 消息）→ 走 `_identityRecovery`：先 `refreshAuthenticatedSession()`，若失败降级后再重连
     - **中途断开 + 已连接过**：指数退避自动重连（现有逻辑保留），但重连多次失败后也要走阈值 toast 策略

### 阶段 2：迁移业务 API 层（调用面不变，内部切实现）

7. **迁移 `src/api/auth.ts`**
   - 所有函数 `return requestJson<T>(...)` → `return api.post<T>(...)` 或 `api.get<T>(...)`
   - `body: JSON.stringify(x)` → axios 直接传对象（会自动 stringify）
   - URL 参数拼接：`URLSearchParams` 拼好后 `api.get(\`/auth/scrypt-params?${params}\`)` 照旧（或用 axios `params` 选项，更简洁）
   - **函数签名 100% 不变**，stores 无需改

8. **迁移 `src/api/game.ts`**
   - 同上，切换到 `api.get/post`
   - 过渡期：player_id/token 仍放 POST body，不改后端协议

9. **迁移 `src/api/leaderboard.ts`** — 最简单，替换实现即可

10. **迁移 `src/api/acknowledgements.ts`**
    - 函数签名调整：原先 `adminFetchAcknowledgements(headers: Record<string, string>)` → 改成 **不传 headers**，改由请求拦截器根据 `hasAdminHint()` 自动注入 `X-Admin-Token`
    - 对应地，`adminAddAcknowledgement/Update/Delete` 也去掉 headers 参数
    - 此改动会连锁影响 `AdminAcknowledgementsPage.vue` / `AdminTablePage.vue` / `AdminDiffPage.vue` / `AdminShell.vue`，调用时删掉 `headers` 参数即可（阶段 4 处理）

11. **更新 `src/api/index.ts` barrel 导出**
    - 新增：`export { api, errMsg } from "./client"`
    - 新增：`export { markAuthenticated, clearAuthenticated, hasAuthHint, refreshAuthenticatedSession, markAdmin, clearAdmin, hasAdminHint } from "./authSession"`
    - 新增：`export { ensureIdentity, initializeIdentity } from "./session"`
    - 新增：`export { getGameSocket, closeGameSocket } from "./socket"`
    - 原 `ApiError / requestJson / apiPath` 保留但注释 deprecated

12. **`src/api/http.ts` 打 deprecated 标签**
    ```ts
    /** @deprecated Use `api` from `@/api` instead */
    export function requestJson<T>(url, init) { /* 内部可委托给 client.ts 保证双写期可用 */ }
    ```
    `src/utils/http.ts` 同理

### 阶段 3：改造会话/身份管理层（Store & Composable）

13. **改造 `src/stores/auth.ts`**
    - `login/register/upgradePassword` 成功后 **追加** `markAuthenticated()` 调用
    - `logout()` 改为：
      ```ts
      async function logout() {
        try { await api.logout(); } catch { /* best-effort */ }
        clearAuthenticated();  // 来自 authSession
        clearSession();        // 现有 localStorage 清理
      }
      ```
    - `hydrate()` → 内部改为调用 `initializeIdentity()`，然后同步本地 stats；`initializeIdentity()` 会处理 hint 无效时自动清
    - `refreshPlayer()`：加并发去重（模块级 `_refreshTask`，参考 authSession 的模式）
    - `updatePlayerId()` 成功后确保 hint 仍有效（通常无需改动）

14. **改造 `src/composables/useAdmin.ts`**
    - `doAdminLogin()` 成功后 `markAdmin()`；失败/退出 `clearAdmin()`
    - `adminHeaders()`：保留但标注 deprecated（实际不再需要业务层传）
    - `handleAdminApiError()`：保留函数，但改为**由 client.ts 响应拦截器在 401 + hasAdminHint 时自动调用**（减少调用方分散 try/catch 判断 401）
    - `bindAdminRouter()` 机制保留，拦截器里调 router 替换时用

### 阶段 4：抽离 WebSocket 层 + 页面错误文案替换

15. **抽离 `multiGame.ts` 的 `GameWebSocket` → `src/api/socket.ts`**
    - 步骤：
      1. 把 `GameWebSocket` 类整块复制到 `socket.ts`
      2. `multiGame.ts` 中 import 之，其他代码不动 → **验证功能完全不退化**
      3. 再在 `socket.ts` 中叠加连接状态阈值 toast、身份恢复、`getGameSocket()` 单例去重
      4. `multiGame.ts` 改为：`gameWs = await getGameSocket(path, { playerId, token })`，new GameWebSocket 写法消失
    - 关键：先搬代码不改逻辑（保证回归最小），再加策略（能回滚）

16. **`App.vue` 启动时序改造**
    - `onMounted` 先 `initializeIdentity().catch(...)`（或 fire-and-forget 但要 toast 错误）
    - 再 `resumeRoom()`

17. **~48 处页面 catch 块统一用 `errMsg()`**
    - 搜索模式：`reason instanceof Error ? reason.message : "xxx失败"`
    - 批量替换为：`errMsg(reason)`
    - 管理员页面 catch 中对 401 的特判可删除（拦截器已统一处理跳转）

### 阶段 5：联调 + 回归 + 清理

18. **TypeScript 编译**
    - `pnpm exec tsc --noEmit` 必须 0 error

19. **关键链路自测（建议每条写回归记录）**
    - [ ] 匿名启动 → 首页 → 开始单人游戏（resonator easy/hard + skeleton）→ 猜一次正确 + 一次错误
    - [ ] 注册新用户 → 登录 → 关闭页重开 → hydrate 自动恢复登录态
    - [ ] 等待 token 过期（可临时改 SESSION_TTL 为 30s 加速测试）→ 触发一次 API → 拦截器透明 refresh 成功 → 用户无感知
    - [ ] token 过期且 refresh 也失败（服务端 KV 过期）→ 自动清 hint + 回到未登录状态 + toast 提示
    - [ ] 管理员登录 → 操作致谢列表（增删改查）→ token 过期自动跳回登录页 + redirect query
    - [ ] 创建房间 → 另一客户端（或隐身窗口）加入 → 对战一轮 → 离开/弃权
    - [ ] 随机匹配 → 中途断网 3 秒 → 自动重连且匹配状态不丢 → 阈值失败提示后再恢复成功提示
    - [ ] 排行榜翻页、DataPage 字典加载、Acknowledgements 页

20. **清理 deprecated 文件（可选，或留到下一个迭代）**
    - `src/utils/http.ts` 可删除（所有调用点已改完）
    - `src/api/http.ts` 若 0 引用可删除，否则保留一个 minor 版本

---

## 五、潜在依赖 & 注意事项

### 5.1 新增依赖
- **axios**：`^1.7.x` 或最新稳定版。纯前端库，~40KB gzipped，无 server 端风险（Pages 构建会 tree-shake）

### 5.2 关键兼容注意点
1. **响应解包**：当前 `requestJson()` 返回 `response.json()`；axios 拦截器 `return response.data` 可保持一致。**注意**：后端若 200 但返回 `status: 'error'`，axios 默认不会进入 error 分支 → 需要在**响应拦截器成功分支里**手动判定并抛错，否则业务层拿到 `status === 'error'` 却没进 catch，逻辑会坏。这个必须在 `client.ts` 写清楚：
   ```ts
   api.interceptors.response.use(
     (response) => {
       const data = response.data;
       if (data && typeof data === 'object' && data.status === 'error') {
         // 合成 axios 风格的错误对象，进 catch 分支
         return Promise.reject({
           isAxiosError: true,
           response: { status: response.status, data },
           config: response.config,
         });
       }
       return data;
     },
     errorHandler
   );
   ```
2. **玩家 token 注入位置**：当前后端在 body 取 `player_id/token`（`drawTarget` 等）。若直接让拦截器放 header，后端不认 → 过渡期在拦截器里**不读也不注入 body**，业务 API 函数照常写在 body 内。等后端同步支持 header 后再统一。
3. **管理员函数签名变化**：`adminFetchAcknowledgements(headers)` → `adminFetchAcknowledgements()` 是**破坏性变更**，所有调用点要同步删除参数。因为改动集中在 4 个 admin 页面，影响可控，但必须一次改完。
4. **WS 协议不变**：`socket.ts` 底层仍是 `GameWebSocket` 类 + `JSON.stringify({ type, payload })`，和服务端 Durable Object 协议 100% 兼容，不涉及后端改动。

### 5.3 风险处理

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| axios 引入后打包体积变大 | 首屏加载多 30~40KB | axios 是业界标准，gzip 后 ~15KB，可接受；若严格限制体积可改用 `ofetch` 或保留 fetch 但手动实现拦截器（工作量×2，不推荐） |
| 拦截器透明重试导致的竞态 | 刷新会话时并发请求排队 | 已通过 `refreshRequest` 单例 Promise 解决；重试标记 `_authRetried` 防循环 |
| WS 层抽离时引入重连回归 | 用户房间中断 | **先搬代码再优化**（Step 15.1 先 1:1 复制 → 验证通过再叠加策略）；每步都能独立回滚 |
| 大量页面 catch 替换漏网 | 个别页面错误文案不统一 | 分模块做：Admin → Auth → Home → Game → Multi → Leaderboard；每块替换后 grep 一次 `instanceof Error ? reason.message`，确保 0 残留 |
| 本地 localStorage 旧 AUTH_HINT 缺失导致首次刷新必登出 | 已有用户体验下降 | 迁移时：`hasAuthHint` 兼容检查——不仅看 `AUTH_HINT`，也看 `phrolova_player_token !== ''`，命中则**自动帮用户补 markAuthenticated()**，避免一次登出潮 |

---

## 六、预期收益（做完后能获得参考架构的 4 个核心能力）

1. **透明会话刷新**：token 过期用户无感，刷新成功继续操作，不再被强制踢回登录页（401 不再是每个页面的负担）
2. **一处错误码映射**：新增错误只需改 `errMsg()` 一张表；所有页面文案自动对齐；网络失败/超时/解析失败统一文案
3. **WS 连接状态对用户可见**：弱网/后台切换后断连有提示 + 恢复后有反馈，不再"傻傻等"
4. **并发去重**：刷新身份/初始化会话/WS 连接 3 个高频操作不会并发打后端，减少 D1/KV 压力与竞态

---

## 七、不做的功能及原因（和参考项目的差异边界）

| 参考项目的能力 | 当前不迁移原因 | 后续可加 |
|---|---|---|
| PoW（工作量证明）注册防护 | 后端无对应校验逻辑；当前项目仅靠验证码 | 若后端接入 Drizzle + Redis 做 PoW 校验可补 |
| GeeTest 行为验证 | 无此需求 | 有反作弊需求时加 |
| 邮箱验证 + verified matchmaking | 账号体系无邮箱字段 | 加邮箱列 + SMTP worker 后可加 |
| i18n 多语言 | 当前项目全中文 | 要出海时：`errMsg()` 内映射表接 vue-i18n 即可，调用面不变 |
| socket.io-client 协议 | 服务端 Durable Object 用原生 WS | 若后端切 socket.io-adapter + Redis 可改 |
| HttpOnly Cookie 会话 | 要改后端 setCookie + 跨域策略，工程量大 | 后续可和 refresh token 机制一起改 |
