<script setup lang="ts">
import { useRouter } from "vue-router";
const router = useRouter();
</script>

<template>
  <div id="rules-screen" class="screen active">
    <button class="back-btn" @click="router.push('/')">
      <span class="arrow">&lt;</span> BACK
    </button>

    <div class="accordion">
      <div class="card">
        <div class="card-bg bg-1"></div>
        <div class="card-content">
          <div class="card-icon"></div>
          <div class="card-title-cn">单人演算</div>
          <div class="card-title-en">Single Player</div>
          <div class="card-detail">
            <div class="card-section">
              <h4>共鸣者模式</h4>
              <p>每题 4 次猜测机会。比较字段：属性（Attribute）、星级（Rarity）、武器类型（Weapon）、出生地（Birthplace）、实装版本（Version）。</p>
              <div class="card-feedback">
                <span class="fb fb-match">绿色</span>完全匹配
                <span class="fb fb-near">橙色</span>部分匹配
                <span class="fb fb-diff">灰色</span>不匹配
              </div>
            </div>
            <div class="card-section">
              <h4>声骸模式</h4>
              <p>每题 8 次猜测机会。分为简单与困难两种难度。</p>
              <ul>
                <li><strong>简单</strong>：仅反馈属性（Attribute）与 COST 值，结果使用分组色彩标记。</li>
                <li><strong>困难</strong>：反馈技能属性、所属套装、掉落位置三类信息，每种反馈以独立颜色区分。</li>
              </ul>
            </div>
            <div class="card-section">
              <h4>反馈说明</h4>
              <p>绿色表示字段完全匹配；橙色表示相近或同组；灰色表示完全不同。请根据每次反馈缩小搜索范围。</p>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-bg bg-2"></div>
        <div class="card-content">
          <div class="card-icon"></div>
          <div class="card-title-cn">多人对战</div>
          <div class="card-title-en">Multiplayer Room</div>
          <div class="card-detail">
            <div class="card-section">
              <h4>创建房间</h4>
              <p>房主选择题型（共鸣者 / 声骸）与赛制（BO1 / BO3 / BO5），生成房间码后邀请对手加入。</p>
            </div>
            <div class="card-section">
              <h4>加入房间</h4>
              <p>输入房间码即可加入已有房间。双方就绪后房主启动对局。</p>
            </div>
            <div class="card-section">
              <h4>随机匹配</h4>
              <p>系统自动匹配在线玩家，固定采用 BO3 赛制。匹配成功即进入房间。</p>
            </div>
            <div class="card-section">
              <h4>对局流程</h4>
              <p>每回合双方同时对同一目标进行猜测，回合结束后查看双方反馈。猜对即赢下当前回合；BO3 先赢 2 回合获胜，BO5 先赢 3 回合获胜。</p>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-bg bg-3"></div>
        <div class="card-content">
          <div class="card-icon"></div>
          <div class="card-title-cn">积分结算</div>
          <div class="card-title-en">Score System</div>
          <div class="card-detail">
            <div class="card-section">
              <h4>共鸣者积分</h4>
              <table class="score-table">
                <tr><td>BO1</td><td>±10</td></tr>
                <tr><td>BO3</td><td>±30</td></tr>
                <tr><td>BO5</td><td>±50</td></tr>
              </table>
            </div>
            <div class="card-section">
              <h4>声骸 · 简单</h4>
              <table class="score-table">
                <tr><td>BO1</td><td>±5</td></tr>
                <tr><td>BO3</td><td>±10</td></tr>
                <tr><td>BO5</td><td>±15</td></tr>
              </table>
            </div>
            <div class="card-section">
              <h4>声骸 · 困难</h4>
              <table class="score-table">
                <tr><td>BO1</td><td>±30</td></tr>
                <tr><td>BO3</td><td>±50</td></tr>
                <tr><td>BO5</td><td>±70</td></tr>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-bg bg-4"></div>
        <div class="card-content">
          <div class="card-icon"></div>
          <div class="card-title-cn">对局判定</div>
          <div class="card-title-en">Match Rules</div>
          <div class="card-detail">
            <div class="card-section">
              <h4>隐私保护</h4>
              <p>多人模式中对手的具体名称以 *** 替代，但各字段颜色反馈完整保留，不影响策略判断。</p>
            </div>
            <div class="card-section">
              <h4>逃逸判定</h4>
              <p>主动退出对战视为逃逸，对方直接赢得整场，并按照对应模式全额结算积分。逃逸者积分按对应模式扣减。</p>
            </div>
            <div class="card-section">
              <h4>房间断线</h4>
              <p>异常断线后有 60 秒重连窗口，超时未恢复则按逃逸处理。返回首页后可使用"恢复房间"功能续接。</p>
            </div>
            <div class="card-section">
              <h4>平局处理</h4>
              <p>BO1 中若双方均未在限制次数内猜对，判定平局，双方积分不变。BO3 / BO5 允许单回合平局，继续下一回合。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
