<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

import NativeAuthGate from '@/components/NativeAuthGate.vue'
import { initializePushNotifications } from '@/composables/usePushNotifications'
import { useSession } from '@/composables/useSession'
import { isNativeApp } from '@/logic/platform'

const router = useRouter()
const route = useRoute()
const { player, ready, bootstrapSession } = useSession()
const isPublicRoute = computed(() => route.meta.public === true)

void router.isReady().then(() => {
  if (!isPublicRoute.value) void bootstrapSession()
})

watch(isPublicRoute, (publicRoute) => {
  if (!publicRoute) void bootstrapSession()
})

watch(
  player,
  (currentPlayer) => {
    if (isNativeApp && currentPlayer && !currentPlayer.is_guest) {
      void initializePushNotifications(router)
    }
  },
  { immediate: true },
)
</script>

<template>
  <RouterView v-if="isPublicRoute || !isNativeApp || (ready && player && !player.is_guest)" />
  <NativeAuthGate v-else-if="ready" />
  <main v-else class="native-session-loading" aria-label="Loading Gobang">
    <span class="presence-dot presence-dot--pulse" />
  </main>
</template>

<style scoped>
.native-session-loading {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  background: var(--color-background);
}
</style>
