import { Capacitor } from '@capacitor/core'

export const isNativeApp = Capacitor.isNativePlatform()

const configuredBackendUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export function backendUrl(path: string) {
  return `${configuredBackendUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export function hasConfiguredBackend() {
  return !isNativeApp || Boolean(configuredBackendUrl)
}
