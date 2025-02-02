<script setup lang="ts">
import { ref, computed } from 'vue'
import { validate } from '@/logic/game'
import { resourceLimits } from 'worker_threads'

// Create a board state with 225 cells (15x15), initially all empty (null)
const board = ref<(null | 'black' | 'white')[]>(Array(15 * 15).fill(null))
const moves = new Array<number>(0)

// To track which cell is currently hovered (if any)
const hoveredIndex = ref<number | null>(null)

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
  }
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
      <p class="text-center text-gray-100 text-sm">Next move: {{ nextMove }}</p>
    </div>
    <div class="grid grid-cols-[repeat(15,1fr)] grid-rows-[repeat(15,1fr)] gap-1.5 p-2 border-2 rounded-xl">
      <!-- Iterate over each board cell -->
      <div v-for="(cell, index) in board" :key="index" class="relative h-4 w-4 sm:w-8 sm:h-8 cursor-pointer select-none"
        @click="handleCellClick(index)" @mouseenter="handleMouseEnter(index)" @mouseleave="handleMouseLeave(index)">
        <!-- If the cell is empty, show the cross -->
        <div v-if="cell === null">
          <!-- The cross is drawn via CSS using pseudo-elements -->
          <div class="cell-cross absolute inset-0"></div>
          <!-- On hover over an empty cell, show a preview stone -->
          <div v-if="hoveredIndex === index" :class="[
            'absolute inset-0 m-auto rounded-full h-4 w-4 sm:w-8 sm:h-8 z-10 opacity-85',
            nextMove === 'black' ? 'bg-black border border-gray-700' : 'bg-white border border-gray-300'
          ]"></div>
        </div>
        <!-- If a stone has been placed in the cell, display it -->
        <div v-else>
          <div class="cell-cross absolute inset-0"></div>
          <div :class="[
            'absolute inset-0 m-auto rounded-full h-4 w-4 sm:w-8 sm:h-8 z-10',
            cell === 'black' ? 'bg-black border border-gray-700' : 'bg-white border border-gray-300'
          ]"></div>
        </div>
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
