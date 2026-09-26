import { expect, test, type Page } from '@playwright/test'

async function join(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as any).__po, null, { timeout: 20_000 })
}
const screenOf = (p: Page, tx: number, ty: number) => p.evaluate(([x, y]) => {
  const c = (window as any).__po.scene.cameras.main
  return { x: (x * 16 + 8 - c.worldView.x) * c.zoom, y: (y * 16 + 8 - c.worldView.y) * c.zoom }
}, [tx, ty])
const zones = (p: Page) => p.evaluate(() => (window as any).__po.scene.zones.map((z: any) => `${z.name}@${z.x},${z.y},${z.w}x${z.h}`))
const move = (p: Page, tx: number, ty: number) => p.evaluate(([x, y]) => (window as any).__po.scene.teleport(x * 16 + 8, y * 16 + 10), [tx, ty])
const connected = (p: Page) => p.evaluate(() => (window as any).__po.scene.debugState().call.filter((c: any) => c.state === 'connected').length)

test('the world owner draws a call zone around the sofa; it becomes its own call', async ({ context }) => {
  const owner = await context.newPage()
  await join(owner, '/?net=local&name=Owner')
  const guest = await context.newPage()
  await join(guest, (await owner.evaluate(() => location.href)).replace('name=Owner', 'name=Guest'))
  // the guest's own browser identity differs from the owner's
  await guest.evaluate(() => localStorage.setItem('po:uid', 'guest-id'))
  await guest.reload(); await guest.waitForFunction(() => (window as any).__po)

  await owner.bringToFront()
  await owner.keyboard.press('KeyB')
  await owner.getByText('Call zones').click()
  // drag a rectangle over the lounge: tiles (7,4) -> (11,8)
  const a = await screenOf(owner, 7, 4), b = await screenOf(owner, 11, 8)
  await owner.mouse.move(a.x, a.y); await owner.mouse.down(); await owner.mouse.move(b.x, b.y, { steps: 5 }); await owner.mouse.up()
  await expect.poll(() => zones(guest)).toContain('Zone 3@7,4,5x5')

  // rename syncs too
  await owner.locator('.zone-row input').last().fill('Lounge couch')
  await owner.locator('.zone-row input').last().press('Enter')
  await expect.poll(() => zones(guest)).toContain('Lounge couch@7,4,5x5')

  // overlapping zones are refused
  const c = await screenOf(owner, 12, 6), d = await screenOf(owner, 15, 8)
  await owner.mouse.move(c.x, c.y); await owner.mouse.down(); await owner.mouse.move(d.x, d.y, { steps: 3 }); await owner.mouse.up()
  expect((await zones(owner)).length).toBe(3)

  // guests can't edit zones
  await guest.bringToFront(); await guest.keyboard.press('KeyB')
  await expect(guest.getByText('Call zones')).toHaveCount(0)

  // sit down on the couch together -> same call; get up and walk out -> call ends
  await owner.keyboard.press('Escape'); await owner.keyboard.press('Escape')
  await move(owner, 7, 6); await move(guest, 11, 6)   // 4 tiles apart, inside the zone
  await expect.poll(() => connected(owner), { timeout: 20_000 }).toBe(1)
  await move(guest, 12, 6)                              // one step outside the zone edge
  await expect.poll(() => connected(owner), { timeout: 10_000 }).toBe(0)
})
