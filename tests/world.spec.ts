import { expect, test, type Page } from '@playwright/test'

// Uses the in-browser LocalTransport (?net=local): tabs of one browser act as peers.
async function open(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as any).__po, null, { timeout: 20_000 })
}
const state = (p: Page) => p.evaluate(() => (window as any).__po.scene.debugState())
const tileToScreen = (p: Page, tx: number, ty: number) => p.evaluate(([x, y]) => {
  const c = (window as any).__po.scene.cameras.main
  return { x: (x * 16 + 8 - c.worldView.x) * c.zoom, y: (y * 16 + 8 - c.worldView.y) * c.zoom }
}, [tx, ty])

test('two peers see each other move, chat, and share furniture', async ({ context }) => {
  const a = await context.newPage()
  await open(a, '/?net=local&name=Alice')
  const b = await context.newPage()
  await open(b, (await a.evaluate(() => location.href)).replace('name=Alice', 'name=Bob'))

  // presence
  await expect.poll(async () => (await state(a)).others.map((o: any) => o.n)).toEqual(['Bob'])
  await expect.poll(async () => (await state(b)).others.map((o: any) => o.n)).toEqual(['Alice'])

  // world doc synced to the late joiner
  expect((await state(b)).decor).toBe((await state(a)).decor)

  // movement
  await a.bringToFront()
  await a.evaluate(() => (window as any).__po.scene.teleport(4 * 16 + 8, 11 * 16 + 10))
  const before = (await state(a)).me
  await a.keyboard.down('KeyW'); await a.waitForTimeout(600); await a.keyboard.up('KeyW')
  const after = (await state(a)).me
  expect(after.y).toBeLessThan(before.y - 10)
  await expect.poll(async () => Math.abs((await state(b)).others[0].y - after.y), { timeout: 5000 }).toBeLessThan(2)

  // chat
  await b.bringToFront()
  await b.keyboard.press('Enter'); await b.keyboard.type('hello'); await b.keyboard.press('Enter')
  await expect.poll(async () => (await state(a)).others[0].said).toBe('hello')

  // decorate: pick, rotate twice (S -> E -> N), place; peer receives the facing
  await a.bringToFront()
  await a.keyboard.press('KeyB')
  await a.getByText('Cozy Cabin').click()
  await a.locator('.item[title="Armchair"]').click()
  await a.keyboard.press('KeyR'); await a.keyboard.press('KeyR')
  const pt = await tileToScreen(a, 3, 8)
  await a.mouse.move(pt.x, pt.y); await a.mouse.click(pt.x, pt.y)
  await expect.poll(() => b.evaluate(() => {
    const out: any[] = []
    ;(window as any).__po.doc.getMap('decor').forEach((v: any) => { if (v.item === 'cabin/armchair') out.push(v) })
    return out.map((v) => `${v.x},${v.y},${v.f}`)
  })).toEqual(['3,8,N'])
})

test('cannot place furniture on top of other furniture or walls', async ({ page }) => {
  await open(page, '/?net=local')
  const ok = await page.evaluate(async () => {
    const { canPlace } = await import('/src/world/room.ts')
    const s = (window as any).__po.scene
    const desk = s.defs.get('office/desk')
    const placed = s.readDecor()
    return {
      onWall: canPlace(desk, 0, 5, 'S', placed, s.defs),
      onDesk: canPlace(desk, 2, 2, 'S', placed, s.defs),
      free: canPlace(desk, 3, 8, 'E', placed, s.defs),
    }
  })
  expect(ok).toEqual({ onWall: false, onDesk: false, free: true })
})
