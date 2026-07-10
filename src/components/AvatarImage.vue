<script setup lang="ts">
import { computed } from 'vue'
import { createAvatar } from '@dicebear/core'
import { openPeeps } from '@dicebear/collection'

import { decodeAvatar, isCustomAvatar } from '@/logic/avatar'

const props = withDefaults(
  defineProps<{
    seed?: string
    color?: 'black' | 'white' | 'neutral'
    size?: 'small' | 'medium' | 'large' | 'editor' | 'stone'
  }>(),
  { seed: 'player4', color: 'neutral', size: 'medium' },
)

const avatarUrl = computed(() => {
  const options = isCustomAvatar(props.seed)
    ? customAvatarOptions(props.seed)
    : { seed: props.seed, radius: 50 }
  const svg = createAvatar(openPeeps, options)
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.toString())}`
})

function customAvatarOptions(value: string) {
  const config = decodeAvatar(value)
  return {
    seed: 'custom-player',
    radius: 50,
    head: [config.hair],
    face: [config.face],
    accessories: config.accessory === 'none' ? undefined : [config.accessory],
    accessoriesProbability: config.accessory === 'none' ? 0 : 100,
    facialHair: config.facialHair === 'none' ? undefined : [config.facialHair],
    facialHairProbability: config.facialHair === 'none' ? 0 : 100,
    skinColor: [config.skin],
    clothingColor: [config.shirt],
  }
}
</script>

<template>
  <span :class="['avatar', `avatar--${color}`, `avatar--${size}`]" aria-hidden="true">
    <img :src="avatarUrl" alt="" draggable="false" />
  </span>
</template>

<style scoped>
.avatar {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgba(24, 34, 28, 0.16);
  border-radius: 50%;
  background: #e8ece8;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}

.avatar--black {
  border-color: #17221c;
  background: #26352d;
}

.avatar--white {
  border-color: #87928b;
  background: #f9f7ef;
}

.avatar--small {
  width: 1.75rem;
  height: 1.75rem;
}

.avatar--medium {
  width: 2.5rem;
  height: 2.5rem;
}

.avatar--large {
  width: 3.25rem;
  height: 3.25rem;
}

.avatar--editor {
  width: 7.5rem;
  height: 7.5rem;
}

.avatar--stone {
  width: 100%;
  height: 100%;
  box-shadow: 0 2px 5px rgba(23, 34, 28, 0.32);
}
</style>
