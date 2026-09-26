import { expect, test, type Page } from '@playwright/test'
import { connected, move, world } from './helpers'

const calls = (p: Page) => p.evaluate(() => (window as any).__po.scene.debugState().call as { id: string; state: string; tracks: { kind: string; muted: boolean; live: boolean }[]; sending: { audio: boolean; video: boolean } }[])
const micOn = (p: Page) => p.evaluate(async () => { await (window as any).__po.call.devices.setMic(true) })
const uid = (p: Page) => p.evaluate(() => (window as any).__po.net.selfId)

test('stage zone: the presenter is heard across the floor; the audience only listens', async ({ context }) => {
  const [host, ann, ben] = await world(context, ['Host', 'Ann', 'Ben'])
  await host.evaluate(async () => {
    const st = (window as any).__po.state
    await st.author('zone.set', { ...st.view.zones.get('library'), stage: true })
  })
  for (const p of [host, ann, ben]) await micOn(p)
  await move(host, 56, 4)      // on stage
  await move(ann, 10, 16)      // corridor, west
  await move(ben, 31, 32)      // lobby: far from Ann, not in a zone
  await expect.poll(() => connected(host), { timeout: 30_000 }).toBe(2)
  await expect.poll(() => connected(ann), { timeout: 30_000 }).toBe(1)
  await expect.poll(() => connected(ben), { timeout: 30_000 }).toBe(1)
  const hostId = await uid(host)
  await expect.poll(async () => (await calls(ann)).find((c) => c.id === hostId)?.tracks.find((t) => t.kind === 'audio')?.muted, { timeout: 15_000 }).toBe(false)
  // …but sends nothing back to the stage, while the presenter sends to the audience
  await expect.poll(async () => (await calls(ann)).find((c) => c.id === hostId)?.sending.audio, { timeout: 15_000 }).toBe(false)
  const annId = await uid(ann)
  await expect.poll(async () => (await calls(host)).find((c) => c.id === annId)?.sending.audio, { timeout: 15_000 }).toBe(true)
  await move(ben, 38, 29)
  await expect.poll(() => connected(ben), { timeout: 15_000 }).toBe(0)
})

test('crowd and stage rules', async ({ page }) => {
  await page.goto('/?net=local')
  const r = await page.evaluate(async () => {
    const m = await import('/src/media/proximity.ts')
    const Z = [{ id: 'stage', name: 'Stage', x: 53, y: 1, w: 8, h: 13, stage: true }, { id: 'cafe', name: 'Cafe', x: 37, y: 28, w: 4, h: 5 }]
    const at = (tx: number, ty: number) => ({ x: tx * 16 + 8, y: ty * 16 + 8 })
    return {
      audience: m.hearing(Z, at(10, 16), at(56, 4), false),
      presenter: m.hearing(Z, at(56, 4), at(10, 16), false),
      otherZone: m.hearing(Z, at(38, 29), at(56, 4), false).want,
      small: m.sendVideo(4, 999_999), crowdQuiet: m.sendVideo(9, 60_000), crowdTalking: m.sendVideo(9, 5_000),
    }
  })
  expect(r.audience).toEqual({ want: true, gain: 1, pan: 0, send: false })
  expect(r.presenter).toEqual({ want: true, gain: 0, pan: 0, send: true })
  expect(r).toMatchObject({ otherZone: false, small: true, crowdQuiet: false, crowdTalking: true })
})
