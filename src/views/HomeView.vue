<script setup lang="ts">
import GridComponent from '@/components/GridComponent.vue'
import VersusFooter from '@/components/VersusFooter.vue'

const players = [{name: "Flo", seed: "player4"}, {name:"Felix", seed:"player25"}]

function shuffleArray(arr: {name: string, seed: string}[]) {
  // Loop from the end of the array to the beginning
  for (let i = arr.length - 1; i > 0; i--) {
    // Pick a random index from 0 to i
    const j = Math.floor(Math.random() * (i + 1));
    // Swap elements at indices i and j
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const shuffledPlayers = shuffleArray(players)

</script>

<template>
  <div class="mx-auto min-w-screen">
    <div class="flex flex-col min-h-screen">
      <!-- Main area: center the grid -->
      <main class="flex-grow flex justify-center items-center">
        <GridComponent :players="shuffledPlayers"/>
      </main>
      <!-- Footer area -->
      <div class="flex-col flex-grow flex justify-center items-center">
        <div class="flex-grow"></div>
        <VersusFooter :players="shuffledPlayers"/>
      </div>
    </div>
  </div>
</template>
