import { isNativeApp } from '@/logic/platform'

interface UmamiTracker {
  track(payload: { website: string; url: string; title: string }): void
}

interface AnalyticsWindow extends Window {
  umami?: UmamiTracker
}

interface PageView {
  website: string
  url: string
  title: string
}

let pendingPageView: PageView | undefined
let waitingForTracker = false

export function initializeAnalytics() {
  const isProductionWebsite =
    import.meta.env.PROD && window.location.hostname === 'gobang.stromflix.com'
  if (!isNativeApp && !isProductionWebsite) return

  const script = document.createElement('script')
  script.id = 'umami-script'
  script.defer = true
  script.src = 'https://umami.stromflix.com/script.js'
  script.dataset.websiteId = 'd2ca1530-178e-4719-93c5-2db309d25ed5'
  script.dataset.autoTrack = 'false'
  script.dataset.domains = isNativeApp ? window.location.hostname : 'gobang.stromflix.com'
  script.dataset.doNotTrack = 'true'
  script.dataset.excludeSearch = 'true'
  script.dataset.excludeHash = 'true'
  document.head.append(script)
}

function sendPendingPageView() {
  const tracker = (window as AnalyticsWindow).umami
  if (!tracker || !pendingPageView) return

  tracker.track(pendingPageView)
  pendingPageView = undefined
}

export function trackPageView(url: string, title: string) {
  const script = document.querySelector<HTMLScriptElement>('#umami-script')
  const website = script?.dataset.websiteId
  if (!script || !website) return

  pendingPageView = { website, url, title }
  sendPendingPageView()

  if ((window as AnalyticsWindow).umami || waitingForTracker) return
  waitingForTracker = true
  script.addEventListener(
    'load',
    () => {
      waitingForTracker = false
      sendPendingPageView()
    },
    { once: true },
  )
}