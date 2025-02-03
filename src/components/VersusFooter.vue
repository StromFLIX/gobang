<template>
  <div class="w-xs sm:w-xl p-4 mx-auto flex justify-between items-center border border-b-0 rounded-t-xl">
    <!-- First player info -->
    <div class="flex flex-wrap-reverse items-center">
      <AvatarImage :seed="players[0]" />
      <div class="px-3">
        <p class=" font-bold">{{players[0]}}</p>
      </div>
    </div>
    <span class="px-4 font-bold">vs</span>
    <div class="flex items-center">
      <div class="flex flex-wrap items-center">
        <div class="px-3 text-right">
          <p class="font-bold font-">{{players[1]}}</p>
        </div>
        <AvatarImage :seed="players[1]" color="white" />
      </div>
      <!-- Share invite button -->
    </div>
  </div>
</template>

<script setup lang="ts">
import AvatarImage from '@/components/AvatarImage.vue'
const { players = ['player1', 'player2'] } = defineProps<{ players?: string[],}>()
const shareInvite = () => {
  // Add your invite sharing logic here
  alert('Invite shared!');
}
</script>
