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
      ' w-5 h-5 sm:h-8 sm:w-8 inline-block size-6 rounded-full',
      color === 'white' ? 'bg-blue-400' : 'bg-red-400'
    ]" v-html="avatarSVG"></div>
</template>
