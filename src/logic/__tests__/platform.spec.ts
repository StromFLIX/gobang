import { describe, expect, it } from 'vitest'

import { publicAppUrl } from '@/logic/platform'

describe('publicAppUrl', () => {
  it('uses the configured public backend origin for native links', () => {
    expect(publicAppUrl('/game/ABC123', true, 'https://gobang.stromflix.com')).toBe(
      'https://gobang.stromflix.com/game/ABC123',
    )
  })

  it('uses the current origin for web links', () => {
    expect(publicAppUrl('/game/ABC123', false)).toBe('http://localhost:3000/game/ABC123')
  })
})
