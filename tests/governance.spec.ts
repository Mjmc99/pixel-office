import { expect, test } from '@playwright/test'
import { connected, debug, move, world } from './helpers'

const view = (p: any) => p.evaluate(() => {
  const v = (window as any).__po.state.view
  return { owner: v.owner, mods: [...v.mods], bans: [...v.bans], decor: v.decor.size, floors: v.floors, policy: v.policy }
})
const me = (p: any) => p.evaluate(() => (window as any).__po.state.me.pub)
const tryDecor = (p: any, id: string) => p.evaluate((id: string) => (window as any).__po.state.author('decor.set', { id, item: 'office/plant', x: 40, y: 16, f: 'S', floor: 0 }), id)

test('ownership, mods, bans and floors are enforced by every peer', async ({ context }) => {
  const [owner, guest] = await world(context, ['Owner', 'Guest'])
  const ownerKey = await me(owner), guestKey = await me(guest)
  expect((await view(guest)).owner).toBe(ownerKey)

  // a guest can't take over the world with a forged genesis
  await guest.evaluate(() => (window as any).__po.state.author('genesis', { nonce: 'xyz', name: 'Mine now' }))
  await owner.waitForTimeout(300)
  expect((await view(owner)).owner).toBe(ownerKey)
  expect((await view(guest)).owner).toBe(ownerKey)

  // policy is mods-only: the guest's furniture is ignored everywhere
  const before = (await view(owner)).decor
  await tryDecor(guest, 'g1')
  await owner.waitForTimeout(300)
  expect((await view(owner)).decor).toBe(before)

  // the owner makes the guest a mod (they verify each other's key via the signed hello)
  await expect.poll(async () => (await debug(owner)).others[0]?.uid).toBe(guestKey)
  await owner.evaluate((k) => (window as any).__po.state.author('role', { target: k, role: 'mod' }), guestKey)
  await expect.poll(async () => (await view(guest)).mods).toEqual([guestKey])
  await tryDecor(guest, 'g2')
  await expect.poll(async () => (await view(owner)).decor).toBe(before + 1)

  // a mod can't ban the owner
  await guest.evaluate((k) => (window as any).__po.state.author('ban', { target: k, on: true }), ownerKey)
  await owner.waitForTimeout(300)
  expect((await view(owner)).bans).toEqual([])

  // they meet in the lounge and talk… then the owner bans the guest
  await move(owner, 10, 34); await move(guest, 12, 34)
  await expect.poll(() => connected(owner), { timeout: 20_000 }).toBe(1)
  await owner.evaluate((k) => (window as any).__po.state.author('role', { target: k, role: 'member' }), guestKey)
  await owner.evaluate((k) => (window as any).__po.state.author('ban', { target: k, on: true }), guestKey)
  await expect(guest.locator('.banned')).toBeVisible()
  await expect.poll(() => connected(owner), { timeout: 10_000 }).toBe(0)
  await expect.poll(async () => (await debug(owner)).others[0]?.visible).toBe(false)

  // floors: add one, the guest (unbanned) takes the elevator and disappears from floor 1
  await owner.evaluate((k) => (window as any).__po.state.author('ban', { target: k, on: false }), guestKey)
  await owner.evaluate(() => (window as any).__po.state.author('floors', { count: 2 }))
  await expect.poll(async () => (await view(guest)).floors).toBe(2)
  await move(guest, 30, 35)
  await guest.bringToFront()
  await expect(guest.locator('.elevator')).toBeVisible()
  await guest.getByRole('button', { name: 'Floor 2' }).click()
  await expect.poll(async () => (await debug(owner)).others[0]?.floor).toBe(1)
  expect((await debug(owner)).others[0].visible).toBe(false)
})
