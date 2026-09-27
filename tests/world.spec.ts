import { expect, test } from '@playwright/test'
import { debug, move, screenOf, world } from './helpers'

test('two peers see each other move, chat, and share furniture', async ({ context }) => {
  const [a, b] = await world(context, ['Alice', 'Bob'])
  await expect.poll(async () => (await debug(a)).others.map((o: any) => o.n)).toEqual(['Bob'])
  await expect.poll(async () => (await debug(b)).others.map((o: any) => o.n)).toEqual(['Alice'])

  // movement in the lounge
  await a.bringToFront()
  await move(a, 10, 34)
  const before = (await debug(a)).me
  await a.keyboard.down('KeyW')
  await expect.poll(async () => (await debug(a)).me.y, { timeout: 10_000 }).toBeLessThan(before.y - 10)
  await a.keyboard.up('KeyW')
  await a.waitForTimeout(200)
  const after = (await debug(a)).me
  await expect.poll(async () => Math.abs((await debug(b)).others[0].ty - after.y), { timeout: 5000 }).toBeLessThan(1)

  // chat
  await b.bringToFront()
  await b.keyboard.press('Enter'); await b.keyboard.type('hello'); await b.keyboard.press('Enter')
  await expect.poll(async () => (await debug(a)).others[0].said).toBe('hello')

  // decorate as owner: pick, rotate twice (S -> E -> N), place; the peer receives the signed op
  await a.bringToFront()
  await a.keyboard.press('KeyB')
  await a.getByText('Cozy Cabin').click()
  await a.locator('.item[title="Armchair"]').click()
  await a.keyboard.press('KeyR'); await a.keyboard.press('KeyR')
  const pt = await screenOf(a, 18, 33)
  await a.mouse.move(pt.x, pt.y); await a.mouse.click(pt.x, pt.y)
  await expect.poll(() => b.evaluate(() => [...(window as any).__po.state.view.decor.values()]
    .filter((d: any) => d.item === 'cabin/armchair' && d.x === 18).map((d: any) => `${d.x},${d.y},${d.f}`))).toEqual(['18,33,N'])
})

test('placement rules: walls, other furniture, offices', async ({ context }) => {
  const [a] = await world(context, ['Owner'])
  const r = await a.evaluate(() => {
    const s = (window as any).__po.scene
    const desk = s.defs.get('office/desk')
    return {
      onWall: s.canPlaceAt(desk, 0, 30, 'S'),
      onDesk: s.canPlaceAt(desk, 30, 28, 'S'),
      inEmptyOffice: s.canPlaceAt(desk, 5, 5, 'S'),
      onElevator: s.canPlaceAt(desk, 30, 35, 'S'),
      free: s.canPlaceAt(desk, 18, 33, 'E'),
    }
  })
  expect(r).toEqual({ onWall: false, onDesk: false, inEmptyOffice: false, onElevator: false, free: true })
})

test('snap to grid can be turned off: pieces keep a pixel offset, peers see it', async ({ context }) => {
  const [a, b] = await world(context, ['Owner', 'Guest'])
  await a.bringToFront()
  await move(a, 20, 33)
  await a.keyboard.press('KeyB')
  await a.getByText('Cozy Cabin').click()
  await a.locator('.item[title="Armchair"]').click()
  await expect(a.locator('.snap')).toContainText('Snap: on')
  await a.locator('.snap').click()
  await expect(a.locator('.snap')).toContainText('Snap: off')
  // aim a third of a tile right of and below a tile centre
  const c0 = await screenOf(a, 21, 34), c1 = await screenOf(a, 22, 35)
  const x = c0.x + (c1.x - c0.x) / 3, y = c0.y + (c1.y - c0.y) / 3
  await a.mouse.move(x, y); await a.mouse.move(x + 1, y + 1); await a.mouse.click(x + 1, y + 1)
  // the starter layout already has armchairs; look for the one with an offset
  const placed = () => b.evaluate(() => [...(window as any).__po.state.view.decor.values()]
    .filter((d: any) => d.item === 'cabin/armchair' && (d.ox || d.oy)).map((d: any) => ({ ox: d.ox ?? 0, oy: d.oy ?? 0 })))
  await expect.poll(async () => (await placed()).length).toBe(1)
  const [{ ox, oy }] = await placed()
  expect(Math.abs(ox) + Math.abs(oy)).toBeGreaterThan(2)
  expect(Math.abs(ox)).toBeLessThanOrEqual(8)
  expect(Math.abs(oy)).toBeLessThanOrEqual(8)
  // the setting is remembered, and G flips it back
  expect(await a.evaluate(() => localStorage.getItem('po:snap'))).toBe('0')
  await a.keyboard.press('KeyG')
  await expect(a.locator('.snap')).toContainText('Snap: on')
})
