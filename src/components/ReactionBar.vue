<script setup lang="ts">
import facepalmAsset from '@twemoji/svg/1f926.svg?url'
import heartAsset from '@twemoji/svg/2764.svg?url'
import mindBlownAsset from '@twemoji/svg/1f92f.svg?url'
import plusOneAsset from '@twemoji/svg/1f44d.svg?url'
import poopAsset from '@twemoji/svg/1f4a9.svg?url'
import wowAsset from '@twemoji/svg/1f62e.svg?url'

import type { GameReaction, ReactionKind } from '@/types/game'

defineProps<{
  disabled: boolean
  incoming: GameReaction | null
  incomingName: string
}>()

defineEmits<{ send: [kind: ReactionKind] }>()

const reactions: { kind: ReactionKind; asset: string; label: string }[] = [
  { kind: 'wow', asset: wowAsset, label: 'Wow' },
  { kind: 'plus_one', asset: plusOneAsset, label: '+1' },
  { kind: 'poop', asset: poopAsset, label: 'Shit' },
  { kind: 'mind_blown', asset: mindBlownAsset, label: 'Mind blown' },
  { kind: 'facepalm', asset: facepalmAsset, label: 'Facepalm' },
  { kind: 'heart', asset: heartAsset, label: 'Heart' },
  { kind: 'gg', asset: '', label: 'Good game' },
]

function assetFor(kind: ReactionKind) {
  return reactions.find((reaction) => reaction.kind === kind)?.asset ?? ''
}
</script>

<template>
  <div class="reaction-bar" aria-label="Quick reactions">
    <div
      v-if="incoming"
      :key="incoming.nonce"
      class="reaction-popup"
      role="status"
      :aria-label="`${incomingName} reacted ${incoming.kind}`"
    >
      <img
        v-if="assetFor(incoming.kind)"
        :src="assetFor(incoming.kind)"
        :data-reaction="incoming.kind"
        alt=""
      />
      <strong v-else>GG</strong>
      <small>{{ incomingName }}</small>
    </div>

    <button
      v-for="reaction in reactions"
      :key="reaction.kind"
      type="button"
      class="reaction-button"
      :disabled="disabled"
      :title="`Send ${reaction.label}`"
      :aria-label="`Send ${reaction.label}`"
      @click="$emit('send', reaction.kind)"
    >
      <img v-if="reaction.asset" :src="reaction.asset" alt="" />
      <span v-else>GG</span>
    </button>
  </div>
</template>

<style scoped>
.reaction-bar {
  position: relative;
  display: flex;
  width: fit-content;
  max-width: 100%;
  min-height: 2.8rem;
  gap: 0.3rem;
  align-items: center;
  justify-content: center;
  margin: 0.55rem auto 0;
  padding: 0.25rem;
  overflow: visible;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 5px 18px rgba(24, 42, 31, 0.08);
}

.reaction-button {
  display: grid;
  width: 2.35rem;
  height: 2.25rem;
  flex: 0 0 2.35rem;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-family: inherit;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.reaction-button:last-child {
  color: var(--color-green-dark);
  font-size: 0.72rem;
  font-weight: 900;
}

.reaction-button img {
  width: 1.35rem;
  height: 1.35rem;
}

.reaction-button:hover:not(:disabled),
.reaction-button:focus-visible {
  background: var(--color-surface-muted);
  transform: translateY(-1px);
}

.reaction-button:focus-visible {
  outline: 2px solid var(--color-green);
  outline-offset: 1px;
}

.reaction-button:disabled {
  cursor: not-allowed;
  filter: grayscale(0.8);
  opacity: 0.38;
}

.reaction-popup {
  position: absolute;
  z-index: 15;
  bottom: calc(100% + 0.5rem);
  left: 50%;
  display: grid;
  min-width: 5rem;
  justify-items: center;
  padding: 0.65rem 0.85rem 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 8px;
  background: rgba(29, 37, 32, 0.92);
  box-shadow: 0 10px 30px rgba(17, 27, 21, 0.25);
  pointer-events: none;
  animation: reaction-rise 1.8s ease-out both;
}

.reaction-popup strong,
.reaction-popup img {
  width: 2.15rem;
  height: 2.15rem;
}

.reaction-popup strong {
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 0.8rem;
  line-height: 1;
}

.reaction-popup small {
  max-width: 8rem;
  overflow: hidden;
  margin-top: 0.3rem;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.66rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes reaction-rise {
  0% {
    opacity: 0;
    transform: translate(-50%, 0.75rem) scale(0.72);
  }
  14% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1.08);
  }
  25% {
    transform: translate(-50%, 0) scale(1);
  }
  72% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -2.5rem) scale(0.94);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reaction-popup {
    animation-name: reaction-fade;
  }
}

@keyframes reaction-fade {
  0%,
  75% {
    opacity: 1;
    transform: translateX(-50%);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%);
  }
}
</style>