import { expect, test } from '@playwright/test'
import { debug, join, world } from './helpers'

test('avatar recipes: legacy ids, garbage and round-trips are all safe', async ({ page }) => {
  await join(page, '/?net=local&name=A&profile=A')
  const r = await page.evaluate(() => {
    const av = (window as any).__po.avatars
    const rand = av.encodeLook(av.randomLook())
    return {
      legacy: av.toRecipe('hana'),
      proto: av.toRecipe('__proto__'),
      junk: av.toRecipe('v1.999.-3.x'),
      notString: av.toRecipe({ evil: 1 }),
      roundTrip: av.encodeLook(av.decodeLook(rand)) === rand,
      sheet: [av.avatarSheet(rand).width, av.avatarSheet(rand).height],
    }
  })
  expect(r.legacy).toMatch(/^v1(\.\d+){13}$/)
  expect(r.proto).toMatch(/^v1(\.\d+){13}$/)
  expect(r.junk).toMatch(/^v1(\.\d+){13}$/)
  expect(r.notString).toMatch(/^v1(\.\d+){13}$/)
  expect(r.roundTrip).toBe(true)
  expect(r.sheet).toEqual([192, 44])
})

test('creator: picking parts changes what other people see', async ({ context }) => {
  const [a, b] = await world(context, ['Ann', 'Ben'])
  await a.getByRole('button', { name: 'Customize' }).click()
  const modal = a.locator('.creator:not(.hidden)')
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: 'Mohawk' }).click()
  await modal.getByRole('button', { name: 'Sunglasses' }).click()
  await modal.getByRole('button', { name: 'Cat ears' }).click()
  await modal.getByRole('button', { name: 'Save' }).click()
  await expect(modal).toBeHidden()
  const mine = await a.evaluate(() => (window as any).__po.scene.callInfo().me.preset)
  const look = await a.evaluate((r) => (window as any).__po.avatars.decodeLook(r), mine)
  expect([look.hair, look.eyewear, look.headwear]).toEqual([6, 3, 4])
  // saved for next visit
  expect(await a.evaluate(() => JSON.parse(localStorage.getItem('po:me:Ann')!).avatar)).toBe(mine)
  // Ben's copy of Ann uses the same recipe texture
  await expect.poll(async () => (await b.evaluate(() => (window as any).__po.scene.callInfo().peers.map((p: any) => p.preset)))).toContain(mine)
  expect((await debug(b)).others?.length ?? 1).toBeGreaterThan(0)
})
