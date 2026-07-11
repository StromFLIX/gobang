import { describe, expect, it } from 'vitest'

import { appPathFromUrl } from '@/composables/useAppLinks'

describe('appPathFromUrl', () => {
  it('accepts canonical HTTPS game links', () => {
    expect(appPathFromUrl('https://gobang.stromflix.com/game/ABC123')).toBe('/game/ABC123')
  })

  it.each([
    'https://localhost/game/ABC123',
    'http://gobang.stromflix.com/game/ABC123',
    'https://example.com/game/ABC123',
    'https://gobang.stromflix.com/privacy',
    'not a url',
  ])('rejects non-app link %s', (url) => {
    expect(appPathFromUrl(url)).toBeNull()
  })
})
