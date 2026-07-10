import { expect, test, type Page } from '@playwright/test'

async function configurePlayer(page: Page, name: string, glasses: string) {
  await page.goto('/')
  await expect(page.getByText('Ready your player.')).toBeVisible()
  await page.locator('#player-name').fill(name)
  await page.getByLabel('Glasses').selectOption(glasses)
}

test('two private players receive realtime turn updates', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()

  await configurePlayer(host, 'Host player', 'glasses3')
  await host.getByRole('button', { name: 'New room' }).click()
  await expect(host).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/)
  await expect(host.getByText('Room is open')).toBeVisible()

  await guest.goto(host.url())
  await expect(guest.getByText('Choose your player.')).toBeVisible()
  await guest.locator('#join-player-name').fill('Guest player')
  await guest.getByLabel('Hair', { exact: true }).selectOption('bun')
  await guest.getByRole('button', { name: 'Join room' }).click()

  await expect(host.getByText('Guest player', { exact: true })).toBeVisible()
  await expect(guest.getByText('Host player', { exact: true })).toBeVisible()

  const hostPoint = host.getByRole('gridcell', { name: 'Row 1, column 1', exact: true })
  const activePage = (await hostPoint.isEnabled()) ? host : guest
  const waitingPage = activePage === host ? guest : host

  await expect(activePage.getByRole('heading', { name: 'Your turn' })).toBeVisible()
  await activePage
    .getByRole('gridcell', { name: 'Row 1, column 1', exact: true })
    .click()

  await expect(
    waitingPage.getByRole('gridcell', {
      name: 'black stone, row 1, column 1',
      exact: true,
    }),
  ).toBeVisible()
  await expect(waitingPage.getByRole('heading', { name: 'Your turn' })).toBeVisible()
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
  expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/mobile-lobby.png' })

  await page.getByRole('button', { name: 'New room' }).click()
  await expect(page).toHaveURL(/\/game\/[A-Za-z0-9_-]+$/)
  const board = page.getByRole('grid', { name: 'Gobang board' })
  await expect(board).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm selected move' })).toBeVisible()
  const box = await board.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  expect(box!.width).toBeGreaterThan(350)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/mobile-room.png' })

  const opponentContext = await browser.newContext({ viewport: { width: 1100, height: 800 } })
  const opponent = await opponentContext.newPage()
  await opponent.goto(page.url())
  await expect(opponent.getByText('Choose your player.')).toBeVisible()
  await opponent.locator('#join-player-name').fill('Mobile opponent')
  await opponent.getByLabel('Facial hair').selectOption('moustache4')
  await opponent.getByRole('button', { name: 'Join room' }).click()

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
  await firstDevice.getByRole('button', { name: 'New room' }).click()
  await expect(firstDevice.getByText('Room is open')).toBeVisible()
  const roomPath = new URL(firstDevice.url()).pathname
  await firstDevice.getByRole('link', { name: 'Back to lobby' }).click()

  await firstDevice.getByRole('button', { name: 'Sign in' }).click()
  const registerDialog = firstDevice.getByRole('dialog', { name: 'Create account' })
  await registerDialog.getByLabel('Email').fill(email)
  await registerDialog.getByLabel('Password', { exact: true }).fill(password)
  await registerDialog.getByLabel('Confirm password').fill(password)
  await registerDialog
    .locator('form')
    .getByRole('button', { name: 'Create account' })
    .click()
  await expect(firstDevice.getByText('Account', { exact: true })).toBeVisible()
  await expect(firstDevice.locator(`a[href="${roomPath}"]`)).toBeVisible()

  const secondContext = await browser.newContext({ viewport: { width: 1200, height: 850 } })
  const secondDevice = await secondContext.newPage()
  await secondDevice.goto('/')
  await expect(secondDevice.getByText('Ready your player.')).toBeVisible()
  await secondDevice.getByRole('button', { name: 'Sign in' }).click()
  const loginDialog = secondDevice.getByRole('dialog')
  await loginDialog.getByRole('button', { name: 'Sign in' }).click()
  await loginDialog.getByLabel('Email').fill(email)
  await loginDialog.getByLabel('Password').fill(password)
  await loginDialog.locator('form').getByRole('button', { name: 'Sign in' }).click()

  await expect(secondDevice.locator('.account-summary__name')).toHaveText('Cross-device player')
  await expect(secondDevice.getByText('Account', { exact: true })).toBeVisible()
  await expect(secondDevice.locator(`a[href="${roomPath}"]`)).toBeVisible()

  await firstContext.close()
  await secondContext.close()
})