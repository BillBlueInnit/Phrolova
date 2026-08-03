import { createRouter, createWebHistory } from "vue-router";

const HomePage = () => import("@/pages/HomePage.vue");
const AuthPage = () => import("@/pages/AuthPage.vue");
const PreGamePage = () => import("@/pages/PreGamePage.vue");
const SingleGamePage = () => import("@/pages/SingleGamePage.vue");
const MultiplayerLobbyPage = () => import("@/pages/MultiplayerLobbyPage.vue");
const MultiplayerRoomPage = () => import("@/pages/MultiplayerRoomPage.vue");
const LeaderboardPage = () => import("@/pages/LeaderboardPage.vue");
const RulesPage = () => import("@/pages/RulesPage.vue");

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomePage },
    { path: "/auth", name: "auth", component: AuthPage },
    { path: "/single", name: "single", component: PreGamePage },
    { path: "/single/play", name: "single-play", component: SingleGamePage },
    { path: "/multi", name: "multi-lobby", component: MultiplayerLobbyPage },
    { path: "/multi/room", name: "multi-room", component: MultiplayerRoomPage },
    { path: "/leaderboard", name: "leaderboard", component: LeaderboardPage },
    { path: "/rules", name: "rules", component: RulesPage },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

export default router;
