# 更新日志与 Bug 修复记录

按时间倒序排列。每个版本包含新增功能、优化、修复内容；Bug 修复附带现象、根因和解决方案。

## 2026-08-04

### 新增功能

- **自定义主题色系统**：右上角新增主题色选择器，提供 6 种预设色（紫罗兰、流金、青碧、绯红、翠绿、琥珀），切换后背景、面板、文字色调全局联动
- **首页背景增强**：叠加网格纹理 + 流动光斑动画，菜单按钮增加金色填充悬停效果与对角渐变高光
- **数据图鉴扩展**：共鸣者卡片新增武器/出生地/版本字段，声骸卡片新增异相/掉落位置字段，网格宽度扩展到 1100px
- **居中大号比分**：单人猜测页面比分条居中显示，数字使用 Rajdhani 大字号（最大 2.8rem）
- **回合结束弹窗**：单人模式每局结束（答对/用尽/揭晓）弹出对话框展示正确答案
- **自动补全优化**：回车键默认选择第一个匹配项提交
- **多人对局结果独立页面**：新增 `/multi/result` 路由，对局结束后可点击"查看完整对局"在新标签页打开完整猜测过程，支持 sessionStorage 数据传递
- **多人对局弹窗显示正确答案**：对局结束弹窗新增正确答案区块，金色大字号展示最后一局目标名称
- **版本号有序数组比较**：版本号比较改为基于有序数组（1.0~3.5）的相邻判断，替代原来的浮点差比较

### 优化

- 首页菜单图标从 1.7rem 增大到 2.2rem
- 首页菜单容器宽度从 45rem 缩小到 34rem，下划线相应缩短
- 登录卡片改为跟随菜单流动布局，不再固定定位
- 社交链接贴底显示，仅留小缝隙
- 多人对局顶部 4 张信息卡片整合为 1 张，用竖线分隔符隔开
- 多人对局计分板仿照单人模式样式：Rajdhani 大字号、uppercase 标签、横向排列
- 多人对局信息卡片与计分板合并为一张卡片，竖线分隔
- 单人/多人页面整体居中：max-width 1400px + 两侧 clamp(1rem, 4vw, 3rem) 留白
- 首页右上角图标仅在首页显示（`v-if="isHomeRoute"`）

### 移除

- 删除全站所有发光效果（text-shadow / box-shadow / drop-shadow / glow 动画）
- 单人猜测页面移除 StatusBanner 状态卡片
- 多人对局页面移除 StatusBanner 状态卡片（错误/信息/答案横幅）

### Bug 修复

#### 1. 验证码字体在服务器上显示过小

**现象**：本地开发环境验证码正常，部署到 Linux/Docker 后验证码文字只有几像素高。

**根因**：`captcha.py` 的 `_FONT_CANDIDATES` 列表只包含 Windows 和常见 Linux 系统字体路径，在容器内都不存在，PIL 回退到 `ImageFont.load_default()` —— 该函数返回的位图字体忽略 `size` 参数。

**修复**：
- 将 `arialbd.ttf` 复制到 `apps/server/src/phrolova_server/assets/fonts/` 作为打包字体
- `_BUNDLED_FONT` 基于 `Path(__file__)` 定位，确保跨环境可用
- `_load_font` 兜底改为 `load_default(size=size)`（Pillow 12+ 支持）

**文件**：`apps/server/src/phrolova_server/captcha.py`

#### 2. 验证码图片撑大输入框布局

**现象**：验证码图片过大，导致输入框被挤到其他位置。

**修复**：
- 图片尺寸从 220×72 缩小到 160×56
- 前端 `.auth-captcha-box` 改为固定像素尺寸 `width:160px; height:56px`
- 图片使用 `object-fit: contain` 适配，不会溢出

**文件**：`apps/server/src/phrolova_server/captcha.py`、`apps/client/src/pages/HomePage.vue`

#### 3. 登录卡片遮挡菜单按钮

