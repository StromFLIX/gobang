<script setup lang="ts">
import { Eye } from '@lucide/vue'
import { ref } from 'vue'

import { api, type LegalAddress } from '@/services/api'

defineProps<{ country: string }>()

const address = ref<LegalAddress | null>(null)
const loading = ref(false)
const error = ref('')

async function reveal() {
  loading.value = true
  error.value = ''
  try {
    address.value = await api.revealLegalAddress()
  } catch {
    error.value = 'The postal address could not be loaded. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="legal-postal-address">
    <template v-if="address">
      <span>{{ address.street_address }}</span>
      <span>{{ address.postal_city }}</span>
    </template>
    <button
      v-else
      type="button"
      class="button button--quiet legal-postal-address__reveal"
      :disabled="loading"
      @click="reveal"
    >
      <Eye :size="17" />
      {{ loading ? 'Loading address...' : 'Reveal postal address' }}
    </button>
    <span v-if="country">{{ country }}</span>
    <span v-if="error" class="legal-postal-address__error" role="alert">{{ error }}</span>
  </div>
</template>

<style scoped>
.legal-postal-address {
  display: grid;
  justify-items: start;
  gap: 0.25rem;
}

.legal-postal-address__reveal {
  margin: 0.25rem 0;
}

.legal-postal-address__error {
  color: var(--color-red);
}
</style>
