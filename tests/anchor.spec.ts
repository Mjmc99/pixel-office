import { expect, test, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { debug } from './helpers'

// Real peer-to-peer: Trystero over a self-hosted WebSocket relay + WebRTC,
// between separate browser contexts and a Node anchor peer (werift).
const RELAY = 'ws://localhost:8799'
let relay: ChildProcess, anchor: ChildProcess | undefined
const anchorLog: string[] = []

test.beforeAll(async () => {
  relay = spawn('node', ['anchor/relay.mjs', '--port', '8799'], { stdio: 'pipe' })
  await new Promise((r) => setTimeout(r, 800))
})
test.afterAll(() => { relay?.kill(); anchor?.kill() })

async function open(page: Page, q: string) {
  await page.goto(`/?relay=${encodeURIComponent(RELAY)}&${q}`)
  await page.waitForFunction(() => (window as any).__po?.scene, null, { timeout: 30_000 })
  return page
}

test('real P2P over a self-hosted relay; the anchor peer keeps the world online', async ({ browser }) => {
  test.setTimeout(150_000)
  const ctxA = await browser.newContext(), ctxB = await browser.newContext()
  const a = await open(await ctxA.newPage(), 'name=Ann&profile=Ann')
  const hash = new URL(a.url()).hash
  // Ann claims an office so there's a package to keep, too
  await a.evaluate(async () => {
    const po = (window as any).__po
    await po.rooms.claim(po.scene.plan.slots.find((s: any) => s.id === 'S2'), 0, 'Ann')
  })

  // Ben joins from a separate browser profile: they find each other over WebRTC
  const b = await open(await ctxB.newPage(), `name=Ben&profile=Ben${hash}`)
  await expect.poll(async () => (await debug(a)).others.map((o: any) => o.n), { timeout: 60_000 }).toEqual(['Ben'])
  await expect.poll(async () => (await debug(b)).decor, { timeout: 30_000 }).toBeGreaterThan(50)
  expect(await b.evaluate(() => (window as any).__po.net.kind)).toBe('p2p')

  // start the anchor peer for this world
  const data = mkdtempSync(join(tmpdir(), 'anchor-'))
  anchor = spawn('node', ['anchor/anchor.mjs', '--invite', hash, '--relay', RELAY, '--data', data], { stdio: 'pipe' })
  anchor.stdout!.on('data', (d) => anchorLog.push(String(d)))
  anchor.stderr!.on('data', (d) => anchorLog.push(String(d)))
  const worldId = hash.match(/w=([a-z0-9]+)/)![1]
  await expect.poll(() => existsSync(join(data, `${worldId}.yjs`)) && existsSync(join(data, `${worldId}.packages.json`)), { timeout: 60_000 }).toBe(true)
  await expect.poll(() => anchorLog.join(''), { timeout: 30_000 }).toContain('peer joined')
  await a.waitForTimeout(1500)

  // everyone leaves
  await ctxA.close(); await ctxB.close()

  // Cy arrives later with only the invite: the world comes from the anchor
  const ctxC = await browser.newContext()
  const c = await open(await ctxC.newPage(), `name=Cy&profile=Cy${hash}`)
  await expect.poll(async () => (await debug(c)).decor, { timeout: 60_000 }).toBeGreaterThan(50)
  await expect.poll(() => c.evaluate(() => (window as any).__po.rooms.list().length), { timeout: 30_000 }).toBe(1)
  await expect.poll(() => c.evaluate(() => (window as any).__po.rooms.things(0).length), { timeout: 30_000 }).toBeGreaterThan(0)
  // and the owner is still Ann (verified from the signed log, not trusted from the anchor)
  expect(await c.evaluate(() => (window as any).__po.state.view.name)).toBe("Ann's office")
  await ctxC.close()
})
