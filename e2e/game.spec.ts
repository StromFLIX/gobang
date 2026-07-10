import { expect, test, type Page } from '@playwright/test'

async function configurePlayer(page: Page, name: string, glasses: string) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Choose your match.' })).toBeVisible()
  await expect(page.getByLabel('Replay of a Gobang match')).toBeVisible()
  await page.locator('#player-name').fill(name)
  await page.getByLabel('Glasses').selectOption(glasses)
}

async function registerPlayer(page: Page, name: string, email: string) {
  await configurePlayer(page, name, 'glasses2')
  await page.getByRole('button', { name: 'Save player' }).click()
  await page.locator('.account-summary').getByRole('button', { name: 'Sign in' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Create account' }).click()
  await dialog.getByLabel('Email').fill(email)
  await dialog.getByLabel('Password', { exact: true }).fill('BrowserPass42!')
  await dialog.getByLabel('Confirm password').fill('BrowserPass42!')
  await dialog.locator('form').getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.locator('.account-summary__name')).toHaveText(name)
}

async function authenticatedGames(page: Page) {
  return page.evaluate(async () => {
    const session = JSON.parse(localStorage.getItem('gobang.session.v1') ?? '{}') as {
      token?: string
    }
    const response = await fetch('/api/games', {
      headers: { Authorization: `Bearer ${session.token ?? ''}` },
    })
    return (await response.json()) as { id: string; status: string }[]
  })
}

test('ranked matchmaking waits, cancels, and pairs two accounts once', async ({
  browser,
}) => {
  const suffix = Date.now()
  const firstName = `Ranked one ${suffix}`
  const secondName = `Ranked two ${suffix}`
  const firstContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const secondContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const first = await firstContext.newPage()
  const second = await secondContext.newPage()

  await registerPlayer(first, firstName, `ranked-one-${suffix}@example.com`)
  await registerPlayer(second, secondName, `ranked-two-${suffix}@example.com`)

  const replayBox = await first.getByLabel('Replay of a Gobang match').boundingBox()
  const entryBox = await first.locator('.lobby-entry').boundingBox()
  expect(replayBox).not.toBeNull()
  expect(entryBox).not.toBeNull()
  expect(replayBox!.x + replayBox!.width).toBeLessThan(entryBox!.x)
  await first.screenshot({ path: 'test-results/desktop-lobby.png', fullPage: true })

  await first.getByRole('button', { name: 'Find ranked match' }).click()
  const firstSearch = first.getByRole('dialog', { name: 'Finding your opponent' })
  await expect(firstSearch).toBeVisible()
  await expect(firstSearch.locator('time')).toHaveText(/00:0[0-9]/)
  expect(await authenticatedGames(first)).toHaveLength(0)

  await firstSearch.getByRole('button', { name: 'Cancel search', exact: true }).last().click()
  await expect(firstSearch).toBeHidden()
  expect(await authenticatedGames(first)).toHaveLength(0)

  await first.getByRole('button', { name: 'Find ranked match' }).click()
  await expect(firstSearch).toBeVisible()
  await second.getByRole('button', { name: 'Find ranked match' }).click()

  await expect(first).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/, { timeout: 10_000 })
  await expect(second).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/, { timeout: 10_000 })
  expect(new URL(first.url()).pathname).toBe(new URL(second.url()).pathname)
  await expect(first.getByText(secondName, { exact: true })).toBeVisible()
  await expect(second.getByText(firstName, { exact: true })).toBeVisible()
  expect(await authenticatedGames(first)).toHaveLength(1)
  expect((await authenticatedGames(first))[0].status).toBe('active')

  await firstContext.close()
  await secondContext.close()
})

