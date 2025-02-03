<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { createAvatar } from '@dicebear/core'
import { openPeeps } from '@dicebear/collection'

const { seed = 'player4', color = "black", borderSize = "small" } = defineProps<{ seed?: string, color?: ("white" | "black"), borderSize?: ("small" | "large") }>()

// Create a reactive variable to hold the generated avatar SVG
const avatarSVG = ref('')

onMounted(() => {
  // Create an avatar using openPeeps
  const avatar = createAvatar(openPeeps, {
    seed: seed, // change this seed for different avatars
    // ... add more options as needed
    radius: 50,
  })
  // Convert the avatar to an SVG string
  avatarSVG.value = avatar.toString()
})
</script>

<template>
  <div :class="[
      'bg-blue-400 w-6 h-6 sm:h-10 sm:w-10 inline-block size-6 rounded-full',
      borderSize === 'small' ? 'border-2' : 'border-3',
      color === 'white' ? 'border-white' : 'border-black'
    ]" v-html="avatarSVG"></div>
</template>
