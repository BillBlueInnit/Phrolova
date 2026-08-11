<script setup lang="ts">
import { useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import { useI18n } from "vue-i18n";

const router = useRouter();
const { t } = useI18n();

// 共鸣者猜谜演示：目标「维里奈」(无音,5,长刀)，4 轮猜测
const resonatorDemo = {
  target: "维里奈",
  rounds: [
    { n: 1, name: "炽霞",    attribute: { v: "热熔", r: "diff" },  stars: { v: 4, r: "diff" }, weapon: { v: "佩枪", r: "diff" } },
    { n: 2, name: "今汐",    attribute: { v: "衍射", r: "diff" },  stars: { v: 5, r: "match" }, weapon: { v: "长刀", r: "match" } },
    { n: 3, name: "卡提希娅", attribute: { v: "无音", r: "match" }, stars: { v: 5, r: "match" }, weapon: { v: "佩枪", r: "diff" } },
    { n: 4, name: "维里奈",  attribute: { v: "无音", r: "match" }, stars: { v: 5, r: "match" }, weapon: { v: "长刀", r: "match" }, win: true },
  ],
};

// 声骸 COST 分组示例
const costGroups = [
  { cost: "3C", group: "A", members: ["轻波·巡水", "朔雷·鸣雷"] },
  { cost: "4C", group: "A", members: ["无声·咏叹", "熔山·裂空"] },
  { cost: "4C", group: "B", members: ["逆月·裁春", "残响·死回"] },
  { cost: "5C", group: "B", members: ["无冠者", "辉辉·终天"] },
];

// BO3 流程示例
const bo3Rounds = [
  { n: "R1", p1: "共鸣者·炽霞", p2: "***", winner: "P1" },
  { n: "R2", p1: "共鸣者·今汐", p2: "***", winner: "P2" },
  { n: "R3", p1: "共鸣者·维里奈", p2: "***", winner: "P1" },
];

function fbClass(r: string) {
  return r === "match" ? "rules-fb--match" : r === "near" ? "rules-fb--near" : "rules-fb--diff";
}
</script>

<template>
  <div class="rules-page">
    <header class="rules-top">
      <button class="back-btn" @click="router.push('/')">
        <Icon icon="ph:arrow-left-duotone" /> {{ t("leaderboard.back") }}
      </button>
      <h1 class="page-title">{{ t("rules.pageTitle") }}</h1>
      <div class="rules-top-right" />
    </header>

    <section class="page-heading">
      <p class="page-kicker">{{ t("rules.pageKicker") }}</p>
      <p class="page-desc">{{ t("rules.pageDesc") }}</p>
    </section>

    <div class="rules-grid">
      <!-- ═══════════ 单人演算 ═══════════ -->
      <section class="rules-section">
        <header class="rules-section-head">
          <div class="rules-section-icon"><Icon icon="ph:user-duotone" /></div>
          <div>
            <h2>{{ t("rules.soloTitle") }}</h2>
            <span class="rules-section-en">{{ t("rules.soloEn") }}</span>
          </div>
        </header>

        <div class="rules-block">
          <h3>{{ t("rules.resonatorDemoTitle") }}</h3>
          <p>{{ t("rules.resonatorDemoTargetPrefix") }}<strong class="rules-emph">「{{ resonatorDemo.target }}」</strong>{{ t("rules.resonatorDemoTargetDesc") }}</p>

          <div class="demo-table-wrap">
            <table class="demo-table">
              <thead>
                <tr>
                  <th>{{ t("rules.colIdx") }}</th>
                  <th>{{ t("rules.colGuess") }}</th>
                  <th>{{ t("rules.colAttribute") }}</th>
                  <th>{{ t("rules.colStar") }}</th>
                  <th>{{ t("rules.colWeapon") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in resonatorDemo.rounds" :key="i" :class="{ 'demo-win': r.win }">
                  <td class="demo-idx">{{ r.n }}</td>
                  <td class="demo-name">{{ r.name }}{{ r.win ? ' ✓' : '' }}</td>
                  <td><span class="rules-fb" :class="fbClass(r.attribute.r)">{{ r.attribute.v }}</span></td>
                  <td><span class="rules-fb" :class="fbClass(r.stars.r)">{{ r.stars.v }}★</span></td>
                  <td><span class="rules-fb" :class="fbClass(r.weapon.r)">{{ r.weapon.v }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="rules-feedback">
            <span class="rules-fb rules-fb--match">{{ t("rules.fbMatch") }}</span>
            <span class="rules-fb rules-fb--near">{{ t("rules.fbNear") }}</span>
            <span class="rules-fb rules-fb--diff">{{ t("rules.fbDiff") }}</span>
          </div>
        </div>

        <div class="rules-block">
          <h3>{{ t("rules.skeletonEasyTitle") }}</h3>
          <p>{{ t("rules.skeletonEasyDesc") }}</p>
          <div class="demo-cost-list">
            <div v-for="(g, i) in costGroups" :key="i" class="demo-cost-row" :class="`demo-cost-${g.group}`">
              <span class="demo-cost-label">{{ g.cost }} · {{ g.group }}</span>
              <span class="demo-cost-names">{{ g.members.join(' / ') }}</span>
            </div>
          </div>
        </div>

        <div class="rules-block">
          <h3>{{ t("rules.skeletonHardTitle") }}</h3>
          <p>{{ t("rules.skeletonHardDesc") }}</p>
        </div>

        <div class="rules-block">
          <h3>{{ t("rules.winJudgeTitle") }}</h3>
          <p>{{ t("rules.winJudgeDesc") }}</p>
        </div>
      </section>

      <!-- ═══════════ 多人对战 ═══════════ -->
      <section class="rules-section">
        <header class="rules-section-head">
          <div class="rules-section-icon"><Icon icon="ph:users-three-duotone" /></div>
          <div>
            <h2>{{ t("rules.multiTitle") }}</h2>
            <span class="rules-section-en">{{ t("rules.multiEn") }}</span>
          </div>
        </header>

        <div class="rules-block">
          <h3>{{ t("rules.bo3Title") }}</h3>
          <p>{{ t("rules.bo3DescPrefix") }}<strong class="rules-emph">{{ t("rules.bo3DescHidden") }}</strong>{{ t("rules.bo3DescSuffix") }}</p>

          <div class="demo-table-wrap">
            <table class="demo-table demo-table-compact">
              <thead>
                <tr>
                  <th>{{ t("rules.colRound") }}</th>
                  <th>{{ t("rules.colP1") }}</th>
                  <th>{{ t("rules.colP2") }}</th>
                  <th>{{ t("rules.colWinner") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in bo3Rounds" :key="i">
                  <td class="demo-idx">{{ r.n }}</td>
                  <td class="demo-name">{{ r.p1 }}</td>
                  <td class="demo-name demo-masked">{{ r.p2 }}</td>
                  <td><span class="demo-winner-badge" :class="r.winner === 'P1' ? 'demo-winner-me' : 'demo-winner-opp'">{{ r.winner }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="demo-hint"><em>{{ t("rules.bo3Hint") }}</em></p>
        </div>

        <div class="rules-block">
          <h3>{{ t("rules.createRoomTitle") }}</h3>
          <p>{{ t("rules.createRoomDesc") }}</p>
        </div>
        <div class="rules-block">
          <h3>{{ t("rules.joinRoomTitle") }}</h3>
          <p>{{ t("rules.joinRoomDesc") }}</p>
        </div>
        <div class="rules-block">
          <h3>{{ t("rules.randomMatchTitle") }}</h3>
          <p>{{ t("rules.randomMatchDesc") }}</p>
        </div>
      </section>

      <!-- ═══════════ 积分结算 ═══════════ -->
      <section class="rules-section">
        <header class="rules-section-head">
          <div class="rules-section-icon"><Icon icon="ph:trophy-duotone" /></div>
          <div>
            <h2>{{ t("rules.scoringTitle") }}</h2>
            <span class="rules-section-en">{{ t("rules.scoringEn") }}</span>
          </div>
        </header>

        <div class="rules-block">
          <h3>{{ t("rules.scoringResonatorTitle") }}</h3>
          <table class="rules-score-table">
            <tr><td>BO1</td><td>±10</td></tr>
            <tr><td>BO3</td><td>±30</td></tr>
            <tr><td>BO5</td><td>±50</td></tr>
          </table>
        </div>
        <div class="rules-block">
          <h3>{{ t("rules.scoringSkeletonEasyTitle") }}</h3>
          <table class="rules-score-table">
            <tr><td>BO1</td><td>±5</td></tr>
            <tr><td>BO3</td><td>±10</td></tr>
            <tr><td>BO5</td><td>±15</td></tr>
          </table>
        </div>
        <div class="rules-block">
          <h3>{{ t("rules.scoringSkeletonHardTitle") }}</h3>
          <table class="rules-score-table">
            <tr><td>BO1</td><td>±30</td></tr>
            <tr><td>BO3</td><td>±50</td></tr>
            <tr><td>BO5</td><td>±70</td></tr>
          </table>
        </div>

        <div class="rules-block rules-block-example">
          <h3>{{ t("rules.scoringExampleTitle") }}</h3>
          <p>{{ t("rules.scoringExampleDesc") }}</p>
          <div class="demo-settle">
            <div class="demo-settle-row"><span>{{ t("rules.settleMode") }}</span><span class="demo-settle-val">{{ t("rules.settleModeVal") }}</span></div>
            <div class="demo-settle-row"><span>{{ t("rules.settleResult") }}</span><span class="demo-settle-val demo-win">{{ t("rules.settleResultWin") }}</span></div>
            <div class="demo-settle-row"><span>{{ t("rules.settleScoreChange") }}</span><span class="demo-settle-val demo-plus">+30</span></div>
          </div>
        </div>
      </section>

      <!-- ═══════════ 对局判定 ═══════════ -->
      <section class="rules-section">
        <header class="rules-section-head">
          <div class="rules-section-icon"><Icon icon="ph:gavel-duotone" /></div>
          <div>
            <h2>{{ t("rules.matchRulesTitle") }}</h2>
            <span class="rules-section-en">{{ t("rules.matchRulesEn") }}</span>
          </div>
        </header>

        <div class="rules-block">
          <h3>{{ t("rules.forfeitTitle") }}</h3>
          <p>{{ t("rules.forfeitDesc") }}</p>
        </div>
        <div class="rules-block">
          <h3>{{ t("rules.reconnectTitle") }}</h3>
          <p>{{ t("rules.reconnectDesc") }}</p>
        </div>
        <div class="rules-block">
          <h3>{{ t("rules.drawTitle") }}</h3>
          <p>{{ t("rules.drawDesc") }}</p>
        </div>
        <div class="rules-block">
          <h3>{{ t("rules.scoreProtectTitle") }}</h3>
          <p>{{ t("rules.scoreProtectDesc") }}</p>
        </div>
      </section>
    </div>
  </div>
</template>