test('registered players can challenge from the leaderboard and accept in realtime', async ({
  browser,
}) => {
  const suffix = Date.now()
  const challengerName = `Challenger ${suffix}`
  const recipientName = `Recipient ${suffix}`
  const challengerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const recipientContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const challenger = await challengerContext.newPage()
  const recipient = await recipientContext.newPage()

  await registerPlayer(challenger, challengerName, `challenger-${suffix}@example.com`)
  await registerPlayer(recipient, recipientName, `recipient-${suffix}@example.com`)

  await challenger.getByRole('button', { name: 'Start game' }).click()
  await expect(challenger).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/)
  const originalGamePath = new URL(challenger.url()).pathname
  await recipient.goto(challenger.url())
  await expect(challenger.getByText(recipientName, { exact: true })).toBeVisible()
  await expect(recipient.getByText(challengerName, { exact: true })).toBeVisible()

  await challenger.getByRole('link', { name: 'Back to lobby' }).click()
  await recipient.getByRole('link', { name: 'Back to lobby' }).click()
  await challenger.setViewportSize({ width: 390, height: 844 })
  await challenger.getByRole('button', { name: 'All players' }).click()
  await challenger.getByRole('searchbox', { name: 'Find a player' }).fill(recipientName)
  const challengeButton = challenger.getByRole('button', { name: `Challenge ${recipientName}` })
  const challengeButtonBox = await challengeButton.boundingBox()
  expect(challengeButtonBox).not.toBeNull()
  expect(challengeButtonBox!.width).toBeGreaterThanOrEqual(44)
  expect(challengeButtonBox!.x + challengeButtonBox!.width).toBeLessThanOrEqual(390)
  await challenger.screenshot({ path: 'test-results/mobile-leaderboard-challenge.png' })
  await challengeButton.click()
  await expect(
    challenger.getByRole('button', { name: `Challenge ${recipientName}` }),
  ).toBeHidden()

  await challenger.goto(originalGamePath)
  await expect(challenger.getByRole('grid', { name: 'Gobang board' })).toBeVisible()

  await expect(recipient.locator('.invitation-badge')).toHaveText('1')
  await recipient.getByRole('button', { name: 'Challenges' }).click()
  await expect(
    recipient.locator('.invitation-popover').getByText(challengerName, { exact: true }),
  ).toBeVisible()
  await recipient
    .getByRole('button', { name: `Accept ${challengerName}'s challenge` })
    .click()

  await expect(recipient).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/)
  await expect(challenger).toHaveURL(new RegExp(`${originalGamePath}$`))
  expect(new URL(recipient.url()).pathname).not.toBe(originalGamePath)
  await expect(challenger.getByText(`${recipientName} accepted your challenge.`)).toBeVisible()
  await expect(recipient.getByText(challengerName, { exact: true })).toBeVisible()

  await challengerContext.close()
  await recipientContext.close()
})

test('two private players receive realtime turn updates', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()

  await configurePlayer(host, 'Host player', 'glasses3')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/)
  await expect(host.getByText('Game is open')).toBeVisible()

  await guest.goto(host.url())
  await expect(guest.getByText('Choose your player.')).toBeVisible()
  await guest.locator('#join-player-name').fill('Guest player')
  await guest.getByLabel('Hair', { exact: true }).selectOption('bun')
  await guest.getByRole('button', { name: 'Join game' }).click()

  await expect(host.getByText('Guest player', { exact: true })).toBeVisible()
  await expect(guest.getByText('Host player', { exact: true })).toBeVisible()
  await expect(host.getByText('At board', { exact: true })).toBeVisible({ timeout: 12_000 })
  await expect(guest.getByText('At board', { exact: true })).toBeVisible({ timeout: 12_000 })

  const desktopBoardBox = await host.getByRole('grid', { name: 'Gobang board' }).boundingBox()
  const desktopReactionBox = await host.locator('.reaction-bar').boundingBox()
  expect(desktopBoardBox).not.toBeNull()
  expect(desktopReactionBox).not.toBeNull()
  expect(Math.abs(desktopReactionBox!.width - desktopBoardBox!.width)).toBeLessThanOrEqual(1)

  await host.getByRole('button', { name: 'Send Shit' }).click()
  await expect(guest.locator('.reaction-popup img[data-reaction="poop"]')).toBeVisible()
  await expect(guest.locator('.reaction-popup')).toContainText('Host player')
  await expect(host.locator('.reaction-popup')).toHaveCount(0)
  await guest.screenshot({ path: 'test-results/reaction-popup.png' })
  await expect(guest.locator('.reaction-popup')).toBeHidden({ timeout: 3_000 })

  const hostPoint = host.getByRole('gridcell', { name: 'Row 1, column 1', exact: true })
  const activePage = (await hostPoint.isEnabled()) ? host : guest
  const waitingPage = activePage === host ? guest : host

  await activePage
    .getByRole('gridcell', { name: 'Row 1, column 1', exact: true })
    .click()

  await expect(
    waitingPage.getByRole('gridcell', {
      name: 'black stone, row 1, column 1',
      exact: true,
    }),
  ).toBeVisible()
  await expect(waitingPage.getByLabel('Black stones on board').locator('strong')).toHaveText('1')
  await expect(waitingPage.getByLabel('White stones on board').locator('strong')).toHaveText('0')
  await expect(
    waitingPage.getByRole('gridcell', { name: 'Row 1, column 2', exact: true }),
  ).toBeEnabled()
  await waitingPage.getByRole('link', { name: 'Back to lobby' }).click()
  await expect(activePage.getByText('Away', { exact: true })).toBeVisible({ timeout: 12_000 })
  await expect(waitingPage.getByText('Waiting on you')).toBeVisible()
  await expect(waitingPage.locator('.presence-dot--turn.presence-dot--pulse')).toBeVisible()
  await waitingPage.screenshot({ path: 'test-results/current-opponents.png', fullPage: true })
  await host.screenshot({ path: 'test-results/realtime-desktop.png', fullPage: true })

  await hostContext.close()
  await guestContext.close()
})

