import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/logic/platform', () => ({ isNativeApp: true }))

interface AnalyticsWindow extends Window {
  umami?: { track: ReturnType<typeof vi.fn> }
}

function addTrackerScript() {
  const script = document.createElement('script')
  script.id = 'umami-script'
  script.dataset.websiteId = 'website-id'
  document.head.append(script)
  return script
}

describe('analytics', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    delete (window as AnalyticsWindow).umami
    vi.resetModules()
  })

  it('loads the privacy-minimized tracker in the native app', async () => {
    const { initializeAnalytics } = await import('../analytics')

    initializeAnalytics()

    const script = document.querySelector<HTMLScriptElement>('#umami-script')
    expect(script?.src).toBe('https://umami.stromflix.com/script.js')
    expect(script?.dataset).toMatchObject({
      websiteId: 'd2ca1530-178e-4719-93c5-2db309d25ed5',
      autoTrack: 'false',
      domains: window.location.hostname,
      doNotTrack: 'true',
      excludeSearch: 'true',
      excludeHash: 'true',
    })
  })

  it('sends only the canonical route and title', async () => {
    addTrackerScript()
    const track = vi.fn()
    ;(window as AnalyticsWindow).umami = { track }
    const { trackPageView } = await import('../analytics')

    trackPageView('/game/:inviteCode', 'Private Gobang Match')

    expect(track).toHaveBeenCalledWith({
      website: 'website-id',
      url: '/game/:inviteCode',
      title: 'Private Gobang Match',
    })
  })

  it('sends the latest page view when the deferred tracker loads', async () => {
    const script = addTrackerScript()
    const { trackPageView } = await import('../analytics')
    trackPageView('/account', 'Gobang Account')

    const track = vi.fn()
    ;(window as AnalyticsWindow).umami = { track }
    script.dispatchEvent(new Event('load'))

    expect(track).toHaveBeenCalledOnce()
  })
})