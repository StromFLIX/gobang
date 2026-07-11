import { createAvatar } from '@dicebear/core'
import { openPeeps } from '@dicebear/collection'

export const AVATAR_PRESETS = ['nova', 'miso', 'pepper', 'fig', 'maple', 'pixel'] as const

function avatarOptions<const Values extends readonly string[]>(values: Values) {
  return values.map((value) => ({
    value,
    label: value
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Za-z])(\d+)/g, '$1 $2')
      .replace(/^./, (character) => character.toUpperCase()),
  })) as { value: Values[number]; label: string }[]
}

export const HAIR_OPTIONS = avatarOptions([
  'afro', 'bangs', 'bantuKnots', 'bun', 'cornrows', 'dreads1', 'flatTop', 'longCurly',
  'medium1', 'mohawk', 'short2', 'twists2', 'bangs2', 'bear', 'bun2', 'buns',
  'cornrows2', 'dreads2', 'flatTopLong', 'grayBun', 'grayMedium', 'grayShort', 'hatBeanie',
  'hatHip', 'hijab', 'long', 'longAfro', 'longBangs', 'medium2', 'medium3', 'mediumBangs',
  'mediumBangs2', 'mediumBangs3', 'mediumStraight', 'mohawk2', 'noHair1', 'noHair2',
  'noHair3', 'pomp', 'shaved1', 'shaved2', 'shaved3', 'short1', 'short3', 'short4',
  'short5', 'turban', 'twists',
] as const)

export const FACE_OPTIONS = avatarOptions([
  'calm', 'cheeky', 'cute', 'driven', 'lovingGrin1', 'serious', 'smile', 'smileBig',
  'angryWithFang', 'awe', 'blank', 'concerned', 'concernedFear', 'contempt', 'cyclops',
  'eatingHappy', 'explaining', 'eyesClosed', 'fear', 'hectic', 'lovingGrin2', 'monster',
  'old', 'rage', 'smileLOL', 'smileTeethGap', 'solemn', 'suspicious', 'tired', 'veryAngry',
] as const)

export const ACCESSORY_OPTIONS = avatarOptions([
  'none', 'eyepatch', 'glasses', 'glasses2', 'glasses3', 'glasses5', 'sunglasses',
  'glasses4', 'sunglasses2',
] as const)

export const FACIAL_HAIR_OPTIONS = avatarOptions([
  'none', 'chin', 'full', 'goatee1', 'moustache1', 'moustache4', 'full2', 'full3', 'full4',
  'goatee2', 'moustache2', 'moustache3', 'moustache5', 'moustache6', 'moustache7',
  'moustache8', 'moustache9',
] as const)

export const SKIN_OPTIONS = [
  { value: 'ffdbb4', label: 'Light' },
  { value: 'edb98a', label: 'Warm light' },
  { value: 'd08b5b', label: 'Medium' },
  { value: 'ae5d29', label: 'Deep' },
  { value: '614335', label: 'Dark' },
  { value: '694d3d', label: 'Deep brown' },
] as const

export const SHIRT_OPTIONS = [
  { value: 'e78276', label: 'Coral' },
  { value: 'ffcf77', label: 'Amber' },
  { value: '78e185', label: 'Green' },
  { value: '9ddadb', label: 'Aqua' },
  { value: '8fa7df', label: 'Blue' },
  { value: 'e279c7', label: 'Pink' },
  { value: 'fdea6b', label: 'Yellow' },
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

  const details = createAvatar(openPeeps, { seed: value }).toJson().extra
  const detail = (name: string) =>
    typeof details[name] === 'string' ? details[name] : undefined
  return {
    hair: optionValue(HAIR_OPTIONS, detail('head')),
    face: optionValue(FACE_OPTIONS, detail('face')),
    accessory: optionValue(ACCESSORY_OPTIONS, detail('accessories') ?? 'none'),
    facialHair: optionValue(FACIAL_HAIR_OPTIONS, detail('facialHair') ?? 'none'),
    skin: optionValue(SKIN_OPTIONS, detail('skinColor')?.replace('#', '')),
    shirt: optionValue(SHIRT_OPTIONS, detail('clothingColor')?.replace('#', '')),
  }
}

function optionValue<T extends readonly { value: string }[]>(options: T, value?: string) {
  return (options.find((option) => option.value === value)?.value ?? options[0].value) as OptionValue<T>
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