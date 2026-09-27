import { expect, test, type Page } from '@playwright/test'
import { debug, move, world } from './helpers'

const layoutOf = (p: Page, f = 0) => p.evaluate((f) => (window as any).__po.state.view.layouts.get(f) ?? 'building', f)

test('every preset piece exists and fits its floor', async ({ context }) => {
  const page = (await world(context, ['Solo']))[0]
  const problems = await page.evaluate(async () => {
    const { LAYOUTS } = await import('/src/world/layouts.ts')
    const { planFor, isWallTile, slotAt, inside } = await import('/src/world/building.ts')
    const { canPlace } = await import('/src/world/room.ts')
    const s = (window as any).__po.scene
    const out: string[] = []
    for (const l of LAYOUTS) {
      const plan = planFor(l.id)
      const placed: any[] = []
      for (const [item, x, y, f = 'S'] of l.decor) {
        const def = s.defs.get(item)
        if (!def) { out.push(`${l.id}: unknown ${item}`); continue }
        const blocked = (tx: number, ty: number) => isWallTile(plan, tx, ty) || !!slotAt(plan, tx, ty) || inside(plan.elevator, tx, ty)
        if (!canPlace(def, x, y, f, placed, s.defs, blocked)) out.push(`${l.id}: ${item} at ${x},${y} ${f}`)
        placed.push({ id: String(placed.length), item, x, y, f })
      }
      for (const z of l.zones) if (z.x < 1 || z.y < 1 || z.x + z.w >= plan.w || z.y + z.h >= plan.h) out.push(`${l.id}: zone ${z.id}`)
    }
    return out
  })
  expect(problems).toEqual([])
})

test('owner turns a floor into a starship; offices re-home; guests follow', async ({ context }) => {
  const [owner, guest] = await world(context, ['Owner', 'Guest'])

  // the guest has a large office N1 on the building floor
  await guest.evaluate(async () => {
    const po = (window as any).__po
    await po.rooms.claim(po.scene.plan.slots.find((s: any) => s.id === 'N1'), 0, 'Guest')
  })
  await expect.poll(() => owner.evaluate(() => (window as any).__po.rooms.list().length)).toBe(1)

  // owner: Settings > Floors > change layout > Starship > confirm
  await owner.bringToFront()
  await owner.getByRole('button', { name: 'Settings' }).click()
  await owner.getByRole('button', { name: /change layout/ }).click()
  await owner.locator('.layout-card[data-layout="starship"]').click()
  await owner.getByRole('button', { name: /Make it a starship/ }).click()

  await expect.poll(() => layoutOf(guest)).toBe('starship')
  // the floor is now the ship: its preset furniture and zones, nothing from the building
  await expect.poll(async () => (await debug(guest)).decor).toBeGreaterThan(40)
  const items = await guest.evaluate(() => [...(window as any).__po.state.view.decor.values()].map((d: any) => d.item.split('/')[0]))
  expect(new Set(items)).toEqual(new Set(['starship']))
  expect(await guest.evaluate(() => (window as any).__po.scene.zones.map((z: any) => z.name).sort())).toEqual(['Bridge', 'Engine room', 'Mess hall'])
  // the large office didn't fit a small cabin: it left the floor, and its owner can place it again
  expect(await guest.evaluate(() => (window as any).__po.rooms.list().length)).toBe(0)
  expect(await guest.evaluate(() => (window as any).__po.rooms.myUnplaced().length)).toBe(1)
  // the guest was moved onto the ship (not stuck in a wall) and can claim a cabin
  const t = await guest.evaluate(() => (window as any).__po.scene.meTile())
  expect(await guest.evaluate(([x, y]) => (window as any).__po.scene.plan.tiles[y * (window as any).__po.scene.plan.w + x], [t.x, t.y])).toBe(1)
  await guest.evaluate(async () => {
    const po = (window as any).__po
    await po.rooms.claim(po.scene.plan.slots.find((s: any) => s.id === 'C2'), 0, 'Guest')
  })
  await expect.poll(() => owner.evaluate(() => (window as any).__po.rooms.list().map((r: any) => r.slot))).toEqual(['C2'])

  // guests can't change layouts (the op is ignored everywhere)
  await guest.evaluate(() => (window as any).__po.state.author('layout', { floor: 0, layout: 'tavern' }))
  await owner.waitForTimeout(500)
  expect(await layoutOf(owner)).toBe('starship')

  // a second floor as the D&D hall: no offices at all
  await owner.evaluate(async () => {
    const po = (window as any).__po
    const { layoutOps } = await import('/src/world/layouts.ts')
    await po.state.author('floors', { count: 2 })
    await po.state.authorMany(layoutOps('tavern', 1))
  })
  await expect.poll(() => layoutOf(guest, 1)).toBe('tavern')
  expect(await guest.evaluate(() => { const po = (window as any).__po; po.scene.goFloor(1); return po.scene.plan.slots.length })).toBe(0)
  await move(guest, 14, 12)
  expect(await guest.evaluate(() => (window as any).__po.scene.debugState().zone)).toBeTruthy()
})
