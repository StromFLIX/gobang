<script setup lang="ts">
import { ref, computed } from 'vue'
import { validate, checkWin } from '@/logic/game'
import ConfettiExplosion from '@/components/ConfettiExplosion.vue'
import AvatarImage from '@/components/AvatarImage.vue'

const { players = [{name: 'player1', seed: 'player1'}, {name: 'player2', seed: 'player2'},] } = defineProps<{ players?: {name: string, seed: string}[],}>()

// Create a board state with 225 cells (15x15), initially all empty (null)
const board = ref<(null | 'black' | 'white')[]>(Array(15 * 15).fill(null))
const moves = new Array<number>(0)

// To track which cell is currently hovered (if any)
const hoveredIndex = ref<number | null>(null)

const winner = ref<(null | 'black' | 'white')>(null)

// Count how many moves have been played
const moveCount = computed(() => board.value.filter(cell => cell !== null).length)

// Next move color: Black goes first, then white, alternating
const nextMove = computed(() => (moveCount.value % 2 === 0 ? 'white' : 'black'))

// On click: if the cell is empty, place a stone with the next move color.
function handleCellClick(index: number) {
  moves.push(index)
  const { result, state } = validate(moves)
  if (result) {
    board.value = state
  } else {
    moves.pop()
  }
  winner.value = checkWin(state)
}

// On hover: record which cell is being hovered over
function handleMouseEnter(index: number) {
  hoveredIndex.value = index
}

function handleMouseLeave(index: number) {
  if (hoveredIndex.value === index) {
    hoveredIndex.value = null
  }
}
</script>

<template>
  <div>
    
    <div>
      <h1 class="text-3xl font-bold text-center mb-4">Gobang</h1>
      <p class="text-center text-gray-100 text-sm">Next move: {{ nextMove === "white" ? players[1].name : players[0].name}}</p>
    </div>
    <div class="relative">
      <div class="grid grid-cols-[repeat(15,1fr)] grid-rows-[repeat(15,1fr)] gap-1.5 p-2 border-2 rounded-xl">
        <!-- Iterate over each board cell -->
        <div v-for="(cell, index) in board" :key="index"
          class="relative h-6 w-6 sm:w-10 sm:h-10 cursor-pointer select-none" @click="handleCellClick(index)"
          @mouseenter="handleMouseEnter(index)" @mouseleave="handleMouseLeave(index)">
          <!-- If the cell is empty, show the cross -->
          <div v-if="cell === null">
            <!-- The cross is drawn via CSS using pseudo-elements -->
            <div class="cell-cross absolute inset-0"></div>
            <!-- On hover over an empty cell, show a preview stone -->
            <AvatarImage v-if="hoveredIndex === index" :borderSize="'large'" :seed="nextMove === 'black' ? players[0].seed : players[1].seed" :color="nextMove" :class="[
              'absolute inset-0 m-auto rounded-full h-4 w-4 sm:w-8 sm:h-8 z-10'
            ]" />
          </div>
          <!-- If a stone has been placed in the cell, display it -->
          <div v-else>
            <div class="cell-cross absolute inset-0"></div>
            
            <AvatarImage :borderSize="'large'" :seed="cell === 'black' ? players[0].seed : players[1].seed" :color="cell" :class="[
              'absolute inset-0 m-auto rounded-full h-4 w-4 sm:w-8 sm:h-8 z-10'
            ]" />
          </div>
        </div>
      </div>
      <div :class="['absolute flex items-center justify-center rounded-xl inset-0 bg-black z-40 opacity-90', winner === 'black' || winner === 'white' ? '' :
      'hidden' ]">
        <span class="text-5xl font-bold">Winner is {{ nextMove === "white" ? players[0].name : players[1].name}}</span>
        <ConfettiExplosion v-if="winner !== null" :particleCount="200" :force="0.3"  :stageHeight="500" :stageWidth="1000"/>
      </div>
    </div>
  </div>
</template>

<style>
/* This CSS draws the cross in every cell.
   It uses pseudo-elements to create two diagonals. */
.cell-cross {
  position: absolute;
  width: 100%;
  height: 100%;
  z-index: 0;
}

@media (width < 40rem) {
  .cell-cross {
    height: 110%;
  }
}

.cell-cross::before,
.cell-cross::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 125%;
  /* Extra length to reach the corners */
  background-color: #d1d5db;
  /* Tailwind's gray-300 */
  transform-origin: center;
}

.cell-cross::before {
  transform: translate(-50%, -50%) rotate(90deg);
}

.cell-cross::after {
  transform: translate(-50%, -50%);
}
</style>
