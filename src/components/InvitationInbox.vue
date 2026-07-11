<script setup lang="ts">
import { Bell, Check, Swords, X } from '@lucide/vue'
import { computed, ref } from 'vue'

import AvatarImage from '@/components/AvatarImage.vue'
import type { Invitation } from '@/types/game'

const props = defineProps<{
  invitations: Invitation[]
  playerId: string
  loading: boolean
  error: string
  compact?: boolean
}>()

const emit = defineEmits<{
  accept: [invitationId: string]
  dismiss: [invitationId: string]
}>()

const open = ref(false)
const incoming = computed(() =>
  props.invitations.filter((invitation) => invitation.recipient.id === props.playerId),
)
const outgoing = computed(() =>
  props.invitations.filter((invitation) => invitation.challenger.id === props.playerId),
)

function accept(invitationId: string) {
  open.value = false
  emit('accept', invitationId)
}
</script>

<template>
  <div :class="['invitation-inbox', { 'invitation-inbox--compact': compact }]">
    <button
      type="button"
      class="icon-button icon-button--muted invitation-trigger"
      title="Challenges"
      aria-label="Challenges"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Bell :size="18" />
      <span v-if="incoming.length" class="invitation-badge">{{ incoming.length }}</span>
    </button>

    <section v-if="open" class="invitation-popover" aria-label="Challenges">
      <div class="invitation-popover__header">
        <div>
          <span>Challenges</span>
          <strong>{{ incoming.length ? `${incoming.length} waiting` : 'No new invites' }}</strong>
        </div>
        <button type="button" class="icon-button" title="Close" aria-label="Close" @click="open = false">
          <X :size="18" />
        </button>
      </div>

      <p v-if="loading" class="invitation-empty">Loading…</p>
      <p v-else-if="error" class="invitation-empty invitation-empty--error">{{ error }}</p>
      <template v-else>
        <div v-for="invitation in incoming" :key="invitation.id" class="invitation-row">
          <AvatarImage :seed="invitation.challenger.avatar_seed" size="small" />
          <div class="invitation-row__identity">
            <strong>{{ invitation.challenger.display_name }}</strong>
            <span>wants to play</span>
          </div>
          <div class="invitation-row__actions">
            <button
              type="button"
              class="icon-button icon-button--confirm"
              :title="`Accept ${invitation.challenger.display_name}'s challenge`"
              :aria-label="`Accept ${invitation.challenger.display_name}'s challenge`"
              @click="accept(invitation.id)"
            >
              <Check :size="18" />
            </button>
            <button
              type="button"
              class="icon-button icon-button--muted"
              :title="`Dismiss ${invitation.challenger.display_name}'s challenge`"
              :aria-label="`Dismiss ${invitation.challenger.display_name}'s challenge`"
              @click="emit('dismiss', invitation.id)"
            >
              <X :size="18" />
            </button>
          </div>
        </div>

        <div v-for="invitation in outgoing" :key="invitation.id" class="invitation-row">
          <AvatarImage :seed="invitation.recipient.avatar_seed" size="small" />
          <div class="invitation-row__identity">
            <strong>{{ invitation.recipient.display_name }}</strong>
            <span>challenge pending</span>
          </div>
          <button
            type="button"
            class="icon-button icon-button--muted"
            :title="`Cancel challenge to ${invitation.recipient.display_name}`"
            :aria-label="`Cancel challenge to ${invitation.recipient.display_name}`"
            @click="emit('dismiss', invitation.id)"
          >
            <X :size="18" />
          </button>
        </div>

        <p v-if="!incoming.length && !outgoing.length" class="invitation-empty">
          <Swords :size="20" />
          Challenges from the leaderboard appear here.
        </p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.invitation-inbox {
  position: relative;
}

.invitation-trigger {
  position: relative;
}

.invitation-inbox--compact {
  position: absolute;
  z-index: 2;
  top: -0.25rem;
  right: -0.25rem;
}

.invitation-inbox--compact .invitation-trigger {
  width: 1.35rem;
  height: 1.35rem;
  border: 2px solid #fff;
  border-radius: 50%;
  color: #fff;
  background: var(--color-green);
}

.invitation-inbox--compact .invitation-trigger svg {
  width: 0.72rem;
  height: 0.72rem;
}

.invitation-inbox--compact .invitation-badge {
  top: -0.55rem;
  right: -0.55rem;
  animation: invitation-pulse 1.2s ease-in-out infinite;
}

.invitation-inbox--compact .invitation-popover {
  top: calc(100% + 0.8rem);
}

@keyframes invitation-pulse {
  50% { box-shadow: 0 0 0 5px rgba(181, 53, 47, 0.18); }
}

.invitation-badge {
  position: absolute;
  top: -0.28rem;
  right: -0.28rem;
  display: grid;
  min-width: 1.15rem;
  height: 1.15rem;
  place-items: center;
  padding: 0 0.25rem;
  border: 2px solid #fff;
  border-radius: 999px;
  color: #fff;
  background: var(--color-red);
  font-size: 0.62rem;
  font-weight: 800;
}

.invitation-popover {
  position: absolute;
  z-index: 60;
  top: calc(100% + 0.65rem);
  right: 0;
  width: min(22rem, calc(100vw - 1rem));
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: 0 18px 50px rgba(14, 25, 18, 0.22);
}

.invitation-popover__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 0.9rem;
  border-bottom: 1px solid var(--color-border);
}

.invitation-popover__header > div,
.invitation-row__identity {
  display: grid;
}

.invitation-popover__header span,
.invitation-row__identity span {
  color: var(--color-text-muted);
  font-size: 0.7rem;
}

.invitation-popover__header .icon-button {
  width: 2rem;
  height: 2rem;
}

.invitation-row {
  display: grid;
  min-height: 4rem;
  grid-template-columns: 1.75rem minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
  padding: 0.65rem 0.8rem;
  border-bottom: 1px solid var(--color-border);
}

.invitation-row__identity strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invitation-row__actions {
  display: flex;
  gap: 0.35rem;
}

.invitation-row .icon-button {
  width: 2.25rem;
  height: 2.25rem;
}

.invitation-empty {
  display: flex;
  min-height: 6rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  color: var(--color-text-muted);
  text-align: center;
}

.invitation-empty--error {
  color: var(--color-red);
}
</style>