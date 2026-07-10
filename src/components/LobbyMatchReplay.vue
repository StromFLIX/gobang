<script setup lang="ts">
import { Crown } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AvatarImage from '@/components/AvatarImage.vue'
import type { Stone } from '@/types/game'

interface ReplayMove {
  position: number
  stone: Stone
  captured?: number[]
}

type ReplayPhase = 'forward' | 'hold' | 'rewind' | 'restart'

const BOARD_SIZE = 15
const FORWARD_DELAY = 650
const RESULT_HOLD_DELAY = 4_800
const REWIND_DELAY = 110
const RESTART_DELAY = 450
const cells = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, position) => position)
const capturePair = [10 * BOARD_SIZE + 5, 10 * BOARD_SIZE + 6]
const moves: ReplayMove[] = [
  { position: 10 * BOARD_SIZE + 4, stone: 'black' },
  { position: capturePair[0], stone: 'white' },
  { position: 7 * BOARD_SIZE + 4, stone: 'black' },
  { position: capturePair[1], stone: 'white' },
  { position: 10 * BOARD_SIZE + 7, stone: 'black', captured: capturePair },
  { position: 6 * BOARD_SIZE + 4, stone: 'white' },
  { position: 7 * BOARD_SIZE + 5, stone: 'black' },
  { position: 6 * BOARD_SIZE + 5, stone: 'white' },
  { position: 7 * BOARD_SIZE + 6, stone: 'black' },
  { position: 8 * BOARD_SIZE + 6, stone: 'white' },
  { position: 7 * BOARD_SIZE + 7, stone: 'black' },
  { position: 8 * BOARD_SIZE + 7, stone: 'white' },
  { position: 7 * BOARD_SIZE + 8, stone: 'black' },
]

const visibleMoves = ref(1)
const replayPhase = ref<ReplayPhase>('forward')
let replayTimer: ReturnType<typeof setTimeout> | null = null

const stones = computed(() => {
  const board = new Map<number, Stone>()
  for (const move of moves.slice(0, visibleMoves.value)) {
    board.set(move.position, move.stone)
    for (const captured of move.captured ?? []) board.delete(captured)
  }
  return board
})
const lastMove = computed(() => moves[Math.min(visibleMoves.value, moves.length) - 1])
const lastPosition = computed(() => lastMove.value?.position ?? -1)
const currentCapture = computed(() =>
  replayPhase.value === 'forward' ? (lastMove.value?.captured ?? []) : [],
)
const complete = computed(() => replayPhase.value === 'hold')
const replayStatus = computed(() => {
  if (complete.value) return 'Mina wins — five in a row'
  if (replayPhase.value === 'rewind') return 'Rewinding the match'
  if (replayPhase.value === 'restart') return 'Replay restarting'
  if (currentCapture.value.length) return 'Mina captures Felix’s pair'
  return `Move ${visibleMoves.value} of ${moves.length}`
})

onMounted(() => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    visibleMoves.value = moves.length
    replayPhase.value = 'hold'
    return
  }
  scheduleReplay(FORWARD_DELAY)
})

onBeforeUnmount(() => {
  if (replayTimer) clearTimeout(replayTimer)
})

function scheduleReplay(delay: number) {
  replayTimer = setTimeout(advanceReplay, delay)
}

function advanceReplay() {
  if (replayPhase.value === 'forward') {
    visibleMoves.value += 1
    if (visibleMoves.value === moves.length) {
      replayPhase.value = 'hold'
      scheduleReplay(RESULT_HOLD_DELAY)
      return
    }
    scheduleReplay(FORWARD_DELAY)
    return
  }

  if (replayPhase.value === 'hold') {
    replayPhase.value = 'rewind'
    visibleMoves.value -= 1
    scheduleReplay(REWIND_DELAY)
    return
  }

  if (replayPhase.value === 'rewind') {
    visibleMoves.value -= 1
    if (visibleMoves.value === 0) {
      replayPhase.value = 'restart'
      scheduleReplay(RESTART_DELAY)
      return
    }
    scheduleReplay(REWIND_DELAY)
    return
  }

  replayPhase.value = 'forward'
  visibleMoves.value = 1
  scheduleReplay(FORWARD_DELAY)
}
</script>

<template>
  <figure class="match-replay" aria-label="Replay of a Gobang match">
    <div class="match-replay__players">
      <span :class="{ 'match-replay__player--displaced': complete }">
        <AvatarImage seed="lobby-mina" color="black" size="small" />
        <strong>Mina</strong>
        Black
      </span>
      <span>
        White
        <strong>Felix</strong>
        <AvatarImage seed="lobby-felix" color="white" size="small" />
      </span>
    </div>

    <div
      class="match-replay__board"
      :class="{ 'match-replay__board--rewinding': replayPhase === 'rewind' }"
      role="img"
      :aria-label="replayStatus"
    >
      <Transition name="replay-winner">
        <div v-if="complete" class="match-replay__winner">
          <Crown class="match-replay__crown" :size="34" aria-label="Winner" />
          <strong>Mina</strong>
          <span>wins</span>
        </div>
      </Transition>
      <Transition name="replay-line">
        <i v-if="complete" class="match-replay__winning-line" aria-hidden="true" />
      </Transition>
      <span v-for="position in cells" :key="position" class="match-replay__point">
        <i
          v-if="currentCapture.includes(position)"
          class="match-replay__capture"
          aria-hidden="true"
        />
        <Transition name="replay-stone">
          <i
            v-if="stones.get(position)"
            :key="`${position}-${stones.get(position)}`"
            :data-position="position"
            :class="[
              'match-replay__stone',
              `match-replay__stone--${stones.get(position)}`,
              { 'match-replay__stone--last': position === lastPosition },
            ]"
          />
        </Transition>
      </span>
    </div>

    <figcaption>
      <span class="match-replay__live"><i /> Match replay</span>
      <strong>{{ replayStatus }}</strong>
    </figcaption>
  </figure>
