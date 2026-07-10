<script setup lang="ts">
import { Check, X } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AvatarImage from '@/components/AvatarImage.vue'
import type { Player, Stone } from '@/types/game'

const props = defineProps<{
  board: (Stone | null)[]
  turn: Stone
  blackPlayer: Player | null
  whitePlayer: Player | null
  disabled: boolean
  revision: number
  lastMove: number | null
}>()

const emit = defineEmits<{
  move: [position: number]
}>()

const selected = ref<number | null>(null)
const hovered = ref<number | null>(null)
const coarsePointer = ref(navigator.maxTouchPoints > 0)
let pointerQuery: MediaQueryList | null = null

const currentPlayer = computed(() =>
  props.turn === 'black' ? props.blackPlayer : props.whitePlayer,
)
const starPoints = new Set([48, 52, 56, 108, 112, 116, 168, 172, 176])

function syncPointerMode(event?: MediaQueryListEvent) {
  coarsePointer.value =
    navigator.maxTouchPoints > 0 || (event?.matches ?? pointerQuery?.matches ?? false)
}

onMounted(() => {
  pointerQuery = window.matchMedia('(pointer: coarse)')
  syncPointerMode()
  pointerQuery.addEventListener('change', syncPointerMode)
})

onBeforeUnmount(() => pointerQuery?.removeEventListener('change', syncPointerMode))
watch(
  () => props.revision,
  () => {
    selected.value = null
    hovered.value = null
  },
)

function choose(position: number) {
  if (props.disabled || props.board[position] !== null) return
  if (coarsePointer.value) {
    selected.value = position
    return
  }
  emit('move', position)
}

function confirmMove() {
  if (selected.value === null || props.disabled) return
  emit('move', selected.value)
}

function playerFor(stone: Stone): Player | null {
  return stone === 'black' ? props.blackPlayer : props.whitePlayer
}

function cellLabel(cell: Stone | null, index: number) {
  const row = Math.floor(index / 15) + 1
  const column = (index % 15) + 1
  return cell ? `${cell} stone, row ${row}, column ${column}` : `Row ${row}, column ${column}`
}
</script>

<template>
  <div class="board-control">
    <div
      :class="['gobang-board', { 'gobang-board--disabled': disabled }]"
      role="grid"
      aria-label="Gobang board"
    >
      <button
        v-for="(cell, index) in board"
        :key="index"
        type="button"
        :class="[
          'board-point',
          {
            'board-point--last': lastMove === index,
            'board-point--selected': selected === index,
          },
        ]"
        role="gridcell"
        :aria-label="cellLabel(cell, index)"
        :disabled="disabled || cell !== null"
        @click="choose(index)"
        @mouseenter="hovered = index"
        @mouseleave="hovered = null"
      >
        <span v-if="starPoints.has(index)" class="star-point" />
        <span v-if="cell" class="stone">
          <AvatarImage
            :seed="playerFor(cell)?.avatar_seed ?? cell"
            :color="cell"
            size="stone"
          />
        </span>
        <span
          v-else-if="
            currentPlayer && (selected === index || (!coarsePointer && hovered === index))
          "
          class="stone stone--preview"
        >
          <AvatarImage :seed="currentPlayer.avatar_seed" :color="turn" size="stone" />
        </span>
      </button>
    </div>

    <div v-if="coarsePointer" class="move-confirm" aria-live="polite">
      <span class="move-confirm__label">
        {{ selected === null ? 'Select an intersection' : `Row ${Math.floor(selected / 15) + 1}, column ${(selected % 15) + 1}` }}
      </span>
      <button
        type="button"
        class="icon-button icon-button--muted"
        :disabled="selected === null"
        title="Cancel move"
        aria-label="Cancel selected move"
        @click="selected = null"
      >
        <X :size="19" />
      </button>
      <button
        type="button"
        class="icon-button icon-button--confirm"
        :disabled="selected === null || disabled"
        title="Confirm move"
        aria-label="Confirm selected move"
        @click="confirmMove"
      >
        <Check :size="20" :stroke-width="2.5" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.board-control {
  width: 100%;
}

.gobang-board {
  display: grid;
  width: 100%;
  aspect-ratio: 1;
  grid-template-columns: repeat(15, minmax(0, 1fr));
  grid-template-rows: repeat(15, minmax(0, 1fr));
  overflow: hidden;
  padding: clamp(0.6rem, 2.4vw, 1.25rem);
  border: 1px solid #9d7538;
  border-radius: 6px;
  background: #e3b65f;
  box-shadow:
    0 16px 38px rgba(53, 47, 33, 0.18),
    inset 0 0 0 3px rgba(255, 255, 255, 0.2);
  transition: filter 160ms ease;
  touch-action: manipulation;
}

.gobang-board--disabled {
  filter: saturate(0.82);
}

.board-point {
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  cursor: pointer;
}

.board-point::before,
.board-point::after {
  position: absolute;
  z-index: 0;
  content: '';
  background: rgba(42, 48, 41, 0.72);
  pointer-events: none;
}

.board-point:not(:nth-child(15n))::before {
  top: calc(50% - 0.5px);
  left: 50%;
  width: 100%;
  height: 1px;
}

.board-point:nth-child(-n + 210)::after {
  top: 50%;
  left: calc(50% - 0.5px);
  width: 1px;
  height: 100%;
}

.board-point:focus-visible {
  z-index: 4;
  outline: 2px solid #fff;
  outline-offset: -2px;
}

.board-point:disabled {
  cursor: default;
}

.star-point {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  width: clamp(3px, 0.75vw, 6px);
  height: clamp(3px, 0.75vw, 6px);
  border-radius: 50%;
  background: #344238;
  transform: translate(-50%, -50%);
}

.stone {
  position: absolute;
  z-index: 2;
  inset: 8%;
}

.stone--preview {
  opacity: 0.58;
}

.board-point--last .stone::after {
  position: absolute;
  inset: 38%;
  border: 1.5px solid #f2bd3f;
  border-radius: 50%;
  content: '';
}

.board-point--selected::after {
  z-index: 1;
  width: 70%;
  height: 70%;
  border: 2px solid #fff;
  border-radius: 50%;
  background: transparent;
  transform: translate(-14%, -14%);
}

.move-confirm {
  display: grid;
  min-height: 3.25rem;
  grid-template-columns: 1fr 2.75rem 2.75rem;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.6rem;
}

.move-confirm__label {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (hover: hover) {
  .board-point:not(:disabled):hover .star-point {
    opacity: 0;
  }
}
</style>
