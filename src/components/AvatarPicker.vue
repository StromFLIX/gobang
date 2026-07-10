<script setup lang="ts">
import { Check, Shuffle } from '@lucide/vue'
import { computed } from 'vue'

import AvatarImage from '@/components/AvatarImage.vue'
import {
  ACCESSORY_OPTIONS,
  decodeAvatar,
  encodeAvatar,
  FACE_OPTIONS,
  FACIAL_HAIR_OPTIONS,
  HAIR_OPTIONS,
  SHIRT_OPTIONS,
  SKIN_OPTIONS,
  type AvatarConfig,
} from '@/logic/avatar'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [seed: string]
}>()

const config = computed(() => decodeAvatar(props.modelValue))

function updateFeature<Key extends keyof AvatarConfig>(key: Key, event: Event) {
  const next = { ...config.value }
  next[key] = (event.target as HTMLSelectElement).value as AvatarConfig[Key]
  emit('update:modelValue', encodeAvatar(next))
}

function updateColor(key: 'skin' | 'shirt', value: string) {
  emit('update:modelValue', encodeAvatar({ ...config.value, [key]: value } as AvatarConfig))
}

function randomIndex(length: number) {
  return Math.floor(Math.random() * length)
}

function randomize() {
  emit(
    'update:modelValue',
    encodeAvatar({
      hair: HAIR_OPTIONS[randomIndex(HAIR_OPTIONS.length)].value,
      face: FACE_OPTIONS[randomIndex(FACE_OPTIONS.length)].value,
      accessory: ACCESSORY_OPTIONS[randomIndex(ACCESSORY_OPTIONS.length)].value,
      facialHair: FACIAL_HAIR_OPTIONS[randomIndex(FACIAL_HAIR_OPTIONS.length)].value,
      skin: SKIN_OPTIONS[randomIndex(SKIN_OPTIONS.length)].value,
      shirt: SHIRT_OPTIONS[randomIndex(SHIRT_OPTIONS.length)].value,
    }),
  )
}
</script>

<template>
  <div class="character-editor">
    <div class="character-preview">
      <AvatarImage :seed="modelValue" size="editor" />
      <button type="button" class="randomize-button" @click="randomize">
        <Shuffle :size="16" />
        Randomize
      </button>
    </div>

    <div class="feature-grid">
      <label class="feature-field">
        <span>Hair</span>
        <select :value="config.hair" @change="updateFeature('hair', $event)">
          <option v-for="option in HAIR_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="feature-field">
        <span>Expression</span>
        <select :value="config.face" @change="updateFeature('face', $event)">
          <option v-for="option in FACE_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="feature-field">
        <span>Glasses</span>
        <select :value="config.accessory" @change="updateFeature('accessory', $event)">
          <option v-for="option in ACCESSORY_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="feature-field">
        <span>Facial hair</span>
        <select :value="config.facialHair" @change="updateFeature('facialHair', $event)">
          <option v-for="option in FACIAL_HAIR_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <fieldset class="color-field">
        <legend>Skin</legend>
        <div class="swatch-row">
          <button
            v-for="option in SKIN_OPTIONS"
            :key="option.value"
            type="button"
            :class="['color-swatch', { 'color-swatch--selected': config.skin === option.value }]"
            :style="{ backgroundColor: `#${option.value}` }"
            :title="option.label"
            :aria-label="`${option.label} skin`"
            :aria-pressed="config.skin === option.value"
            @click="updateColor('skin', option.value)"
          >
            <Check v-if="config.skin === option.value" :size="13" :stroke-width="3" />
          </button>
        </div>
      </fieldset>

      <fieldset class="color-field">
        <legend>Shirt</legend>
        <div class="swatch-row">
          <button
            v-for="option in SHIRT_OPTIONS"
            :key="option.value"
            type="button"
            :class="['color-swatch', { 'color-swatch--selected': config.shirt === option.value }]"
            :style="{ backgroundColor: `#${option.value}` }"
            :title="option.label"
            :aria-label="`${option.label} shirt`"
            :aria-pressed="config.shirt === option.value"
            @click="updateColor('shirt', option.value)"
          >
            <Check v-if="config.shirt === option.value" :size="13" :stroke-width="3" />
          </button>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.character-editor {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1fr);
  gap: 1rem;
  padding: 0.8rem;
  border: 1px solid rgba(24, 34, 28, 0.12);
  border-radius: 7px;
  background: #f5f7f5;
}

.character-preview {
  display: grid;
  align-content: start;
  gap: 0.65rem;
  place-items: center;
}

.randomize-button {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid #cbd3cd;
  border-radius: 5px;
  color: #405048;
  background: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.randomize-button:hover,
.randomize-button:focus-visible {
  border-color: #246646;
  color: #246646;
  outline: none;
}

.feature-grid {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem 0.75rem;
}

.feature-field,
.color-field {
  min-width: 0;
  border: 0;
}

.feature-field span,
.color-field legend {
  display: block;
  margin-bottom: 0.25rem;
  color: #64716a;
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
}

.feature-field select {
  width: 100%;
  min-height: 2.2rem;
  padding: 0.35rem 1.8rem 0.35rem 0.5rem;
  border: 1px solid #cbd3cd;
  border-radius: 4px;
  outline: none;
  color: #18221c;
  background: #fff;
  font-size: 0.78rem;
}

.feature-field select:focus {
  border-color: #246646;
  box-shadow: 0 0 0 2px rgba(36, 102, 70, 0.12);
}

.swatch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.color-swatch {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  place-items: center;
  border: 2px solid #fff;
  border-radius: 50%;
  color: #17221c;
  box-shadow: 0 0 0 1px #bcc7c0;
  cursor: pointer;
}

.color-swatch--selected {
  box-shadow: 0 0 0 2px #246646;
}

@media (max-width: 40rem) {
  .character-editor {
    grid-template-columns: 1fr;
  }

  .character-preview {
    grid-template-columns: auto auto;
    justify-content: center;
  }
}

@media (max-width: 25rem) {
  .feature-grid {
    grid-template-columns: 1fr;
  }
}
</style>