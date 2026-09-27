import { expect, type BrowserContext, type Page } from '@playwright/test'

/** Open a page and wait until the world scene is up. */
export async function join(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as any).__po?.scene, null, { timeout: 20_000 })
  return page
}

/** Create a world as `owner` and bring in guests, each with their own identity (profile). */
export async function world(context: BrowserContext, names: string[]) {
  const [first, ...rest] = names
  const owner = await join(await context.newPage(), `/?net=local&name=${first}&profile=${first}`)
  const href = await owner.evaluate(() => location.href)
  const hash = new URL(href).hash
  const pages = [owner]
  for (const n of rest) pages.push(await join(await context.newPage(), `/?net=local&name=${n}&profile=${n}${hash}`))
  // everyone has the owner's world log
  for (const p of pages) await expect.poll(() => debug(p).then((d) => d.decor), { timeout: 15_000 }).toBeGreaterThan(50)
  return pages
}

export const debug = (p: Page) => p.evaluate(() => (window as any).__po.scene.debugState())
export const move = (p: Page, tx: number, ty: number) =>
  p.evaluate(([x, y]) => (window as any).__po.scene.teleport(x * 16 + 8, y * 16 + 10), [tx, ty])
export const screenOf = (p: Page, tx: number, ty: number) =>
  p.evaluate(([x, y]) => (window as any).__po.scene.tileToScreen(x, y), [tx, ty])
export const connected = (p: Page) =>
  p.evaluate(() => (window as any).__po.scene.debugState().call.filter((c: any) => c.state === 'connected').length)
/** Wait until the camera has stopped gliding (tile -> screen mapping is stable). */
export async function settle(p: Page) {
  let last = ''
  await expect.poll(async () => {
    const { x, y } = await screenOf(p, 0, 0)
    const now = `${Math.round(x)},${Math.round(y)}`
    const same = now === last
    last = now
    return same
  }, { intervals: [150], timeout: 10_000 }).toBe(true)
}
export async function drag(p: Page, a: [number, number], b: [number, number]) {
  await settle(p)
  const s = await screenOf(p, ...a), e = await screenOf(p, ...b)
  await p.mouse.move(s.x, s.y); await p.mouse.down(); await p.mouse.move(e.x, e.y, { steps: 4 }); await p.mouse.up()
}
