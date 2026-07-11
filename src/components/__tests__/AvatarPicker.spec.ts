import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AvatarImage from '@/components/AvatarImage.vue'
import AvatarPicker from '@/components/AvatarPicker.vue'
import { decodeAvatar, encodeAvatar, type AvatarConfig } from '@/logic/avatar'

const customAvatar: AvatarConfig = {
  hair: 'mohawk',
  face: 'smile',
  accessory: 'none',
  facialHair: 'none',
  skin: 'd08b5b',
  shirt: '78e185',
}

describe('AvatarPicker', () => {
  it('preserves the legacy index order for saved custom avatars', () => {
    expect(decodeAvatar('av1-11-7-6-5-4-5')).toEqual({
      hair: 'twists2',
      face: 'smileBig',
      accessory: 'sunglasses',
      facialHair: 'moustache4',
      skin: '614335',
      shirt: 'e279c7',
    })
  })

  it('round-trips a custom character through the profile-safe value', () => {
    const encoded = encodeAvatar(customAvatar)

    expect(encoded).toMatch(/^av1(?:-\d+){6}$/)
    expect(encoded.length).toBeLessThanOrEqual(64)
    expect(decodeAvatar(encoded)).toEqual(customAvatar)
  })

  it('changes glasses without replacing the other selected features', async () => {
    const wrapper = mount(AvatarPicker, {
      props: { modelValue: encodeAvatar(customAvatar) },
    })

    await wrapper.findAll('select')[2].setValue('glasses3')

    const emittedValue = wrapper.emitted('update:modelValue')?.[0]?.[0] as string
    expect(decodeAvatar(emittedValue)).toEqual({
      ...customAvatar,
      accessory: 'glasses3',
    })
  })

  it('updates shirt color from its labeled swatch', async () => {
    const wrapper = mount(AvatarPicker, {
      props: { modelValue: encodeAvatar(customAvatar) },
    })

    await wrapper.get('[aria-label="Blue shirt"]').trigger('click')

    const emittedValue = wrapper.emitted('update:modelValue')?.[0]?.[0] as string
    expect(decodeAvatar(emittedValue)).toEqual({ ...customAvatar, shirt: '8fa7df' })
  })

  it('renders different SVGs for different selected accessories', () => {
    const withoutGlasses = mount(AvatarImage, {
      props: { seed: encodeAvatar(customAvatar) },
    })
    const withGlasses = mount(AvatarImage, {
      props: {
        seed: encodeAvatar({ ...customAvatar, accessory: 'glasses3' }),
      },
    })

    expect(withGlasses.get('img').attributes('src')).not.toBe(
      withoutGlasses.get('img').attributes('src'),
    )
  })
})