#rules-screen {
  display: flex;
  background-color: var(--shell-bg-deep);
  height: calc(100vh - var(--site-header-height) - 6.25rem);
  width: 100%;
  position: relative;
  border: 1px solid var(--line-soft);
  overflow: hidden;
}

.back-btn {
  position: absolute;
  top: 24px;
  left: 24px;
  z-index: 50;
  background: var(--shell-bg-deep);
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  color: var(--text-main);
  font-family: 'Rajdhani', sans-serif;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0.4rem 0.8rem;
  letter-spacing: 1px;
  transition: all 0.3s ease;
  backdrop-filter: blur(4px);
}

.back-btn:hover {
  color: var(--gold);
  border-color: var(--gold);
}

.back-btn .arrow { font-size: 1.2rem; }

.accordion {
  display: flex;
  width: 100%;
  height: 100%;
}

.card {
  flex: 1;
  position: relative;
  overflow: hidden;
  border-right: 1px solid var(--line-strong);
  cursor: pointer;
  background: var(--surface-panel);
  transition: flex 0.6s cubic-bezier(0.25, 1, 0.2, 1);
}

.card:last-child { border-right: none; }

.card:hover { flex: 3; }

.card-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.45;
  transition: transform 0.8s ease, opacity 0.8s ease;
}

