import { expect, test, type Page } from '@playwright/test'
import { connected, move, world } from './helpers'

const calls = (p: Page) => p.evaluate(() => (window as any).__po.scene.debugState().call as { id: string; state: string; tracks: { kind: string; muted: boolean; live: boolean }[] }[])
const mediaOn = (p: Page) => p.evaluate(async () => {
  const d = (window as any).__po.call.devices
  await d.setMic(true); await d.setCam(true)
  return { mic: d.micOn, cam: d.camOn, err: d.error }
})

test('four people hold a video call in the library zone; walking out cuts it', async ({ context }) => {
  const pages = await world(context, ['Ada', 'Bo', 'Cy', 'Dee'])
  const seats: [number, number][] = [[53, 4], [60, 4], [53, 11], [58, 12]] // library zone x53-60, y1-13
  for (const [i, p] of pages.entries()) {
    expect(await mediaOn(p)).toEqual({ mic: true, cam: true, err: '' })
    await move(p, ...seats[i])
  }
  for (const p of pages) await expect.poll(() => connected(p), { timeout: 30_000 }).toBe(3)
  for (const p of pages) {
    await expect.poll(async () => (await calls(p)).every((c) =>
      c.tracks.some((t) => t.kind === 'video' && t.live && !t.muted) &&
      c.tracks.some((t) => t.kind === 'audio' && t.live && !t.muted)), { timeout: 20_000 }).toBe(true)
  }
  await expect(pages[0].locator('.tile')).toHaveCount(4)
  await expect(pages[0].locator('.tile.video')).toHaveCount(4)

  // Dee walks out into the corridor -> cut from the library call
  await move(pages[3], 40, 16)
  await expect.poll(() => connected(pages[3]), { timeout: 10_000 }).toBe(0)
  for (const p of pages.slice(0, 3)) await expect.poll(() => connected(p), { timeout: 10_000 }).toBe(2)

  // Cy leaves too and walks up to Dee: the proximity bubble connects just those two
  await move(pages[2], 43, 16)
  await expect.poll(() => connected(pages[3]), { timeout: 15_000 }).toBe(1)
  await expect.poll(() => connected(pages[2]), { timeout: 15_000 }).toBe(1)
  await expect.poll(() => connected(pages[0]), { timeout: 10_000 }).toBe(1)

  // camera off: video stops, call stays
  await pages[2].evaluate(() => (window as any).__po.call.devices.setCam(false))
  await expect.poll(async () => (await calls(pages[3]))[0]?.tracks.find((t) => t.kind === 'video')?.muted, { timeout: 15_000 }).toBe(true)
  expect(await connected(pages[3])).toBe(1)
})

test('proximity rules', async ({ page }) => {
  await page.goto('/?net=local')
  const r = await page.evaluate(async () => {
    const m = await import('/src/media/proximity.ts')
    const Z = [{ id: 'lib', name: 'Library', x: 53, y: 1, w: 8, h: 13 }]
    const at = (tx: number, ty: number) => ({ x: tx * 16 + 8, y: ty * 16 + 8 })
    return {
      sameZone: m.hearing(Z, at(54, 2), at(60, 12), false),
      acrossWall: m.hearing(Z, at(54, 12), at(54, 16), false),
      near: m.hearing(Z, at(5, 16), at(7, 16), false).want,
      far: m.hearing(Z, at(5, 16), at(11, 16), false).want,
      edgeStays: m.hearing(Z, at(5, 16), at(10, 16), true).want,
      edgeNoNew: m.hearing(Z, at(5, 16), at(10, 16), false).want,
    }
  })
  expect(r.sameZone).toEqual({ want: true, gain: 1, pan: 0, send: true })
  expect(r.acrossWall.want).toBe(false)
  expect(r).toMatchObject({ near: true, far: false, edgeStays: true, edgeNoNew: false })
})
