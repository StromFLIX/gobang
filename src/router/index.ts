import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/game/:inviteCode',
      name: 'game',
      component: () => import('../views/GameView.vue'),
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('../views/PrivacyView.vue'),
      meta: { public: true },
    },
    {
      path: '/account-deletion',
      name: 'account-deletion',
      component: () => import('../views/AccountDeletionView.vue'),
      meta: { public: true },
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

router.afterEach(() => sessionStorage.removeItem(CHUNK_RELOAD_KEY))

export default router
