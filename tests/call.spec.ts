import { expect, test, type Page } from '@playwright/test'

// Four people with fake cameras/mics, peers over the local transport.
const T = 16
const px = (tx: number, ty: number) => [tx * T + 8, ty * T + 10] as const

async function join(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as any).__po, null, { timeout: 20_000 })
}
const move = (p: Page, tx: number, ty: number) => p.evaluate(([x, y]) => (window as any).__po.scene.teleport(x, y), px(tx, ty))
const calls = (p: Page) => p.evaluate(() => (window as any).__po.scene.debugState().call as { id: string; state: string; tracks: { kind: string; muted: boolean; live: boolean }[] }[])
const connectedCount = async (p: Page) => (await calls(p)).filter((c) => c.state === 'connected').length
const mediaOn = (p: Page) => p.evaluate(async () => {
  const d = (window as any).__po.call.devices
  await d.setMic(true); await d.setCam(true)
  return { mic: d.micOn, cam: d.camOn, err: d.error }
})

test('four people hold a video call in the meeting room; walking out cuts it', async ({ context }) => {
  const names = ['Ada', 'Bo', 'Cy', 'Dee']
  const pages: Page[] = []
  const first = await context.newPage()
  await join(first, '/?net=local&name=Ada')
  pages.push(first)
  const url = await first.evaluate(() => location.href)
  for (const n of names.slice(1)) {
    const p = await context.newPage()
    await join(p, url.replace('name=Ada', 'name=' + n))
    pages.push(p)
  }
  // everyone into the meeting room (zone x13-19, y6-11), cameras + mics on
  const seats: [number, number][] = [[13, 6], [19, 6], [13, 11], [19, 11]]
  for (const [i, p] of pages.entries()) {
    expect(await mediaOn(p)).toEqual({ mic: true, cam: true, err: '' })
    await move(p, ...seats[i])
  }
  for (const p of pages) await expect.poll(() => connectedCount(p), { timeout: 30_000 }).toBe(3)

  // everyone receives live, unmuted audio + video from the other three
  for (const p of pages) {
    await expect.poll(async () => (await calls(p)).every((c) =>
      c.tracks.some((t) => t.kind === 'video' && t.live && !t.muted) &&
      c.tracks.some((t) => t.kind === 'audio' && t.live && !t.muted)), { timeout: 20_000 }).toBe(true)
  }
  // the UI shows 3 remote tiles + your own
  await expect(pages[0].locator('.tile')).toHaveCount(4)
  await expect(pages[0].locator('.tile.video')).toHaveCount(4)

  // Dee walks out into the far corner of the common area -> cut from the meeting
  await move(pages[3], 2, 12)
  await expect.poll(() => connectedCount(pages[3]), { timeout: 10_000 }).toBe(0)
  for (const p of pages.slice(0, 3)) await expect.poll(() => connectedCount(p), { timeout: 10_000 }).toBe(2)
  await expect(pages[0].locator('.tile')).toHaveCount(3)

  // Cy leaves too and walks up to Dee: proximity bubble connects just those two
  await move(pages[2], 4, 12)
  await expect.poll(() => connectedCount(pages[3]), { timeout: 15_000 }).toBe(1)
  await expect.poll(() => connectedCount(pages[2]), { timeout: 15_000 }).toBe(1)
  await expect.poll(() => connectedCount(pages[0]), { timeout: 10_000 }).toBe(1)

  // turning the camera off stops sending video but keeps the call
  await pages[2].evaluate(() => (window as any).__po.call.devices.setCam(false))
  await expect.poll(async () => (await calls(pages[3]))[0]?.tracks.find((t) => t.kind === 'video')?.muted, { timeout: 15_000 }).toBe(true)
  expect(await connectedCount(pages[3])).toBe(1)
})

test('proximity rules', async ({ page }) => {
  await page.goto('/?net=local')
  const r = await page.evaluate(async () => {
    const m = await import('/src/media/proximity.ts')
    const Z = m.DEFAULT_ZONES
    const at = (tx: number, ty: number) => ({ x: tx * 16 + 8, y: ty * 16 + 8 })
    return {
      sameZone: m.hearing(Z, at(14, 7), at(19, 11), false),
      acrossWall: m.hearing(Z, at(14, 7), at(12, 7), false),
      near: m.hearing(Z, at(5, 10), at(7, 10), false).want,
      far: m.hearing(Z, at(5, 10), at(11, 10), false).want,
      edgeStays: m.hearing(Z, at(5, 10), at(10, 10), true).want,
      edgeNoNew: m.hearing(Z, at(5, 10), at(10, 10), false).want,
    }
  })
  expect(r.sameZone).toEqual({ want: true, gain: 1, pan: 0 })
  expect(r.acrossWall.want).toBe(false)
  expect(r).toMatchObject({ near: true, far: false, edgeStays: true, edgeNoNew: false })
})
