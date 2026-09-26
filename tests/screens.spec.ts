import { expect, test, type Page } from '@playwright/test'
import { move, world } from './helpers'

const tvId = (p: Page) => p.evaluate(() => [...(window as any).__po.state.view.decor.values()].find((d: any) => d.item === 'office/tv').id)
const openTv = (p: Page, id: string) => p.evaluate((id) => (window as any).__po.objects.open((window as any).__po.scene.thing(id)), id)
const screenConns = (p: Page) => p.evaluate(() => (window as any).__po.screens.mesh.stats().filter((c: any) => c.state === 'connected').length)

test('share a screen onto the TV: people at the TV see it, others don\'t', async ({ context }) => {
  const [host, guest, far] = await world(context, ['Host', 'Guest', 'Far'])
  const tv = await tvId(host) // the lounge TV, inside the "Lounge sofas" zone
  await move(host, 4, 33); await move(guest, 8, 33); await move(far, 45, 31)
  // stand-in for the browser's "choose a tab" dialog: a canvas stream
  await host.evaluate(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 180
      const g = c.getContext('2d')!
      setInterval(() => { g.fillStyle = `hsl(${Date.now() / 10 % 360} 70% 50%)`; g.fillRect(0, 0, 320, 180) }, 50)
      return c.captureStream(15)
    }
  })
  await host.bringToFront()
  await openTv(host, tv)
  await host.locator('.tvtabs .tab', { hasText: 'Share screen' }).click()
  await host.getByRole('button', { name: 'Share a tab or window' }).click()
  await expect.poll(() => guest.evaluate((id) => (window as any).__po.doc.getMap('tv:' + id).get('mode'), tv)).toBe('screen')
  await expect.poll(() => screenConns(host), { timeout: 30_000 }).toBe(1)
  await expect.poll(() => screenConns(guest), { timeout: 30_000 }).toBe(1)
  expect(await screenConns(far)).toBe(0)
  // the guest gets a banner, clicks Watch, and sees live video
  await guest.bringToFront()
  await expect(guest.locator('.tvbanner')).toContainText('sharing their screen')
  await guest.locator('.tvbanner button').click()
  await expect.poll(() => guest.evaluate(() => {
    const v = document.querySelector('.objpanel video') as HTMLVideoElement
    const t = (v?.srcObject as MediaStream | null)?.getVideoTracks()[0]
    return !!t && t.readyState === 'live' && !t.muted
  }), { timeout: 20_000 }).toBe(true)
  // stopping ends it for everyone
  await host.bringToFront()
  await host.getByRole('button', { name: 'Stop sharing' }).click()
  await expect.poll(() => guest.evaluate((id) => (window as any).__po.doc.getMap('tv:' + id).get('mode'), tv)).toBe('off')
  await expect.poll(() => screenConns(guest), { timeout: 10_000 }).toBe(0)
})

test('web page and open-together modes are shared', async ({ context }) => {
  const [host, guest] = await world(context, ['Host', 'Guest'])
  const tv = await tvId(host)
  await move(host, 4, 33); await move(guest, 8, 33)
  await openTv(host, tv)
  await host.locator('.tvtabs .tab', { hasText: 'Web page' }).click()
  await host.locator('.objpanel input').fill('https://www.figma.com/file/abc123/My-design')
  await host.locator('.objpanel input').press('Enter')
  await openTv(guest, tv)
  await expect.poll(() => guest.evaluate(() => (document.querySelector('.objpanel iframe') as HTMLIFrameElement | null)?.src))
    .toContain('https://www.figma.com/embed?embed_host=pixel-office&url=')
  await guest.keyboard.press('Escape')

  await host.locator('.tvtabs .tab', { hasText: 'Open together' }).click()
  await host.locator('.objpanel input').fill('https://github.com/Mjmc99/pixel-office')
  await host.locator('.objpanel input').press('Enter')
  await expect(guest.locator('.tvbanner')).toContainText('github.com')
  await expect(guest.locator('.tvbanner a')).toHaveAttribute('href', 'https://github.com/Mjmc99/pixel-office')
})

test('embed link rewriting', async ({ page }) => {
  await page.goto('/?net=local')
  const r = await page.evaluate(async () => {
    const { embedUrl } = await import('/src/objects/embeds.ts')
    return [
      embedUrl('https://docs.google.com/presentation/d/XYZ/edit#slide=1'),
      embedUrl('https://docs.google.com/document/d/DOC/edit'),
      embedUrl('https://vimeo.com/123456'),
      embedUrl('https://www.loom.com/share/abc123def'),
      embedUrl('https://www.twitch.tv/somechannel', 'example.com'),
      embedUrl('https://excalidraw.com/#room=1'),
      embedUrl('http://insecure.example'),
    ]
  })
  expect(r).toEqual([
    'https://docs.google.com/presentation/d/XYZ/embed',
    'https://docs.google.com/document/d/DOC/preview',
    'https://player.vimeo.com/video/123456',
    'https://www.loom.com/embed/abc123def',
    'https://player.twitch.tv/?channel=somechannel&parent=example.com',
    'https://excalidraw.com/#room=1',
    null,
  ])
})
