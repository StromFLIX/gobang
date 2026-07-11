<script setup lang="ts">
import { Send } from '@lucide/vue'

import ComicReaction from '@/components/ComicReaction.vue'
import type { GameReaction, ReactionKind } from '@/types/game'

withDefaults(
  defineProps<{
    disabled: boolean
    incoming: GameReaction | null
    incomingName: string
    incomingMine?: boolean
  }>(),
  { incomingMine: false },
)

defineEmits<{ send: [kind: ReactionKind] }>()

const reactions: { kind: ReactionKind; label: string }[] = [
  { kind: 'wow', label: 'Wow' },
  { kind: 'plus_one', label: '+1' },
  { kind: 'poop', label: 'Poop' },
  { kind: 'mind_blown', label: 'Mind blown' },
  { kind: 'facepalm', label: 'Facepalm' },
  { kind: 'heart', label: 'Heart' },
  { kind: 'gg', label: 'Good game' },
]
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
      <ComicReaction :kind="incoming.kind" :data-reaction="incoming.kind" />
      <small>{{ incomingMine ? 'Sent by you' : `${incomingName} sent` }}</small>
    </div>

    <span class="reaction-bar__label"><Send :size="13" /> Send a reaction</span>

    <button
      v-for="reaction in reactions"
      :key="reaction.kind"
      type="button"
      :class="['reaction-button', `reaction-button--${reaction.kind.replace('_', '-')}`]"
      :disabled="disabled"
      :title="`Send ${reaction.label}`"
      :aria-label="`Send ${reaction.label}`"
      @click="$emit('send', reaction.kind)"
    >
      <ComicReaction :kind="reaction.kind" :animated="false" />
    </button>
  </div>
</template>

<style scoped>
.reaction-bar {
  position: relative;
  display: grid;
  width: 100%;
  min-height: 4.5rem;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.35rem;
  align-items: center;
  margin-top: 0.55rem;
  padding: 0.3rem;
  overflow: visible;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 5px 18px rgba(24, 42, 31, 0.08);
}

.reaction-bar__label {
  display: inline-flex;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding-top: 0.15rem;
  color: var(--color-text-muted);
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
}

.reaction-button {
  --reaction-button-bg: #f1f5f2;
  --reaction-button-hover: #e7eee9;

  display: grid;
  width: 100%;
  min-width: 0;
  height: 2.9rem;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(23, 34, 28, 0.16);
  border-radius: 6px;
  background: var(--reaction-button-bg);
  box-shadow: 0 1px 0 rgba(23, 34, 28, 0.12);
  font-family: inherit;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;
}

.reaction-button--wow {
  --reaction-button-bg: #fff4c7;
  --reaction-button-hover: #ffe997;
}

.reaction-button--plus-one {
  --reaction-button-bg: #def4fa;
  --reaction-button-hover: #c4eaf4;
}

.reaction-button--poop {
  --reaction-button-bg: #f3e2d5;
  --reaction-button-hover: #e9cfbd;
}

.reaction-button--mind-blown {
  --reaction-button-bg: #ffe0d6;
  --reaction-button-hover: #ffc9b8;
}

.reaction-button--facepalm {
  --reaction-button-bg: #f5e6dc;
  --reaction-button-hover: #ead1c2;
}

.reaction-button--heart {
  --reaction-button-bg: #ffe3e8;
  --reaction-button-hover: #ffcbd5;
}

.reaction-button--gg {
  --reaction-button-bg: #e1f2e7;
  --reaction-button-hover: #c9e7d4;
}

.reaction-button .comic-reaction {
  width: 2.65rem;
  height: 2.65rem;
}

.reaction-button:hover:not(:disabled),
.reaction-button:focus-visible {
  border-color: rgba(23, 34, 28, 0.34);
  background: var(--reaction-button-hover);
  box-shadow: 0 3px 8px rgba(23, 34, 28, 0.14);
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
  min-width: 7rem;
  justify-items: center;
  padding: 0.75rem 1rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 8px;
  background: rgba(29, 37, 32, 0.92);
  box-shadow: 0 10px 30px rgba(17, 27, 21, 0.25);
  pointer-events: none;
  animation: reaction-rise 2.6s ease-out both;
}

.reaction-popup .comic-reaction {
  width: 5.25rem;
  height: 5.25rem;
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

@media (max-width: 430px) {
  .reaction-bar {
    min-height: 4.25rem;
    gap: 0.2rem;
    margin-top: 0.35rem;
    padding: 0.25rem;
  }

  .reaction-bar__label {
    padding-top: 0.05rem;
    font-size: 0.6rem;
  }

  .reaction-button {
    height: 2.8rem;
  }

  .reaction-button .comic-reaction {
    width: 2.4rem;
    height: 2.4rem;
  }
}

@media (max-width: 339px) {
  .reaction-bar {
    gap: 0.15rem;
  }

  .reaction-button {
    height: 2.65rem;
  }

  .reaction-button .comic-reaction {
    width: 2.15rem;
    height: 2.15rem;
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
