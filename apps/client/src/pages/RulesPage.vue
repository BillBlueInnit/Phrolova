<script setup lang="ts">
import { useRouter } from "vue-router";
const router = useRouter();
</script>

<template>
  <div id="rules-screen" class="screen active">
    <button class="rules-back-btn" @click="router.push('/')">
      <span class="arrow">&lt;</span> BACK
    </button>

    <div class="accordion">
      <div class="rules-card">
        <div class="rules-card-bg bg-1"></div>
        <div class="rules-card-content">
          <div class="rules-card-icon"></div>
          <div class="rules-card-title-cn">单人演算</div>
          <div class="rules-card-title-en">Single Player</div>
          <div class="rules-card-detail">
            <div class="rules-card-section">
              <h4>共鸣者模式</h4>
              <p>每题 4 次猜测机会。比较字段：属性（Attribute）、星级（Rarity）、武器类型（Weapon）、出生地（Birthplace）、实装版本（Version）。</p>
              <div class="rules-feedback">
                <span class="rules-fb rules-fb-match">绿色</span>完全匹配
                <span class="rules-fb rules-fb-near">橙色</span>部分匹配
                <span class="rules-fb rules-fb-diff">灰色</span>不匹配
              </div>
            </div>
            <div class="rules-card-section">
              <h4>声骸模式</h4>
              <p>每题 8 次猜测机会。分为简单与困难两种难度。</p>
              <ul>
                <li><strong>简单</strong>：仅反馈属性（Attribute）与 COST 值，结果使用分组色彩标记。</li>
                <li><strong>困难</strong>：反馈技能属性、所属套装、掉落位置三类信息，每种反馈以独立颜色区分。</li>
              </ul>
            </div>
            <div class="rules-card-section">
              <h4>反馈说明</h4>
              <p>绿色表示字段完全匹配；橙色表示相近或同组；灰色表示完全不同。请根据每次反馈缩小搜索范围。</p>
            </div>
          </div>
        </div>
      </div>

      <div class="rules-card">
        <div class="rules-card-bg bg-2"></div>
        <div class="rules-card-content">
          <div class="rules-card-icon"></div>
          <div class="rules-card-title-cn">多人对战</div>
          <div class="rules-card-title-en">Multiplayer Room</div>
          <div class="rules-card-detail">
            <div class="rules-card-section">
              <h4>创建房间</h4>
              <p>房主选择题型（共鸣者 / 声骸）与赛制（BO1 / BO3 / BO5），生成房间码后邀请对手加入。</p>
            </div>
            <div class="rules-card-section">
              <h4>加入房间</h4>
              <p>输入房间码即可加入已有房间。双方就绪后房主启动对局。</p>
            </div>
            <div class="rules-card-section">
              <h4>随机匹配</h4>
              <p>系统自动匹配在线玩家，固定采用 BO3 赛制。匹配成功即进入房间。</p>
            </div>
            <div class="rules-card-section">
              <h4>对局流程</h4>
              <p>每回合双方同时对同一目标进行猜测，回合结束后查看双方反馈。猜对即赢下当前回合；BO3 先赢 2 回合获胜，BO5 先赢 3 回合获胜。</p>
            </div>
          </div>
        </div>
      </div>

      <div class="rules-card">
        <div class="rules-card-bg bg-3"></div>
        <div class="rules-card-content">
          <div class="rules-card-icon"></div>
          <div class="rules-card-title-cn">积分结算</div>
          <div class="rules-card-title-en">Score System</div>
          <div class="rules-card-detail">
            <div class="rules-card-section">
              <h4>共鸣者积分</h4>
              <table class="rules-score-table">
                <tr><td>BO1</td><td>±10</td></tr>
                <tr><td>BO3</td><td>±30</td></tr>
                <tr><td>BO5</td><td>±50</td></tr>
              </table>
            </div>
            <div class="rules-card-section">
              <h4>声骸 · 简单</h4>
              <table class="rules-score-table">
                <tr><td>BO1</td><td>±5</td></tr>
                <tr><td>BO3</td><td>±10</td></tr>
                <tr><td>BO5</td><td>±15</td></tr>
              </table>
            </div>
            <div class="rules-card-section">
              <h4>声骸 · 困难</h4>
              <table class="rules-score-table">
                <tr><td>BO1</td><td>±30</td></tr>
                <tr><td>BO3</td><td>±50</td></tr>
                <tr><td>BO5</td><td>±70</td></tr>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="rules-card">
        <div class="rules-card-bg bg-4"></div>
        <div class="rules-card-content">
          <div class="rules-card-icon"></div>
          <div class="rules-card-title-cn">对局判定</div>
          <div class="rules-card-title-en">Match Rules</div>
          <div class="rules-card-detail">
            <div class="rules-card-section">
              <h4>隐私保护</h4>
              <p>多人模式中对手的具体名称以 *** 替代，但各字段颜色反馈完整保留，不影响策略判断。</p>
            </div>
            <div class="rules-card-section">
              <h4>逃逸判定</h4>
              <p>主动退出对战视为逃逸，对方直接赢得整场，并按照对应模式全额结算积分。逃逸者积分按对应模式扣减。</p>
            </div>
            <div class="rules-card-section">
              <h4>房间断线</h4>
              <p>异常断线后有 60 秒重连窗口，超时未恢复则按逃逸处理。返回首页后可使用"恢复房间"功能续接。</p>
            </div>
            <div class="rules-card-section">
              <h4>平局处理</h4>
              <p>BO1 中若双方均未在限制次数内猜对，判定平局，双方积分不变。BO3 / BO5 允许单回合平局，继续下一回合。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

