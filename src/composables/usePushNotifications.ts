import { PushNotifications, type Token } from '@capacitor/push-notifications'
import type { Router } from 'vue-router'

import { isNativeApp } from '@/logic/platform'
import { api } from '@/services/api'

const TOKEN_STORAGE_KEY = 'gobang.push-token.v1'
let initialized = false

export async function initializePushNotifications(router: Router) {
  if (!isNativeApp || initialized) return
  initialized = true

  await PushNotifications.createChannel({
    id: 'game_updates',
    name: 'Game updates',
    description: 'Moves, challenges, and rematch requests',
    importance: 5,
    visibility: 1,
    vibration: true,
  })

  await PushNotifications.addListener('registration', registerDevice)
  await PushNotifications.addListener('registrationError', (error) => {
    console.warn('Push registration failed', error)
  })
  await PushNotifications.addListener('pushNotificationActionPerformed', async (event) => {
    const path = event.notification.data.path
    if (typeof path === 'string' && isAppPath(path)) {
      await router.push(path)
    }
  })

  let permission = await PushNotifications.checkPermissions()
  if (permission.receive === 'prompt') {
    permission = await PushNotifications.requestPermissions()
  }
  if (permission.receive === 'granted') {
    await PushNotifications.register()
  } else {
    await removeStoredDeviceRegistration()
    await unregisterNativeTransport()
  }
}

export async function unregisterPushNotifications() {
  if (!isNativeApp) return
  await removeStoredDeviceRegistration()
  await unregisterNativeTransport()
  await PushNotifications.removeAllListeners()
  initialized = false
}

async function unregisterNativeTransport() {
  try {
    await PushNotifications.unregister()
  } catch {
    // The plugin may not have registered on devices where permission was denied.
  }
}

async function removeStoredDeviceRegistration() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY)
  if (token) {
    try {
      await api.unregisterPushDevice(token)
    } catch {
      // Logout should still complete if the device cannot reach the backend.
    }
  }
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

async function registerDevice(token: Token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token.value)
  try {
    await api.registerPushDevice(token.value)
  } catch (error) {
    console.warn('Could not register this device for notifications', error)
  }
}

function isAppPath(path: string) {
  return path === '/' || /^\/game\/[^/?#]+$/.test(path)
}
