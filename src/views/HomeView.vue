<script setup lang="ts">
import GridComponent from '@/components/GridComponent.vue'
import VersusFooter from '@/components/VersusFooter.vue'
</script>

<template>
  <div class="mx-auto min-w-screen">
    <div class="flex flex-col min-h-screen">
      <!-- Main area: center the grid -->
      <main class="flex-grow flex justify-center items-center">
        <GridComponent />
      </main>
      <!-- Footer area -->
      <div class="flex-col flex-grow flex justify-center items-center">
        <div class="flex-grow"></div>
        <VersusFooter />
      </div>
    </div>
  </div>
</template>
