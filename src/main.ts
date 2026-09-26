import Phaser from 'phaser'
import './style.css'
import { DocSync } from './net/sync'
import { LocalTransport } from './net/local'
import { TrysteroTransport } from './net/trystero'
import type { Transport } from './net/transport'
import { WorldScene } from './scenes/WorldScene'
import { Hud } from './ui/hud'
import { starterLayout } from './world/room'
import type { Manifest, Placed } from './world/types'

/** Invite links look like  …/#w=<worldId>.<secret>  — the part after # never reaches a server. */
function worldFromHash(): { id: string; secret: string; created: boolean } {
  const m = location.hash.match(/w=([a-z0-9]+)\.([A-Za-z0-9_-]+)/)
  if (m) return { id: m[1], secret: m[2], created: false }
  const rand = (n: number) => {
    const a = crypto.getRandomValues(new Uint8Array(n))
    return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  const id = Math.random().toString(36).slice(2, 10)
  const secret = rand(12)
  history.replaceState(null, '', `${location.pathname}${location.search}#w=${id}.${secret}`)
  return { id, secret, created: true }
}

function store<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
export function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage blocked */ }
}

async function boot() {
  const manifest: Manifest = await fetch('assets/manifest.json').then((r) => r.json())
  const world = worldFromHash()
  const params = new URLSearchParams(location.search)
  const net: Transport = params.get('net') === 'local'
    ? new LocalTransport(world.id)
    : new TrysteroTransport(world.id, world.secret)

  const sync = new DocSync(net, world.id)
  await sync.whenLoaded()
  if (world.created && sync.doc.getMap('decor').size === 0) {
    sync.doc.transact(() => {
      const decor = sync.doc.getMap<Placed>('decor')
      starterLayout().forEach((p, i) => decor.set('s' + i, p))
      sync.doc.getMap<string>('room').set('theme', 'office')
    })
  }

  const presets = manifest.avatars.presets
  const me = store('po:me', {
    name: `Guest ${Math.floor(Math.random() * 900 + 100)}`,
    avatar: presets[Math.floor(Math.random() * presets.length)].id,
  })
  if (params.get('name')) me.name = params.get('name')!

  const hud = new Hud(manifest, net, world)
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    pixelArt: true,
    backgroundColor: '#1b1a22',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [],
    callbacks: {
      postBoot: (game) => {
        game.scene.add('world', WorldScene, true, {
          manifest, net, doc: sync.doc, me,
          onReady: (s: WorldScene) => {
            hud.attach(s, (name, avatar) => { s.setMe(name, avatar); save('po:me', { name, avatar }) })
            ;(window as any).__po = { scene: s, net, doc: sync.doc }
          },
        })
      },
    },
  })
}

boot().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">Failed to start: ${String(e)}</pre>`)
  console.error(e)
})