</template>

<style scoped>
.match-replay {
  width: min(100%, 34rem);
  margin: 0;
}

.match-replay__players,
.match-replay figcaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.match-replay__players {
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.68rem;
  text-transform: uppercase;
}

.match-replay__players > span {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--color-text-muted);
  font-weight: 700;
  transition: opacity 280ms ease;
}

.match-replay__players > .match-replay__player--displaced {
  opacity: 0;
}

.match-replay__players strong {
  color: var(--color-text);
  font-size: 0.82rem;
  text-transform: none;
}

.match-replay__crown {
  color: #b47a08;
  filter: drop-shadow(0 2px 2px rgba(103, 70, 5, 0.2));
  animation: replay-crown-in 600ms cubic-bezier(0.2, 1.5, 0.5, 1) both;
}

@keyframes replay-crown-in {
  from { transform: translateY(0.5rem) rotate(-18deg) scale(0.35); opacity: 0; }
  65% { transform: translateY(-0.15rem) rotate(8deg) scale(1.12); }
  to { transform: translateY(0) rotate(0) scale(1); opacity: 1; }
}

.match-replay__board {
  position: relative;
  display: grid;
  aspect-ratio: 1;
  grid-template-columns: repeat(15, 1fr);
  grid-template-rows: repeat(15, 1fr);
  overflow: hidden;
  padding: 5.5%;
  border: 1px solid #9d761e;
  background: #e4b757;
  box-shadow: 0 18px 45px rgba(52, 42, 20, 0.16);
}

.match-replay__winner {
  position: absolute;
  z-index: 5;
  top: 22%;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: #17231c;
  filter: drop-shadow(0 2px 0 rgba(255, 255, 255, 0.45));
  transform: translate(-50%, -50%);
  white-space: nowrap;
}

.match-replay__winner strong {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 2.8rem;
  line-height: 0.9;
}

.match-replay__winner span {
  align-self: flex-end;
  margin-bottom: 0.16rem;
  font-size: 0.82rem;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.replay-winner-enter-active {
  transition: opacity 360ms ease, transform 520ms cubic-bezier(0.2, 1.35, 0.5, 1);
}

.replay-winner-leave-active {
  transition: opacity 240ms ease, transform 320ms ease-in;
}

.replay-winner-enter-from {
  opacity: 0;
  transform: translate(-50%, -20%) scale(0.68);
}

.replay-winner-leave-to {
  opacity: 0;
  transform: translate(-145%, -330%) scale(0.35);
}

.match-replay__winning-line {
  position: absolute;
  z-index: 4;
  top: calc(50% - 2px);
  left: 30%;
  width: 28%;
  height: 4px;
  border-radius: 2px;
  background: #c53c30;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
  transform-origin: left center;
  animation: replay-winning-line 700ms 180ms ease-out both;
}

@keyframes replay-winning-line {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

.replay-line-leave-active {
  transition: opacity 180ms ease;
}

.replay-line-leave-to {
  opacity: 0;
}

.match-replay__point {
  position: relative;
  display: grid;
  place-items: center;
}

.match-replay__point::before,
.match-replay__point::after {
  position: absolute;
  content: '';
  background: rgba(31, 38, 33, 0.66);
}

.match-replay__point::before {
  width: 110%;
  height: 1px;
}

.match-replay__point::after {
  width: 1px;
  height: 110%;
}

.match-replay__stone {
  z-index: 1;
  width: 72%;
  aspect-ratio: 1;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(23, 28, 25, 0.3);
  animation: replay-stone-in 180ms ease-out both;
}

.replay-stone-leave-active {
  transition: opacity 180ms ease-in, transform 180ms ease-in;
}

.match-replay__board--rewinding .match-replay__stone {
  animation-duration: 100ms;
}

.match-replay__board--rewinding .replay-stone-leave-active {
  transition-duration: 100ms;
}

.replay-stone-leave-to {
  opacity: 0;
  transform: scale(0.2);
}

.match-replay__stone--black {
  border: 1px solid #111713;
  background: #1d2520;
}

.match-replay__stone--white {
  border: 1px solid #899189;
  background: #fff;
}

.match-replay__stone--last {
  outline: 2px solid #c53c30;
  outline-offset: 2px;
}

.match-replay__capture {
  z-index: 2;
  width: 82%;
  aspect-ratio: 1;
  border: 2px solid #c53c30;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
  animation: replay-capture 650ms ease-out both;
}

@keyframes replay-capture {
  from { transform: scale(0.5); opacity: 1; }
  to { transform: scale(1.65); opacity: 0; }
}

@keyframes replay-stone-in {
  from { transform: scale(0.5); opacity: 0; }
}

.match-replay figcaption {
  min-height: 2.8rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.72rem;
}

.match-replay figcaption strong {
  color: var(--color-text);
}

.match-replay__live {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 800;
  text-transform: uppercase;
}

.match-replay__live i {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-green);
}

@media (prefers-reduced-motion: reduce) {
  .match-replay__stone {
    animation: none;
  }

  .match-replay__crown,
  .match-replay__capture,
  .match-replay__winning-line {
    animation: none;
  }

  .replay-winner-enter-active,
  .replay-winner-leave-active,
  .replay-line-leave-active,
  .replay-stone-leave-active {
    transition: none;
  }
}
</style>