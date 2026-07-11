import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, top: 80, behavior: 'smooth' }
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: {
        title: 'Gobang Online | Five in a Row Multiplayer',
        description:
          'Play Gobang online, a Gomoku-style strategy game with five-in-a-row wins and pair captures. Invite friends, find ranked opponents, and track Elo.',
      },
    },
    {
      path: '/game/:inviteCode',
      name: 'game',
      component: () => import('../views/GameView.vue'),
      meta: { title: 'Private Gobang Match', noIndex: true },
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('../views/AccountView.vue'),
      meta: { title: 'Gobang Account', noIndex: true },
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('../views/PrivacyView.vue'),
      meta: { public: true, noIndex: true, title: 'Gobang Privacy Policy' },
    },
    {
      path: '/impressum',
      name: 'impressum',
      component: () => import('../views/ImprintView.vue'),
      meta: { public: true, noIndex: true, title: 'Gobang Legal Notice' },
    },
    {
      path: '/account-deletion',
      name: 'account-deletion',
      component: () => import('../views/AccountDeletionView.vue'),
      meta: { public: true, noIndex: true, title: 'Delete a Gobang Account' },
    },
    {
      path: '/verify-email',
      name: 'verify-email',
      component: () => import('../views/EmailVerificationView.vue'),
      meta: { public: true, noIndex: true, title: 'Verify Gobang Email' },
    },
  ],
})

const CHUNK_RELOAD_KEY = 'gobang.chunk-reload'

router.onError((error, to) => {
  const chunkLoadFailed = /dynamically imported module|module script failed/i.test(error.message)
  if (!chunkLoadFailed || sessionStorage.getItem(CHUNK_RELOAD_KEY) === to.fullPath) return
  sessionStorage.setItem(CHUNK_RELOAD_KEY, to.fullPath)
  window.location.assign(to.fullPath)
})

router.afterEach((route) => {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  document.title = String(route.meta.title ?? 'Gobang')

  const description = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (description) {
    description.content = String(
      route.meta.description
        ?? 'Play Gobang online, a Gomoku-style strategy game with private and ranked matches.',
    )
  }
})

export default router
