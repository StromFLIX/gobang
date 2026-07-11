import { Capacitor } from '@capacitor/core'

export const isNativeApp = Capacitor.isNativePlatform()

const configuredBackendUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export function backendUrl(path: string) {
  return `${configuredBackendUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export function hasConfiguredBackend() {
  return !isNativeApp || Boolean(configuredBackendUrl)
}

export function publicAppUrl(
  path: string,
  native = isNativeApp,
  nativeOrigin = configuredBackendUrl,
) {
  const origin = native ? nativeOrigin : window.location.origin
  if (!origin) throw new Error('The public app URL is not configured')
  return new URL(path.startsWith('/') ? path : `/${path}`, `${origin}/`).toString()
}
