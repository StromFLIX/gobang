import { App } from '@capacitor/app'
import type { Router } from 'vue-router'

import { isNativeApp } from '@/logic/platform'

const APP_LINK_HOST = 'gobang.stromflix.com'

export function appPathFromUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== APP_LINK_HOST) return null
    if (url.pathname === '/oauth-complete') return '/account?mode=login'
    return /^\/game\/[^/]+$/.test(url.pathname) ? url.pathname : null
  } catch {
    return null
  }
}

export async function initializeAppLinks(router: Router) {
  if (!isNativeApp) return

  const open = async (url: string) => {
    const path = appPathFromUrl(url)
    if (path && router.currentRoute.value.path !== path) await router.push(path)
  }

  await App.addListener('appUrlOpen', ({ url }) => open(url))
  const launch = await App.getLaunchUrl()
  if (launch?.url) await open(launch.url)
}