test('mobile lobby and board fit a 390 by 844 viewport', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()

  await configurePlayer(page, 'Mobile player', 'sunglasses')
  const accountAvatarBox = await page.getByRole('button', { name: 'Edit player' }).boundingBox()
  const signInBox = await page
    .getByRole('banner')
    .getByRole('button', { name: 'Sign in' })
    .boundingBox()
  expect(accountAvatarBox).not.toBeNull()
  expect(signInBox).not.toBeNull()
  expect(Math.abs(accountAvatarBox!.height - signInBox!.height)).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Save player' }).click()
  await expect(page.locator('.profile-tool')).toBeHidden()
  await page.getByRole('button', { name: 'Edit player' }).click()
  await expect(page.locator('#player-name')).toHaveValue('Mobile player')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.profile-tool')).toBeHidden()
  await page.evaluate(() => window.scrollTo(0, 0))
  expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/mobile-lobby.png' })
  await page.getByRole('heading', { name: 'Leaderboard' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/mobile-leaderboard.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/)
  await expect(page.locator('.connection-pill')).toContainText('live')
  const liveBox = await page.locator('.connection-pill').boundingBox()
  const shareBox = await page
    .locator('.game-header')
    .getByRole('button', { name: 'Share game' })
    .boundingBox()
  expect(liveBox).not.toBeNull()
  expect(shareBox).not.toBeNull()
  expect(Math.abs(liveBox!.height - shareBox!.height)).toBeLessThanOrEqual(1)
  const board = page.getByRole('grid', { name: 'Gobang board' })
  await expect(board).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm selected move' })).toBeVisible()
  const box = await board.boundingBox()
  const reactionBox = await page.locator('.reaction-bar').boundingBox()
  expect(box).not.toBeNull()
  expect(reactionBox).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  expect(box!.width).toBeGreaterThan(350)
  expect(Math.abs(reactionBox!.width - box!.width)).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/mobile-room.png' })

  const opponentContext = await browser.newContext({ viewport: { width: 1100, height: 800 } })
  const opponent = await opponentContext.newPage()
  await opponent.goto(page.url())
  await expect(opponent.getByText('Choose your player.')).toBeVisible()
  await opponent.locator('#join-player-name').fill('Mobile opponent')
  await opponent.getByLabel('Facial hair').selectOption('moustache4')
  await opponent.getByRole('button', { name: 'Join game' }).click()

  const mobileFirstPoint = page.getByRole('gridcell', {
    name: 'Row 1, column 1',
    exact: true,
  })
  const opponentFirstPoint = opponent.getByRole('gridcell', {
    name: 'Row 1, column 1',
    exact: true,
  })
  await expect
    .poll(async () => (await mobileFirstPoint.isEnabled()) || (await opponentFirstPoint.isEnabled()))
    .toBe(true)
  const quickRules = page.getByLabel('Gobang rules')
  await expect(quickRules).toContainText('Five wins')
  await expect(quickRules).toContainText('Capture pairs')
  await expect(quickRules).toContainText('blocked for their next move')
  await quickRules.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/mobile-game-rules.png' })
  if (!(await mobileFirstPoint.isEnabled())) {
    await opponentFirstPoint.click()
    await expect(
      page.getByRole('gridcell', {
        name: 'black stone, row 1, column 1',
        exact: true,
      }),
    ).toBeVisible()
  }

  const selectedPoint = page.getByRole('gridcell', {
    name: 'Row 1, column 2',
    exact: true,
  })
  await selectedPoint.click()
  await expect(selectedPoint).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm selected move' })).toBeEnabled()
  await page.screenshot({ path: 'test-results/mobile-selected-move.png' })
  await page.getByRole('button', { name: 'Confirm selected move' }).click()
  await expect(
    page.getByRole('gridcell', {
      name: /^(black|white) stone, row 1, column 2$/,
    }),
  ).toBeVisible()

  await opponentContext.close()
  await context.close()
})

