import { expect, test, type Page } from '@playwright/test'
import { debug, move, world } from './helpers'

const setCode = (p: Page, code: { src: string; perms: string[] }) => p.evaluate(async (code) => {
  const po = (window as any).__po
  let pl = po.rooms.mine()[0]
  if (!pl) {
    await po.rooms.claim(po.scene.plan.slots.find((s: any) => s.id === 'N1'), 0, po.scene.deps.me.name)
    pl = po.rooms.mine()[0]
  }
  await po.rooms.edit(pl, (c: any) => { c.code = code })
}, code)
const logs = (p: Page) => p.evaluate(() => (window as any).__po.runner.logs.map((l: any) => `${l.kind}:${l.text}`))
const sample = (p: Page, id: string) => p.evaluate(async (id) => (await import('/src/code/samples.ts')).SAMPLES.find((s) => s.id === id)!.code, id)

test('office code: visitors consent, shared state, panels', async ({ context }) => {
  const [alice, bob] = await world(context, ['Alice', 'Bob'])
  await setCode(bob, await sample(bob, 'welcome'))
  // the owner's own code runs without asking
  await move(bob, 6, 10)
  await expect(bob.locator('.toast')).toContainText('Visitor #1')
  // a visitor gets asked first
  await expect.poll(() => alice.evaluate(() => (window as any).__po.rooms.list().length)).toBe(1)
  await alice.bringToFront()
  await move(alice, 7, 10)
  await expect(alice.locator('.modal:not(.hidden)')).toContainText('has office code')
  await expect(alice.locator('.modal:not(.hidden)')).toContainText('Keep shared state')
  await alice.getByRole('button', { name: 'Run it' }).click()
  await expect(alice.locator('.toast')).toContainText('Visitor #2')
  await expect.poll(() => bob.evaluate(() => { const po = (window as any).__po; return po.doc.getMap('rc:' + po.rooms.mine()[0].owner + ':' + po.rooms.mine()[0].roomId).get('visits') })).toBe(2)

  // switch to tic-tac-toe; Alice plays X from the panel, Bob sees the board
  await setCode(bob, await sample(bob, 'tictactoe'))
  await alice.getByRole('button', { name: 'Always for this office' }).click({ timeout: 10_000 })
  await move(alice, 3, 3) // next to the desk at (2,2)
  await expect(alice.locator('.use')).toContainText('interact')
  await alice.keyboard.press('KeyE')
  const frame = alice.frameLocator('.codepanel iframe')
  await frame.locator('button[data-i="4"]').click()
  await expect.poll(() => bob.evaluate(() => { const po = (window as any).__po; const pl = po.rooms.mine()[0]; return po.doc.getMap('rc:' + pl.owner + ':' + pl.roomId).get('board')?.[4] })).toBe('X')
  await expect(frame.locator('p')).toContainText('O to play')
})

test('office code is sandboxed: no storage, no network, no unapproved calls, runaway loops get killed', async ({ context }) => {
  const [owner] = await world(context, ['Owner'])
  await setCode(owner, {
    perms: ['ui'],
    src: `
      const r = []
      try { indexedDB.open('x'); r.push('idb-open') } catch (e) { r.push('idb-denied') }
      r.push(typeof localStorage === 'undefined' ? 'no-localStorage' : 'HAS-localStorage')
      r.push(typeof document === 'undefined' ? 'no-document' : 'HAS-document')
      r.push(typeof parent === 'undefined' ? 'no-parent' : 'HAS-parent')
      room.log(r.join(','))
      fetch('http://localhost:5174/assets/manifest.json').then(() => room.log('fetch-OK')).catch(() => room.log('fetch-blocked'))
      room.state.set('x', 1)
      room.on('interact', () => { while (true) {} })
    `,
  })
  await move(owner, 3, 3)
  await expect.poll(() => logs(owner)).toContain('log:idb-denied,no-localStorage,no-document,no-parent')
  await expect.poll(() => logs(owner)).toContain('log:fetch-blocked')
  await expect.poll(() => logs(owner)).toContain('error:state.set needs the "state" permission')
  // trigger the infinite loop
  await owner.keyboard.press('KeyE')
  await expect.poll(() => logs(owner), { timeout: 10_000 }).toContain('killed:stopped responding (possible infinite loop)')
  await expect(owner.locator('.toast')).toContainText('Office code stopped')
  // the game kept running the whole time
  const y0 = (await debug(owner)).me.y
  await owner.keyboard.down('KeyS')
  await expect.poll(async () => (await debug(owner)).me.y, { timeout: 5000 }).toBeGreaterThan(y0 + 8)
  await owner.keyboard.up('KeyS')
})
