import { expect, test, type Page } from '@playwright/test'
import { screenOf, settle, world } from './helpers'

const rooms = (p: Page) => p.evaluate(() => (window as any).__po.rooms.list().map((r: any) => `${r.slot}:${r.pending ? 'pending' : 'active'}`))
const roomThings = (p: Page) => p.evaluate(() => (window as any).__po.rooms.things((window as any).__po.scene.floor).map((t: any) => `${t.item}@${t.x},${t.y}`).sort())
const clickTile = async (p: Page, x: number, y: number) => { await settle(p); const s = await screenOf(p, x, y); await p.mouse.move(s.x, s.y); await p.mouse.click(s.x, s.y) }

test('pick a spot on the map, move the office, and restyle only its walls', async ({ context }) => {
  const [alice, bob, carol] = await world(context, ['Alice', 'Bob', 'Carol'])
  await bob.bringToFront()

  // new office from anywhere: the map opens, Bob clicks the free small office S2 (x10-17, y19-24)
  await bob.getByRole('button', { name: 'Offices' }).click()
  await bob.getByRole('button', { name: /New office: pick a spot/ }).click()
  await expect(bob.locator('.pickbar')).toBeVisible()
  expect(await bob.evaluate(() => (window as any).__po.scene.picking)).toBe(true)
  await clickTile(bob, 13, 21)
  await expect.poll(() => rooms(alice)).toEqual(['S2:active'])
  await expect(bob.locator('.pickbar')).toBeHidden()
  await expect.poll(() => roomThings(alice)).toContain('office/desk@11,20')

  // Move it: a large slot doesn't fit a small office, a small one does; the furniture comes along
  await bob.getByRole('button', { name: 'Offices' }).click()
  await bob.getByRole('button', { name: 'Move…' }).click()
  await clickTile(bob, 6, 6) // N1 is large: refused, still picking
  expect(await bob.evaluate(() => (window as any).__po.scene.picking)).toBe(true)
  await clickTile(bob, 40, 21) // S3 (x37-44; S slots skip the hall)
  await expect.poll(() => rooms(alice)).toEqual(['S3:active'])
  await expect.poll(() => roomThings(alice)).toContain('office/desk@38,20')

  // Esc cancels picking and puts you back where you were
  await bob.getByRole('button', { name: 'Offices' }).click()
  const before = await bob.evaluate(() => (window as any).__po.scene.meTile())
  await bob.getByRole('button', { name: 'Move…' }).click()
  await bob.keyboard.press('Escape')
  expect(await bob.evaluate(() => (window as any).__po.scene.picking)).toBe(false)
  expect(await bob.evaluate(() => (window as any).__po.scene.meTile())).toEqual(before)
  expect(await rooms(alice)).toEqual(['S3:active'])

  // Decorate > My office: pick Sci-Fi walls — only Bob's office changes
  await bob.keyboard.press('KeyB')
  await bob.locator('.tab', { hasText: 'My office' }).click()
  await bob.locator('.swatch[data-wall="scifi"]').click()
  await expect.poll(() => alice.evaluate(() => {
    const r = (window as any).__po.rooms
    return r.pkgFor(r.list()[0])?.wallStyle
  })).toBe('scifi')
  // the wall above S3 is drawn with the scifi atlas, a wall elsewhere is not
  const atlasAt = (x: number, y: number) => alice.evaluate(([x, y]) => {
    const s = (window as any).__po.scene
    return s.structure.find((o: any) => o.type === 'Image' && o.x === x * 16 && o.y === (y + 1) * 16)?.texture.key
  }, [x, y])
  await expect.poll(() => atlasAt(38, 18)).toBe('scifi')
  expect(await atlasAt(11, 18)).toBe('office')

  // a guest can't move Bob's office (the op is ignored by everyone)
  await carol.evaluate(async () => {
    const po = (window as any).__po
    const pl = po.rooms.list()[0]
    await po.state.author('room.move', { from: { slot: pl.slot, floor: 0 }, to: { slot: 'S1', floor: 0 } })
  })
  await bob.waitForTimeout(500)
  expect(await rooms(bob)).toEqual(['S3:active'])
})