.bg-1 { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpath d='M0 40 L80 40 M40 0 L40 80' stroke='%23d4a843' stroke-width='0.5' opacity='0.3'/%3E%3Ccircle cx='40' cy='40' r='3' fill='%23d4a843' opacity='0.4'/%3E%3Ccircle cx='0' cy='0' r='2' fill='%23d4a843' opacity='0.3'/%3E%3Ccircle cx='80' cy='80' r='2' fill='%23d4a843' opacity='0.3'/%3E%3C/svg%3E"); }
.bg-2 { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cpath d='M0 30 L60 30 M30 0 L30 60' stroke='%23b0b8c0' stroke-width='0.5' opacity='0.25'/%3E%3Cpath d='M15 0 L30 15 L45 0 L60 15 L60 45 L45 60 L30 45 L15 60 L0 45 L0 15 Z' fill='none' stroke='%23c4946c' stroke-width='0.5' opacity='0.3' transform='translate(15,15)'/%3E%3C/svg%3E"); }
.bg-3 { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Ccircle cx='50' cy='50' r='30' fill='none' stroke='%23d4a843' stroke-width='0.4' opacity='0.3'/%3E%3Ccircle cx='50' cy='50' r='15' fill='none' stroke='%23d4a843' stroke-width='0.6' opacity='0.4'/%3E%3Ccircle cx='50' cy='50' r='3' fill='%23d4a843' opacity='0.5'/%3E%3Ccircle cx='0' cy='0' r='20' fill='none' stroke='%23b0b8c0' stroke-width='0.4' opacity='0.2'/%3E%3Ccircle cx='100' cy='100' r='20' fill='none' stroke='%23b0b8c0' stroke-width='0.4' opacity='0.2'/%3E%3C/svg%3E"); }
.bg-4 { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='70' height='70'%3E%3Cpath d='M0 0 L70 70 M70 0 L0 70' stroke='%23c4946c' stroke-width='0.5' opacity='0.25'/%3E%3Crect x='32' y='32' width='6' height='6' fill='%23d4a843' opacity='0.4' transform='rotate(45 35 35)'/%3E%3C/svg%3E"); }

.card:hover .card-bg {
  transform: scale(1.05);
  opacity: 0.75;
}

.card-content {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 50px 36px 24px;
  background: linear-gradient(to top, var(--surface-panel) 0%, color-mix(in oklab, var(--surface-panel) 70%, transparent) 55%, transparent 100%);
  transform: translateY(calc(100% - 180px));
  transition: transform 0.6s cubic-bezier(0.25, 1, 0.2, 1);
}

.card:hover .card-content { transform: translateY(0); }

.card-icon {
  display: inline-block;
  width: 18px; height: 18px;
  border: 2px solid var(--text-faint);
  transform: rotate(45deg);
  margin-bottom: 20px;
  transition: all 0.4s ease;
}

.card:hover .card-icon {
  border-color: var(--gold);
  box-shadow: 0 0 10px rgba(212, 168, 67, 0.4);
}

.card-title-cn {
  font-size: clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem);
  font-weight: 900;
  letter-spacing: 0.12em;
  margin-bottom: 4px;
  white-space: nowrap;
  color: var(--text-main);
}

.card-title-en {
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.92rem;
  color: var(--text-sub);
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 32px;
  white-space: nowrap;
}

.card-detail {
  opacity: 0;
  transform: translateY(16px);
  transition: all 0.4s ease 0.15s;
  max-width: 520px;
}

.card:hover .card-detail {
  opacity: 1;
  transform: translateY(0);
}

.card-section { margin-bottom: 0.9rem; }
.card-section h4 { margin: 0 0 0.3rem; font-size: 0.84rem; font-weight: 700; color: var(--gold); letter-spacing: 0.12em; text-transform: uppercase; font-family: 'Rajdhani', sans-serif; }
.card-section p { margin: 0; color: var(--text-sub); font-size: 0.86rem; line-height: 1.75; }
.card-section ul { margin: 0.2rem 0 0; padding-left: 1rem; color: var(--text-sub); font-size: 0.84rem; line-height: 1.75; }
.card-section li { margin-bottom: 0.18rem; }
.card-section li strong { color: var(--text-main); font-weight: 600; }

.card-feedback { display: flex; gap: 0.8rem; flex-wrap: wrap; margin-top: 0.35rem; font-size: 0.8rem; color: var(--text-sub); }
.fb { padding: 0.1rem 0.4rem; border-radius: 3px; font-weight: 600; font-size: 0.76rem; }
.fb-match { background: color-mix(in oklab, var(--color-success) 16%, transparent); color: var(--color-success); }
.fb-near { background: color-mix(in oklab, var(--color-warning) 16%, transparent); color: var(--color-warning); }
.fb-diff { background: color-mix(in oklab, var(--text-main) 6%, transparent); color: var(--text-faint); }

.score-table { width: 100%; max-width: 180px; border-collapse: collapse; margin-top: 0.2rem; }
.score-table td { padding: 0.2rem 0; font-size: 0.82rem; color: var(--text-sub); border-bottom: 1px solid var(--line-soft); }
.score-table td:last-child { text-align: right; font-weight: 700; color: var(--gold); }

@media (max-width: 960px) {
  .accordion { flex-direction: column; }
  .card { border-right: none; border-bottom: 1px solid var(--line-strong); }
  .card:last-child { border-bottom: none; }
  .card-content { transform: translateY(0); padding: 18px 28px; }
  .card-detail { display: none; }
  .card:hover .card-detail { display: block; }
}
</style>
