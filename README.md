# Phrolova / 鸣潮角色猜谜游戏

这是一个面向中文用户的 Web 猜角色游戏项目，当前正在进行第一阶段重构：

- 前端：`Vue 3 + Pinia + Vite + TypeScript`
- 后端：`Flask + Socket.IO + MySQL`
- 反向代理：`OpenResty`
- 工程组织：`pnpm monorepo`
- 部署方式：`Docker Compose`

## 当前状态

第一阶段的目标是先把架构、实时通信、中文界面和 Docker 部署跑通，同时完整保留现有游戏规则：

- 单人模式
  - 共鸣者
  - 声骸
  - 声骸简单 / 困难
- 多人模式
  - 创建房间
  - 加入房间
  - 随机匹配
  - BO1 / BO3 / BO5
  - 逃逸判负
  - 刷新后恢复房间
- 登录 / 注册 / 验证码
- 玩家 ID 修改
- 排行榜与积分

第二阶段再接入更完整的二次元视觉包装，包括正式开屏资源、角色图和音乐。

## 新目录结构

```text
.
├── apps/
│   ├── client/                 # Vue 3 前端
│   └── server/                 # Flask + Socket.IO 后端
├── infra/
│   └── openresty/              # OpenResty 单入口
├── docs/
│   └── superpowers/
│       └── specs/              # 设计文档
├── database_init.sql           # MySQL 初始化脚本（继续兼容）
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

## 启动方式

### 1. 使用 Docker Compose

复制环境变量模板：

```bash
cp .env.example .env
```

启动全部服务：

```bash
docker compose up --build
```

启动后包含 4 个服务：

- `mysql`
- `server`
- `client`
- `openresty`

浏览器访问：

```text
http://127.0.0.1
```

### 2. 仅启动前端

```bash
pnpm install
pnpm client:dev
```

### 3. 仅启动后端

```bash
cd apps/server
pip install -r requirements.txt
python -m phrolova_server.app
```

## 数据库说明

项目继续兼容现有 `database_init.sql`，包含以下表：

- `characters`
- `sound_skeletons`
- `players`

`players` 表用于：

- 登录账号
- 玩家积分
- 胜场与总场次
- Socket 身份 token

## 规则摘要

### 颜色规则

- `match`：完全一致
- `near`：相差不大
- `different`：完全不同
- `partial`：多值字段部分命中

### 共鸣者

- 猜测字段：
  - 属性
  - 星级
  - 武器
  - 出生地
  - 实装版本
- 每局 4 次机会

### 声骸

- 猜测字段：
  - 技能属性
  - COST
  - 是否异相
  - 所属套装
  - 掉落位置
- 每局 8 次机会
- 支持简单 / 困难

### 多人模式

- 共鸣者每局 90 秒
- 声骸每局 150 秒
- 匹配成功后统一 2 秒倒计时开局
- 主动退出判负
- 对手名称打码，仅保留颜色反馈

## 兼容说明

仓库根目录原有的单体 Flask 文件仍保留，用于迁移期参考：

- `app.py`
- `core.py`
- `multi.py`
- `auth_routes.py`

第一阶段的新启动路径以 `apps/client`、`apps/server` 和 `infra/openresty` 为准。