**现象**：登录卡片使用 `position: absolute` 固定在角落，遮挡了左侧菜单按钮无法点击。

**修复**：
- 改为 `position: relative` + `align-self: flex-start` + `margin-top: auto`
- 登录卡片现在与菜单在同一 flex 列中流动，随屏幕变化一起移动

**文件**：`apps/client/src/pages/HomePage.vue`

#### 4. 切换主题色后背景不变

**现象**：选择新主题色后只有高亮元素变色，背景仍是紫色。

**根因**：`applyAccent` 只更新了 `--gold` 和 `--gold-soft`，但 `--shell-bg`、`--surface-panel` 等变量仍固定在 tokens.css 的紫色调。

**修复**：
- 每个主题色预设包含完整 10 个 CSS 变量（暗/亮各一套）
- `applyAccent` 一次性设置全部变量

**文件**：`apps/client/src/App.vue`

#### 5. 多人对局泄露对手信息

**现象**：对局中对手的猜测表显示了版本号和星级，泄露了目标信息。

**修复**：
- `GuessTable` 新增 `hiddenKeys` prop 过滤列
- 对手的表格传入 `:hidden-keys="['version', 'star_rating']"`
- 对局结束后的结果弹窗不隐藏（展示完整信息）

**文件**：`apps/client/src/components/game/GuessTable.vue`、`apps/client/src/pages/MultiplayerRoomPage.vue`

#### 6. 回车提交不选择建议项

**现象**：输入部分字符后直接回车，提交的是未完整的输入而非第一个匹配项。

**修复**：
- Enter 键处理逻辑：`activeIndex < 0` 时默认使用索引 0（第一项）

**文件**：`apps/client/src/components/game/NameAutocompleteInput.vue`

#### 7. 版本号比较在跨大版本时出错

**现象**：1.4 和 2.0 被判定为"不同"，但它们是相邻版本；1.0 和 1.2 被判定为"相近"，但它们不相邻。

**根因**：原逻辑用 `abs(float(target) - float(guess)) <= 0.25` 做浮点差比较，跨大版本时（1.4→2.0 差 0.6）判定错误，同大版本内间隔 2 时（1.0→1.2 差 0.2）误判为相近。

**修复**：
- 定义有序版本数组 `["1.0", "1.1", ..., "3.5"]`
- `_is_adjacent_version()` 判断两版本在数组中索引差是否为 1

**文件**：`apps/server/src/phrolova_server/compare.py`

#### 8. 手机端多人对局信息卡片占满屏幕

**现象**：手机端打开多人对局，顶部信息卡片高度占满整个屏幕，游戏面板被挤到看不见。

**根因**：手机端 grid 模板从 5 行改为 3 行（`auto minmax(0, 1fr) auto`），但有 4 个子元素，信息卡片落入 `1fr` 行占满剩余空间。

**修复**：
- grid 模板改为 `auto auto minmax(0, 1fr) auto`（4 行）
- 信息卡片在手机端纵向堆叠

**文件**：`apps/client/src/pages/MultiplayerRoomPage.vue`

#### 9. 窗口尺寸改变时输入框错位

**现象**：拖动浏览器窗口改变大小时，底部输入框和提交按钮位置错乱。

**根因**：3 个问题叠加：dock 容器 `flex-wrap: wrap` 导致换行；flex 子元素缺少 `min-width: 0` 无法收缩；`.autocomplete-shell` 未参与 flex 分配。

**修复**：
- `.autocomplete-shell` 增加 `min-width: 0` + `flex: 1`
- dock 容器改为 `flex-wrap: nowrap`
- `.sg-input-row` / `.mr-input-row` 及子元素增加 `min-width: 0`

**文件**：`apps/client/src/components/game/NameAutocompleteInput.vue`、`apps/client/src/pages/SingleGamePage.vue`、`apps/client/src/pages/MultiplayerRoomPage.vue`
