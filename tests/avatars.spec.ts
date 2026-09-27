import { expect, test } from '@playwright/test'
import { debug, join, world } from './helpers'

test('avatar recipes: legacy ids, garbage and round-trips are all safe', async ({ page }) => {
  await join(page, '/?net=local&name=A&profile=A')
  const r = await page.evaluate(() => {
    const av = (window as any).__po.avatars
    const rand = av.encodeLook(av.suggestLook())
    return {
      legacy: av.toRecipe('hana'),
      proto: av.toRecipe('__proto__'),
      junk: av.toRecipe('v1.999.-3.x'),
      notString: av.toRecipe({ evil: 1 }),
      roundTrip: av.encodeLook(av.decodeLook(rand)) === rand,
      sheet: [av.avatarSheet(rand).width, av.avatarSheet(rand).height],
      v1: av.decodeLook('v1.9.6.0.2.12.0.0.12.12.0.3.4.8'),
    }
  })
  expect(r.legacy).toMatch(/^v2(\.\d+){13}$/)
  expect(r.proto).toMatch(/^v2(\.\d+){13}$/)
  expect(r.junk).toMatch(/^v2(\.\d+){13}$/)
  expect(r.notString).toMatch(/^v2(\.\d+){13}$/)
  expect(r.roundTrip).toBe(true)
  expect(r.sheet).toEqual([192, 46])
  // first-version recipes still load: darkest skin, mohawk, suit, sunglasses, cat ears
  expect([r.v1.skin, r.v1.hair, r.v1.top, r.v1.eyewear, r.v1.hat]).toEqual([255, 6, 2, 3, 8])
})

test('creator: picking parts changes what other people see', async ({ context }) => {
  const [a, b] = await world(context, ['Ann', 'Ben'])
  await a.getByRole('button', { name: 'Customize' }).click()
  const modal = a.locator('.creator:not(.hidden)')
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: 'Head', exact: true }).click()
  await modal.getByRole('button', { name: 'Mohawk' }).click()
  await modal.getByRole('button', { name: 'Sunglasses' }).click()
  await modal.locator('input.cr-skin').fill('200')
  await modal.getByRole('button', { name: 'Hat', exact: true }).click()
  await modal.getByRole('button', { name: 'Cat ears' }).click()
  await modal.getByRole('button', { name: 'Save' }).click()
  await expect(modal).toBeHidden()
  const mine = await a.evaluate(() => (window as any).__po.scene.callInfo().me.preset)
  const look = await a.evaluate((r) => (window as any).__po.avatars.decodeLook(r), mine)
  expect([look.hair, look.eyewear, look.hat, look.skin]).toEqual([6, 3, 8, 200])
  // saved for next visit
  expect(await a.evaluate(() => JSON.parse(localStorage.getItem('po:me:Ann')!).avatar)).toBe(mine)
  // Ben's copy of Ann uses the same recipe texture
  await expect.poll(async () => (await b.evaluate(() => (window as any).__po.scene.callInfo().peers.map((p: any) => p.preset)))).toContain(mine)
  expect((await debug(b)).others?.length ?? 1).toBeGreaterThan(0)
})

test('starters: picking one usually gives you a unique variation', async ({ page }) => {
  await join(page, '/?net=local&name=A&profile=A2')
  await page.getByRole('button', { name: 'Customize' }).click()
  const modal = page.locator('.creator:not(.hidden)')
  const seen = new Set<string>()
  let originals = 0
  const classic = await page.evaluate(() => {
    const av = (window as any).__po.avatars
    return av.encodeLook({ hat: 0, hatColor: 0, skin: 40, hair: 0, hairColor: 1, facial: 0, eyewear: 0, top: 0, topColor: 5, trim: 9, bottom: 0, bottomColor: 6, shoes: 12 })
  })
  // 80% of picks are varied: over 10 picks, 7+ exact originals would happen < 0.1% of the time
  for (let i = 0; i < 10; i++) {
    await modal.locator('[data-starter="Classic"]').click()
    await modal.getByRole('button', { name: 'Save' }).click()
    const r = await page.evaluate(() => (window as any).__po.scene.callInfo().me.preset)
    if (r === classic) originals++
    seen.add(r)
    await page.getByRole('button', { name: 'Customize' }).click()
  }
  expect(originals).toBeLessThan(7)
  expect(seen.size).toBeGreaterThan(3)
  // and you can always go back to the exact starter
  await modal.locator('[data-starter="Classic"]').click()
  const link = modal.locator('.cr-note .linkish')
  if ((await link.textContent()) === 'Use the original') await link.click()
  await modal.getByRole('button', { name: 'Save' }).click()
  expect(await page.evaluate(() => (window as any).__po.scene.callInfo().me.preset)).toBe(classic)
})
