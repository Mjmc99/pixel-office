import { expect, test, type Page } from '@playwright/test'
import { connected, drag, move, world } from './helpers'

const zones = (p: Page) => p.evaluate(() => [...(window as any).__po.state.view.zones.values()].map((z: any) => `${z.name}@${z.x},${z.y},${z.w}x${z.h}`))

test('the owner draws a call zone around a corner of the lounge; it becomes its own call', async ({ context }) => {
  const [owner, guest] = await world(context, ['Owner', 'Guest'])
  await owner.bringToFront()
  await move(owner, 19, 33); await owner.waitForTimeout(800) // camera follows
  await owner.keyboard.press('KeyB')
  await owner.getByText('Call zones').click()
  await drag(owner, [17, 32], [21, 35])
  await expect.poll(() => zones(guest)).toContain('Zone 10@17,32,5x4')

  await owner.locator('.zone-row input[maxlength]').last().fill('Reading nook')
  await owner.locator('.zone-row input[maxlength]').last().press('Enter')
  await expect.poll(() => zones(guest)).toContain('Reading nook@17,32,5x4')

  // overlapping zones and zones over offices are refused
  await drag(owner, [8, 30], [12, 33])
  await drag(owner, [14, 17], [17, 20])
  expect((await zones(owner)).length).toBe(10)

  // guests can't edit zones, and a forged zone op from a guest is ignored by everyone
  await guest.bringToFront(); await guest.keyboard.press('KeyB')
  await expect(guest.getByText('Call zones')).toHaveCount(0)
  await guest.evaluate(() => (window as any).__po.state.author('zone.set', { id: 'evil', name: 'Evil', x: 40, y: 16, w: 3, h: 2, floor: 0 }))
  await owner.waitForTimeout(500)
  expect((await zones(owner)).some((z) => z.startsWith('Evil'))).toBe(false)

  // sit down in the nook together -> same call; step out -> call ends
  await owner.keyboard.press('Escape'); await owner.keyboard.press('Escape')
  await guest.keyboard.press('Escape')
  await move(owner, 17, 33); await move(guest, 21, 33)
  await expect.poll(() => connected(owner), { timeout: 20_000 }).toBe(1)
  await move(guest, 22, 33)
  await expect.poll(() => connected(owner), { timeout: 10_000 }).toBe(0)
})
