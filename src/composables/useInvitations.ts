import { computed, ref } from 'vue'

import { api } from '@/services/api'
import { subscribeToInvitations } from '@/services/pocketbase'
import type { Invitation } from '@/types/game'

const invitations = ref<Invitation[]>([])
const loading = ref(false)
const error = ref('')
let unsubscribe: (() => Promise<void>) | null = null
let updateCallback: ((invitation: Invitation) => void | Promise<void>) | null = null

async function refreshInvitations() {
  loading.value = true
  error.value = ''
  try {
    invitations.value = await api.listInvitations()
  } catch {
    invitations.value = []
    error.value = 'Challenges are unavailable.'
  } finally {
    loading.value = false
  }
}

async function startInvitationUpdates(
  onUpdate?: (invitation: Invitation) => void | Promise<void>,
) {
  await stopInvitationUpdates()
  updateCallback = onUpdate ?? null
  await refreshInvitations()
  unsubscribe = await subscribeToInvitations((invitation) => {
    void refreshInvitations().then(() => updateCallback?.(invitation))
  })
}

async function stopInvitationUpdates() {
  await unsubscribe?.()
  unsubscribe = null
  updateCallback = null
  invitations.value = []
  error.value = ''
}

async function sendInvitation(playerId: string) {
  const invitation = await api.sendInvitation(playerId)
  invitations.value = [invitation, ...invitations.value]
  return invitation
}

async function acceptInvitation(invitationId: string) {
  const invitation = await api.acceptInvitation(invitationId)
  invitations.value = invitations.value.filter((item) => item.id !== invitationId)
  return invitation
}

async function dismissInvitation(invitationId: string) {
  await api.dismissInvitation(invitationId)
  invitations.value = invitations.value.filter((item) => item.id !== invitationId)
}

export function useInvitations() {
  return {
    invitations: computed(() => invitations.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    refreshInvitations,
    startInvitationUpdates,
    stopInvitationUpdates,
    sendInvitation,
    acceptInvitation,
    dismissInvitation,
  }
}