export const AVATAR_PRESETS = ['nova', 'miso', 'pepper', 'fig', 'maple', 'pixel'] as const

export const HAIR_OPTIONS = [
  { value: 'afro', label: 'Afro' },
  { value: 'bangs', label: 'Bangs' },
  { value: 'bantuKnots', label: 'Bantu knots' },
  { value: 'bun', label: 'Bun' },
  { value: 'cornrows', label: 'Cornrows' },
  { value: 'dreads1', label: 'Dreads' },
  { value: 'flatTop', label: 'Flat top' },
  { value: 'longCurly', label: 'Long curls' },
  { value: 'medium1', label: 'Medium' },
  { value: 'mohawk', label: 'Mohawk' },
  { value: 'short2', label: 'Short' },
  { value: 'twists2', label: 'Twists' },
] as const

export const FACE_OPTIONS = [
  { value: 'calm', label: 'Calm' },
  { value: 'cheeky', label: 'Cheeky' },
  { value: 'cute', label: 'Cute' },
  { value: 'driven', label: 'Focused' },
  { value: 'lovingGrin1', label: 'Grinning' },
  { value: 'serious', label: 'Serious' },
  { value: 'smile', label: 'Smile' },
  { value: 'smileBig', label: 'Big smile' },
] as const

export const ACCESSORY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'eyepatch', label: 'Eyepatch' },
  { value: 'glasses', label: 'Round glasses' },
  { value: 'glasses2', label: 'Wire glasses' },
  { value: 'glasses3', label: 'Square glasses' },
  { value: 'glasses5', label: 'Small glasses' },
  { value: 'sunglasses', label: 'Sunglasses' },
] as const

export const FACIAL_HAIR_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'chin', label: 'Chin beard' },
  { value: 'full', label: 'Full beard' },
  { value: 'goatee1', label: 'Goatee' },
  { value: 'moustache1', label: 'Moustache' },
  { value: 'moustache4', label: 'Curled moustache' },
] as const

export const SKIN_OPTIONS = [
  { value: 'ffdbb4', label: 'Light' },
  { value: 'edb98a', label: 'Warm light' },
  { value: 'd08b5b', label: 'Medium' },
  { value: 'ae5d29', label: 'Deep' },
  { value: '614335', label: 'Dark' },
] as const

export const SHIRT_OPTIONS = [
  { value: 'e78276', label: 'Coral' },
  { value: 'ffcf77', label: 'Amber' },
  { value: '78e185', label: 'Green' },
  { value: '9ddadb', label: 'Aqua' },
  { value: '8fa7df', label: 'Blue' },
  { value: 'e279c7', label: 'Pink' },
] as const

type OptionValue<T extends readonly { value: string }[]> = T[number]['value']

export interface AvatarConfig {
  hair: OptionValue<typeof HAIR_OPTIONS>
  face: OptionValue<typeof FACE_OPTIONS>
  accessory: OptionValue<typeof ACCESSORY_OPTIONS>
  facialHair: OptionValue<typeof FACIAL_HAIR_OPTIONS>
  skin: OptionValue<typeof SKIN_OPTIONS>
  shirt: OptionValue<typeof SHIRT_OPTIONS>
}

const CUSTOM_AVATAR_PATTERN = /^av1-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)-(\d+)$/

function hash(value: string) {
  let result = 0
  for (const character of value) result = (result * 31 + character.charCodeAt(0)) >>> 0
  return result
}

function optionAt<T extends readonly { value: string }[]>(options: T, index: number) {
  return options[index % options.length].value as OptionValue<T>
}

function optionIndex<T extends readonly { value: string }[]>(
  options: T,
  value: OptionValue<T>,
) {
  const index = options.findIndex((option) => option.value === value)
  return index < 0 ? 0 : index
}

export function decodeAvatar(value: string): AvatarConfig {
  const match = value.match(CUSTOM_AVATAR_PATTERN)
  if (match) {
    const indexes = match.slice(1).map(Number)
    return {
      hair: optionAt(HAIR_OPTIONS, indexes[0]),
      face: optionAt(FACE_OPTIONS, indexes[1]),
      accessory: optionAt(ACCESSORY_OPTIONS, indexes[2]),
      facialHair: optionAt(FACIAL_HAIR_OPTIONS, indexes[3]),
      skin: optionAt(SKIN_OPTIONS, indexes[4]),
      shirt: optionAt(SHIRT_OPTIONS, indexes[5]),
    }
  }

  const base = hash(value)
  return {
    hair: optionAt(HAIR_OPTIONS, base),
    face: optionAt(FACE_OPTIONS, base >>> 3),
    accessory: optionAt(ACCESSORY_OPTIONS, base >>> 6),
    facialHair: optionAt(FACIAL_HAIR_OPTIONS, base >>> 9),
    skin: optionAt(SKIN_OPTIONS, base >>> 12),
    shirt: optionAt(SHIRT_OPTIONS, base >>> 15),
  }
}

export function encodeAvatar(config: AvatarConfig) {
  return [
    'av1',
    optionIndex(HAIR_OPTIONS, config.hair),
    optionIndex(FACE_OPTIONS, config.face),
    optionIndex(ACCESSORY_OPTIONS, config.accessory),
    optionIndex(FACIAL_HAIR_OPTIONS, config.facialHair),
    optionIndex(SKIN_OPTIONS, config.skin),
    optionIndex(SHIRT_OPTIONS, config.shirt),
  ].join('-')
}

export function isCustomAvatar(value: string) {
  return CUSTOM_AVATAR_PATTERN.test(value)
}