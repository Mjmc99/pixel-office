import { expect, test, type Page } from '@playwright/test'
import { connected, debug, drag, join, move, screenOf, world } from './helpers'

const rooms = (p: Page) => p.evaluate(() => (window as any).__po.rooms.list().map((r: any) => `${r.slot}:${r.pending ? 'pending' : 'active'}`))
const roomThings = (p: Page) => p.evaluate(() => (window as any).__po.rooms.things((window as any).__po.scene.floor).map((t: any) => `${t.item}@${t.x},${t.y},${t.f}`).sort())

test('claim an office, decorate it (owner only), zone it, and share it into another world', async ({ context }) => {
  const [alice, bob] = await world(context, ['Alice', 'Bob'])

  // Bob walks into empty office N1 (x1-12, y1-13) and claims it from the Offices panel
  await bob.bringToFront()
  await move(bob, 6, 10); await bob.waitForTimeout(600)
  await bob.getByRole('button', { name: 'Offices' }).click()
  await bob.getByRole('button', { name: /Claim N1/ }).click()
  await expect.poll(() => rooms(alice)).toEqual(['N1:active'])
  await expect.poll(() => roomThings(alice)).toContain('office/desk@2,2,S')

  // Bob decorates inside his office: a sofa at (6,6) facing N
  await bob.keyboard.press('KeyB')
  await bob.locator('.item[title="Sofa"]').click()
  await bob.keyboard.press('KeyR'); await bob.keyboard.press('KeyR')
  const pt = await screenOf(bob, 6, 6)
  await bob.mouse.move(pt.x, pt.y); await bob.mouse.click(pt.x, pt.y)
  await expect.poll(() => roomThings(alice)).toContain('office/sofa@6,6,N')

  // Alice owns the world but can't edit inside Bob's office
  const canAlice = await alice.evaluate(() => {
    const s = (window as any).__po.scene
    return s.canPlaceAt(s.defs.get('office/plant'), 8, 8, 'S')
  })
  expect(canAlice).toBe(false)

  // Bob draws a small zone around his sofa; Alice's copy has it too
  await bob.locator('.tab', { hasText: 'Call zones' }).click()
  await drag(bob, [5, 5], [8, 8])
  await expect.poll(() => alice.evaluate(() => (window as any).__po.scene.zones.filter((z: any) => z.room).map((z: any) => `${z.x},${z.y},${z.w}x${z.h}`).sort()))
    .toEqual(['1,1,12x13', '5,5,4x4'].sort())
  await bob.keyboard.press('Escape'); await bob.keyboard.press('Escape')

  // both sit in Bob's sofa zone -> in a call
  await move(alice, 5, 7); await move(bob, 8, 7)
  await expect.poll(() => connected(alice), { timeout: 20_000 }).toBe(1)

  // Bob shares his office link; Carol opens it in her own, different world
  const link = await bob.evaluate(async () => {
    const r = (window as any).__po.rooms
    return r.shareLink(r.mine()[0], null)
  })
  const carol = await join(await context.newPage(), '/?net=local&name=Carol&profile=Carol#')
  await expect.poll(async () => (await debug(carol)).decor).toBeGreaterThan(50)
  const carolWorld = new URL(await carol.evaluate(() => location.href)).hash.match(/w=([^&]+)/)![1]
  const token = new URL(link).hash.match(/r=([^&]+)/)![1]
  await carol.goto(`/?net=local&name=Carol&profile=Carol#w=${carolWorld}&r=${token}`)
  await carol.waitForFunction(() => (window as any).__po?.scene)
  await expect(carol.locator('.modal:not(.hidden)')).toContainText("Bob's office")
  await carol.getByRole('button', { name: /Add it as office/ }).click()
  await expect.poll(() => rooms(carol)).toEqual(['N1:active'])
  await expect.poll(() => roomThings(carol)).toContain('office/sofa@6,6,N')
  // Carol's world is not Alice's
  expect(carolWorld).not.toBe(new URL(await alice.evaluate(() => location.href)).hash.match(/w=([^&.]+)/)![1])

  // a tampered package (same signature, different contents) is rejected
  const tampered = await carol.evaluate(async (t) => {
    const m = await import('/src/rooms/package.ts')
    const pkg = await m.tokenToPackage(t)
    pkg!.things.push({ id: 'evil', item: 'arcade/neon_sign', x: 3, y: 3, f: 'S' })
    return (window as any).__po.rooms.accept({ ...pkg, ver: 99 })
  }, token)
  expect(tampered).toBe(false)
})

test('approval policy: new offices wait for a moderator', async ({ context }) => {
  const [owner, dee] = await world(context, ['Owner', 'Dee'])
  await owner.evaluate(() => (window as any).__po.state.author('policy', { rooms: 'approval' }))
  await expect.poll(() => dee.evaluate(() => (window as any).__po.state.view.policy.rooms)).toBe('approval')
  await dee.evaluate(async () => {
    const po = (window as any).__po
    const slot = po.scene.plan.slots.find((s: any) => s.id === 'S1')
    await po.rooms.claim(slot, 0, 'Dee')
  })
  await expect.poll(() => rooms(owner)).toEqual(['S1:pending'])
  expect(await roomThings(owner)).toEqual([])
  await owner.evaluate(() => { const r = (window as any).__po.rooms; return r.approve(r.list()[0]) })
  await expect.poll(() => rooms(dee)).toEqual(['S1:active'])
  await expect.poll(() => roomThings(owner)).toContain('office/desk@2,20,S')
})
