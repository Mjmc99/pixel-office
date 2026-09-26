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
  await expect.poll(async () => Math.abs((await debug(b)).others[0].y - after.y), { timeout: 5000 }).toBeLessThan(2)

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