test('an upgraded guest can continue from another device', async ({ browser }) => {
  const firstContext = await browser.newContext({ viewport: { width: 1200, height: 850 } })
  const firstDevice = await firstContext.newPage()
  const email = `player-${Date.now()}@example.com`
  const password = 'BrowserPass42!'

  await configurePlayer(firstDevice, 'Cross-device player', 'glasses5')
  await firstDevice.getByRole('button', { name: 'Start game' }).click()
  await expect(firstDevice.getByText('Game is open')).toBeVisible()
  const roomPath = new URL(firstDevice.url()).pathname
  await firstDevice.getByRole('link', { name: 'Back to lobby' }).click()

  await firstDevice.locator('.account-summary').getByRole('button', { name: 'Sign in' }).click()
  const registerDialog = firstDevice.getByRole('dialog')
  await registerDialog.getByRole('button', { name: 'Create account' }).click()
  await expect(registerDialog).toHaveAccessibleName('Create account')
  await registerDialog.getByLabel('Email').fill(email)
  await registerDialog.getByLabel('Password', { exact: true }).fill(password)
  await registerDialog.getByLabel('Confirm password').fill(password)
  await registerDialog
    .locator('form')
    .getByRole('button', { name: 'Create account' })
    .click()
  await expect(firstDevice.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(firstDevice.locator(`a[href="${roomPath}"]`)).toBeVisible()

  const secondContext = await browser.newContext({ viewport: { width: 1200, height: 850 } })
  const secondDevice = await secondContext.newPage()
  await secondDevice.goto('/')
  await expect(secondDevice.getByRole('heading', { name: 'Choose your match.' })).toBeVisible()
  await secondDevice.locator('.account-summary').getByRole('button', { name: 'Sign in' }).click()
  const loginDialog = secondDevice.getByRole('dialog')
  await loginDialog.getByLabel('Email').fill(email)
  await loginDialog.getByLabel('Password').fill(password)
  await loginDialog.locator('form').getByRole('button', { name: 'Sign in' }).click()

  await expect(secondDevice.locator('.account-summary__name')).toHaveText('Cross-device player')
  await expect(secondDevice.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(secondDevice.locator(`a[href="${roomPath}"]`)).toBeVisible()

  await firstContext.close()
  await secondContext.close()
})

test('guest games can be merged into an existing account', async ({ browser }) => {
  const accountContext = await browser.newContext({ viewport: { width: 1200, height: 850 } })
  const accountPage = await accountContext.newPage()
  const email = `merge-${Date.now()}@example.com`
  const password = 'BrowserPass42!'

  await configurePlayer(accountPage, 'Existing account', 'glasses2')
  await accountPage.getByRole('button', { name: 'Save player' }).click()
  await accountPage.locator('.account-summary').getByRole('button', { name: 'Sign in' }).click()
  const accountDialog = accountPage.getByRole('dialog')
  await accountDialog.getByRole('button', { name: 'Create account' }).click()
  await accountDialog.getByLabel('Email').fill(email)
  await accountDialog.getByLabel('Password', { exact: true }).fill(password)
  await accountDialog.getByLabel('Confirm password').fill(password)
  await accountDialog.locator('form').getByRole('button', { name: 'Create account' }).click()
  await expect(accountPage.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await accountContext.close()

  const guestContext = await browser.newContext({ viewport: { width: 1200, height: 850 } })
  const guestPage = await guestContext.newPage()
  await configurePlayer(guestPage, 'Guest with progress', 'glasses3')
  await guestPage.getByRole('button', { name: 'Start game' }).click()
  const gamePath = new URL(guestPage.url()).pathname
  await guestPage.getByRole('link', { name: 'Back to lobby' }).click()

  await guestPage.locator('.account-summary').getByRole('button', { name: 'Sign in' }).click()
  const mergeDialog = guestPage.getByRole('dialog')
  await mergeDialog.getByLabel('Email').fill(email)
  await mergeDialog.getByLabel('Password').fill(password)
  await mergeDialog.locator('form').getByRole('button', { name: 'Sign in' }).click()

  await expect(mergeDialog).toHaveAccessibleName('Keep your current games?')
  await mergeDialog.getByRole('button', { name: 'Merge 1 game and sign in' }).click()
  await expect(guestPage.locator('.account-summary__name')).toHaveText('Existing account')
  await expect(guestPage.locator(`a[href="${gamePath}"]`)).toBeVisible()

  await guestContext.close()
})

test('a finished round appears in personal leaderboard history', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1200, height: 900 } })
  const guestContext = await browser.newContext({ viewport: { width: 1200, height: 900 } })
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()
  const email = `post-game-${Date.now()}@example.com`
  const password = 'BrowserPass42!'

  await configurePlayer(host, 'Leaderboard host', 'glasses3')
  await host.getByRole('button', { name: 'Start game' }).click()
  await expect(host).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/)
  await guest.goto(host.url())
  await guest.locator('#join-player-name').fill('Leaderboard friend')
  await guest.getByRole('button', { name: 'Join game' }).click()
  await expect(host.getByText('Leaderboard friend', { exact: true })).toBeVisible()

  await host.getByRole('button', { name: 'Resign', exact: true }).click()
  await host.getByRole('button', { name: 'Confirm resign' }).click()
  const hostProgressDialog = host.getByRole('dialog', { name: 'Keep your game history?' })
  await expect(hostProgressDialog).toBeVisible()
  await hostProgressDialog.screenshot({ path: 'test-results/post-game-account-prompt.png' })
  await hostProgressDialog.getByRole('button', { name: 'Create account' }).click()
  const registrationDialog = host.getByRole('dialog', { name: 'Create account' })
  await registrationDialog.getByLabel('Email').fill(email)
  await registrationDialog.getByLabel('Password', { exact: true }).fill(password)
  await registrationDialog.getByLabel('Confirm password').fill(password)
  await registrationDialog.getByRole('button', { name: 'Create account' }).click()
  await expect(registrationDialog).toBeHidden()
  await expect(host.getByRole('heading', { name: 'Leaderboard friend wins' })).toBeVisible()
  const guestProgressDialog = guest.getByRole('dialog', { name: 'Keep your game history?' })
  await expect(guestProgressDialog).toBeVisible()
  await guestProgressDialog.getByRole('button', { name: 'Keep playing anonymously' }).click()
  await guest.getByRole('button', { name: 'Ready for rematch' }).click()
  await expect(host.getByText('Opponent wants a rematch')).toBeVisible()
  await expect(host.locator('.rematch-state--incoming .presence-dot--pulse')).toBeVisible()
  await host.getByRole('link', { name: 'Back to lobby' }).click()
  await expect(host.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(host.getByText('Wants rematch')).toBeVisible()
  await expect(host.locator('.presence-dot--rematch')).toBeVisible()
  await expect(host.locator('.presence-dot--rematch')).not.toHaveClass(/presence-dot--pulse/)

  await expect(host.getByRole('heading', { name: 'Leaderboard' })).toBeVisible()
  await expect(host.locator('.personal-summary')).toContainText('0–1–0')
  await expect(host.locator('.personal-summary')).toContainText('1184')
  await expect(host.locator('.standing-row--current .standing-elo')).toHaveText('1184')
  await host.getByRole('tab', { name: 'Against friends' }).click()
  await expect(host.locator('.matchup-list')).toContainText('Leaderboard friend')
  await expect(host.locator('.result-list')).toContainText(
    'Leaderboard friend beat Leaderboard host',
  )
  await host.screenshot({ path: 'test-results/personal-leaderboard.png', fullPage: true })

  await hostContext.close()
  await guestContext.close()
})