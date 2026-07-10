import { onBeforeUnmount, ref } from 'vue'

import { api } from '@/services/api'
import type { PresenceStats } from '@/types/game'

const HEARTBEAT_INTERVAL_MS = 20_000

export function usePresence(gameId: () => string | null = () => null) {
  const stats = ref<PresenceStats | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null

  async function heartbeat() {
    try {
      stats.value = await api.heartbeat(gameId())
    } catch {
      // Presence is intentionally best-effort and must not block play.
    }
  }

  function startPresence() {
    if (timer) return
    void heartbeat()
    timer = setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS)
  }

  function stopPresence() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  onBeforeUnmount(stopPresence)

  return { stats, heartbeat, startPresence, stopPresence }
}