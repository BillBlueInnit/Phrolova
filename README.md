# 🎭 角色猜谜游戏

一个基于 **Python (Flask) + MySQL** 的角色猜谜网站。

系统从数据库**随机抽取一个角色**作为目标，玩家输入角色名进行猜测。系统将目标角色与猜测角色逐项对比，并用**颜色**提示接近程度，帮助玩家逐步锁定答案。

## 🎨 颜色规则

| 颜色 | 含义 | 说明 |
|------|------|------|
| 🟢 绿色 | 完全一样 | 猜测项与目标完全一致 |
| 🟠 橙色 | 相差不大 | 仅限**星级**和**版本**：星级只有 4/5，两者不同即相邻档位；版本相减绝对值 ≤ 0.2 |
| ⚪ 灰色 | 完全不一样 | 其他所有不匹配情况 |

## 🎮 游戏模式

### 主菜单
- 提供 **单人模式 / 多人模式 / 排行榜 / 规则** 四个入口。
- 如需详细规则请自行查看主菜单的规则入口。

### 单人模式
- 每局 **4 次**猜测机会。

### 多人模式
- 两名玩家对抗，目标角色相同，**先猜中者赢得该局**。
- **三局两胜**，每局限时 **1 分 30 秒**。
- 可以看到双方的猜测记录；对手的猜测所有信息以 `*` 打码，仅显示每项底部的颜色。
- 支持 **创建房间 / 随机匹配 / 加入房间** 三种匹配方式。
- 整场获胜 **+30 分**，整场落败 **-30 分**。

### 排行榜
- 按玩家总分降序展示「玩家ID + 得分」。

### 玩家 ID
- 每个设备自动生成唯一玩家 ID（可自行修改），不同设备不能重名。

## 📁 项目结构

```
├── app.py              # Flask 后端主程序+单人主要路由
├── core.py             # 调用
├── multi.py            # 多人主要路由
├── auth_routes.py      # 验证码生成、账号相关
├── dbfixer.py          # 简便的数据库修改工具（独立文件，需要重新配置数据库连接地址等等）
├── config.py           # 数据库连接配置
├── database_init.sql   # 数据库初始化脚本（角色表 + 玩家表）
├── requirements.txt    # Python 依赖
├── static/app.js       # 前端逻辑
├── static/style.css    # 前端样式
└── templates/index.html # 前端页面
```

## 🚀 快速开始

### 1. 初始化数据库

确保 MySQL 已启动，然后执行 `database_init.sql`。
> 该脚本会创建 `characters`（角色）和 `players`（玩家得分）两张表，并写入示例角色。
> 若已运行过旧脚本，需重新执行一次以创建 `players` 表。

**Windows (PowerShell)：**
```powershell
cmd /c "mysql -uroot -p --default-character-set=utf8mb4 < database_init.sql"
```

**Linux/Mac：**
```bash
mysql -uroot -p --default-character-set=utf8mb4 < database_init.sql
```



### 2. 配置数据库连接

打开 `config.py`，修改为你本地的 MySQL 账号密码：

```python
DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': '你的密码',   # ← 改成你的 MySQL 密码
    'database': 'phrolova_game',
    'charset': 'utf8mb4',
}
```

### 3. 安装依赖

```bash
pip install -r requirements.txt
```

### 4. 启动服务

```bash
python app.py
```

浏览器访问：**http://127.0.0.1:5000**

> 💡 多人模式需要两个设备（或两个浏览器）同时访问并连接同一个后端才能对战。

## 🔧 添加/修改角色数据

可在数据库 `characters` 表中增删改角色：

| 字段 | 类型 | 说明 |
|------|------|------|
| name | VARCHAR | 姓名 |
| attribute | VARCHAR | 属性 |
| star_rating | TINYINT | 星级 |
| weapon | VARCHAR | 武器 |
| birthplace | VARCHAR | 出生地 |
| version | DOUBLE | 实装版本 |

示例：
```sql
INSERT INTO characters (name, attribute, star_rating, weapon, birthplace, version)
VALUES ('角色名', '属性', 5, '武器', '出生地', 1.0);
```
