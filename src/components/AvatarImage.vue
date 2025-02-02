<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { createAvatar } from '@dicebear/core'
import { openPeeps } from '@dicebear/collection'

const { seed = 'player4', color = "black" } = defineProps<{ seed?: string, color?: ("white" | "black") }>()

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
  <div :class="`bg-blue-400 w-12 h-12 inline-block size-6 rounded-full ring-2 ring-${color}`" v-html="avatarSVG"></div>
</template>
