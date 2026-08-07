# Phrolova / 弗一把

> 鸣潮角色猜谜游戏 — 基于角色属性与声骸信息的 Web 多人猜谜对战平台

面向中文用户，pnpm monorepo 工程组织，Docker Compose 一键部署。

## 技术栈

### 前端 `apps/client`

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Vue 3（Composition API + `<script setup>`） | ^3.5 |
| 状态管理 | Pinia | ^2.3 |
| 路由 | Vue Router | ^4.5 |
| 构建工具 | Vite | ^6.3 |
| 语言 | TypeScript | ^5.8 |
| 实时通信 | Socket.IO Client | ^4.8 |
| 动画 | GSAP | ^3.15 |
| 图标 | @iconify/vue（Phosphor） | ^5.0 |

### 后端 `apps/server`

| 类别 | 技术 | 版本 |
|------|------|------|
| 语言 | Python | 3.12 |
| Web 框架 | Flask | 3.0 |
| 实时通信 | Flask-SocketIO | 5.4 |
| 异步引擎 | gevent + gevent-websocket | 24.11 |
| 数据库驱动 | PyMySQL | 1.1 |
| 密码加密 | cryptography | 44.0 |
| 验证码 | Pillow | 11.3 |
| 测试 | pytest | 8.3 |

### 基础设施

| 类别 | 技术 | 版本 |
|------|------|------|
| 数据库 | MySQL | 8.4 |
| 缓存 | Redis | 7 |
| 反向代理 | OpenResty（Nginx + Lua） | 1.27 |
| 包管理 | pnpm | 9.15 |
| 容器化 | Docker + Docker Compose | — |
| 运行时 | Node 22 / Python 3.12 | — |

## 游戏玩法

### 颜色反馈

每次猜测后，各字段以颜色标记比对结果：

| 颜色 | 含义 | 说明 |
|------|------|------|
| 绿色 | 完全匹配 | 该字段与答案完全一致 |
| 橙色 | 部分匹配 / 同组 | 数值相近或属于同一分类 |
| 灰色 | 不匹配 | 该字段与答案完全不同 |

### 单人模式

**共鸣者** — 每局 4 次猜测机会，比对以下字段：

| 字段 | 说明 |
|------|------|
| 属性（Attribute） | 冷凝 / 热熔 / 导电 等 |
| 星级（Rarity） | 4★ / 5★ |
| 武器（Weapon） | 迅刀 / 长刃 / 臂铠 等 |
| 出生地（Birthplace） | 今州 / 黑海岸 等 |
| 实装版本（Version） | 1.0 / 1.1 / 1.2 等 |

**声骸** — 每局 8 次猜测机会，分两种难度：

- **简单**：仅反馈属性（Attribute）与 COST 值，结果使用分组色彩标记
- **困难**：反馈技能属性、所属套装、掉落位置三类信息，每种反馈以独立颜色区分

### 多人对战

- **创建房间**：房主选择题型（共鸣者 / 声骸）与赛制（BO1 / BO3 / BO5），生成房间码后邀请对手
- **加入房间**：输入房间码即可加入，双方就绪后房主启动对局
- **随机匹配**：系统自动匹配在线玩家，固定 BO3 赛制，匹配成功即进入房间
- **对局流程**：每回合双方同时对同一目标进行猜测，猜对即赢下当前回合。共鸣者每局 90 秒，声骸每局 150 秒，匹配后统一 2 秒倒计时开局
- **隐私保护**：对手名称以 `***` 替代，但各字段颜色反馈完整保留

### 积分结算

| 模式 | BO1 | BO3 | BO5 |
|------|-----|-----|-----|
| 共鸣者 | ±10 | ±30 | ±50 |
| 声骸 · 简单 | ±5 | ±10 | ±15 |
| 声骸 · 困难 | ±30 | ±50 | ±70 |

### 对局判定

- **逃逸**：主动退出对战视为逃逸，对方直接赢得整场并按对应模式全额结算，逃逸者按对应模式扣减
- **断线**：异常断线后有 60 秒重连窗口，超时未恢复按逃逸处理；返回首页后可恢复房间续接
- **平局**：BO1 中双方均未猜对则平局，积分不变；BO3 / BO5 允许单回合平局，继续下一回合

## 功能概览

- 单人模式（共鸣者 / 声骸简单 / 声骸困难）
- 多人对战（创建房间 / 加入房间 / 随机匹配 / BO1·BO3·BO5）
- 登录 / 注册 / 验证码
- 玩家 ID 修改
- 排行榜与积分系统
- 数据图鉴浏览
- 逃逸判负 / 断线恢复

## 目录结构

```text
.
├── apps/
│   ├── client/                 # Vue 3 前端
│   └── server/                 # Flask + Socket.IO 后端
├── infra/
│   └── openresty/              # OpenResty 单入口反向代理配置
├── database_init.sql           # MySQL 初始化脚本
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

## 启动方式

### Docker Compose（推荐）

```bash
cp .env.example .env
docker compose up --build
```

启动后包含 4 个服务：`mysql`、`server`、`client`、`openresty`。浏览器访问 `http://127.0.0.1`。

### 仅前端

```bash
pnpm install
pnpm client:dev
```

### 仅后端

```bash
cd apps/server
pip install -r requirements.txt
python -m phrolova_server.app
```

## HTTP / HTTPS 反向代理

- 反向代理同时监听 `80`（HTTP）与 `443`（HTTPS）。
- **HTTP（`80`）始终可用，不需要任何证书**，默认即通过 `http://127.0.0.1/admin` 访问。
- **HTTPS（`443`）为可选增强**：Docker 构建时会自动生成一套自签名证书，使 `https://` 立即可用；不需要用户手动提供证书（生产可用真实证书覆盖，见 `infra/openresty/TLS.md`）。
- Flask 通过 `ProxyFix` 信任 `X-Forwarded-Proto`，并设置 `PREFERRED_URL_SCHEME` 与安全 Cookie，无论走 `http://` 还是 `https://` 都能正确生成对应协议的绝对地址。

## 多人房间空闲清理与 Redis

- 每个房间在 Redis 中以 `room:{code}` 记录存活 TTL（默认 30 分钟）。
- 房间内任意 Socket 事件（创建 / 加入 / 猜测 / 心跳）会刷新 TTL；长时间无活动的房间自动过期并下发 `multi:room_expired`。
- 新增环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PHROLOVA_REDIS_HOST` | `127.0.0.1` | Redis 地址 |
| `PHROLOVA_REDIS_PORT` | `6379` | Redis 端口 |
| `PHROLOVA_REDIS_DB` | `0` | Redis 数据库序号 |
| `PHROLOVA_ROOM_TTL` | `1800` | 房间无活动过期秒数（秒） |
| `PHROLOVA_USE_HTTPS` | `0` | 置为 `1` 时启用 HTTPS URL 生成与安全 Cookie |
| `PHROLOVA_URL_SCHEME` | `http` | URL 生成使用的协议（`https` 或 `http`） |

## 数据库

兼容现有 `database_init.sql`，包含以下表：

- `characters` — 角色数据
- `sound_skeletons` — 声骸数据
- `players` — 玩家账号、积分、胜场/总场次、Socket 身份 token
