import { expect, test, type Page } from '@playwright/test'
import { debug, move, screenOf, world } from './helpers'

const decorOf = (p: Page, item: string) => p.evaluate((item) => [...(window as any).__po.state.view.decor.values()].filter((d: any) => d.item === item), item)

test('portals: place one, connect it, step on it', async ({ context }) => {
  const [owner] = await world(context, ['Owner'])
  await move(owner, 18, 34); await owner.waitForTimeout(700)
  await owner.keyboard.press('KeyB')
  await owner.locator('.item[title="Portal"]').first().click()
  const pt = await screenOf(owner, 18, 32)
  await owner.mouse.move(pt.x, pt.y); await owner.mouse.click(pt.x, pt.y)
  // placing a new portal opens its settings
  await expect(owner.locator('.objpanel')).toBeVisible()
  await owner.locator('.objpanel select').selectOption({ label: 'Lobby, floor 1' })
  await owner.getByRole('button', { name: 'Connect' }).click()
  await expect.poll(async () => (await decorOf(owner, 'office/portal'))[0]?.cfg?.to).toEqual({ floor: 0, x: 31, y: 32 })
  await owner.keyboard.press('Escape'); await owner.keyboard.press('Escape')
  await expect.poll(() => owner.evaluate(() => (window as any).__po.scene.decorating)).toBe(false)
  // walk onto the pad -> arrive in the lobby
  await move(owner, 18, 33)
  // hold W until we arrive (headless frames can be slower than a short key press)
  await owner.keyboard.down('KeyW')
  await expect.poll(async () => Math.floor((await debug(owner)).me.x / 16), { timeout: 10_000 }).toBe(31)
  await owner.keyboard.up('KeyW')
  expect(Math.floor((await debug(owner)).me.y / 16)).toBeLessThanOrEqual(32)
})

test('whiteboard, notes and TV are shared live', async ({ context }) => {
  const [owner, guest] = await world(context, ['Owner', 'Guest'])
  const tvId = (await decorOf(owner, 'office/tv'))[0].id
  await owner.evaluate(() => (window as any).__po.state.author('decor.set', { id: 'wb1', item: 'office/whiteboard', x: 18, y: 30, f: 'S', floor: 0 }))
  await owner.evaluate(() => (window as any).__po.state.author('decor.set', { id: 'nb1', item: 'cabin/noteboard', x: 21, y: 30, f: 'S', floor: 0 }))

  // guest walks up to the whiteboard and presses E
  await guest.bringToFront()
  await move(guest, 19, 31); await guest.waitForTimeout(700)
  await expect(guest.locator('.use')).toContainText('Whiteboard')
  await guest.keyboard.press('KeyE')
  const canvas = guest.locator('canvas.wb')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  await guest.mouse.move(box.x + 50, box.y + 50); await guest.mouse.down()
  await guest.mouse.move(box.x + 200, box.y + 120, { steps: 6 }); await guest.mouse.up()
  await expect.poll(() => owner.evaluate(() => (window as any).__po.doc.getArray('wb:wb1').length)).toBe(1)
  await guest.keyboard.press('Escape')

  // notes
  await move(guest, 21, 31); await guest.waitForTimeout(500)
  await guest.keyboard.press('KeyE')
  await guest.locator('.objpanel input').fill('Standup at 10!')
  await guest.locator('.objpanel input').press('Enter')
  await expect.poll(() => owner.evaluate(() => (window as any).__po.doc.getArray('notes:nb1').toArray().map((n: any) => n.text))).toEqual(['Standup at 10!'])
  await guest.keyboard.press('Escape')

  // TV: the owner puts a video on, the guest sees the same state and pauses it for everyone
  await owner.bringToFront()
  await owner.evaluate((id) => (window as any).__po.objects.open((window as any).__po.scene.thing(id)), tvId)
  await owner.locator('.objpanel input').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await owner.locator('.objpanel input').press('Enter')
  await guest.evaluate((id) => (window as any).__po.objects.open((window as any).__po.scene.thing(id)), tvId)
  await expect(guest.locator('.objpanel')).toContainText('dQw4w9WgXcQ')
  await expect(guest.locator('.objpanel')).toContainText('Playing')
  await guest.getByRole('button', { name: 'Pause' }).click()
  await expect(owner.locator('.objpanel')).toContainText('Paused')
})

test('video id parsing', async ({ page }) => {
  await page.goto('/?net=local')
  const r = await page.evaluate(async () => {
    const { parseVideoId } = await import('/src/objects/tv.ts')
    return ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'https://example.com/x'].map(parseVideoId)
  })
  expect(r).toEqual(['dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'dQw4w9WgXcQ', null])
})

test('import a custom sprite and place it; other players see it', async ({ context }) => {
  const [owner, guest] = await world(context, ['Owner', 'Guest'])
  const id = await owner.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 24
    const g = c.getContext('2d')!
    ;['#d44c3c', '#2f78b0', '#2f9e5a', '#f2c14e'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 16 + 2, 4, 12, 20) })
    const a = await (window as any).__po.importer.save(c.toDataURL('image/png'), { name: 'Totem', frames: 4, w: 1, d: 1 })
    await (window as any).__po.state.author('decor.set', { id: 'tot', item: 'custom/' + a.id, x: 20, y: 33, f: 'E', floor: 0 })
    return a.id
  })
  await expect.poll(() => guest.evaluate((id) => !!(window as any).__po.scene.defs.get('custom/' + id), id)).toBe(true)
  await expect.poll(() => guest.evaluate(() => (window as any).__po.scene.allThings().some((t: any) => t.id === 'tot'))).toBe(true)
  // the East frame is the second frame of the strip
  const frame = await guest.evaluate((id) => {
    const tex = (window as any).__po.scene.textures.get('cust_' + id)
    return tex.get('E').cutX
  }, id)
  expect(frame).toBe(16)
})
