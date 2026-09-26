import Phaser from 'phaser'
import './style.css'
import { DocSync } from './net/sync'
import { LocalTransport } from './net/local'
import { TrysteroTransport } from './net/trystero'
import type { Transport } from './net/transport'
import { WorldScene } from './scenes/WorldScene'
import { Hud } from './ui/hud'
import { Call } from './media/call'
import { loadIdentity, profile } from './world/crypto'
import { WorldState } from './world/state'
import { STARTER_DECOR, STARTER_ZONES } from './world/starter'
import type { Manifest } from './world/types'

/**
 * Invite links look like  …/#w=<worldId>.<secret>  — the part after # never
 * reaches a server. The world id is derived from the creator's public key,
 * which is what makes ownership verifiable without a server.
 */
function parseHash() {
  const m = location.hash.match(/w=([a-z0-9]+)\.([A-Za-z0-9_-]+)/)
  return m ? { id: m[1], secret: m[2] } : null
}

function randomSecret() {
  const a = crypto.getRandomValues(new Uint8Array(12))
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function store<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
export function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage blocked */ }
}

async function boot() {
  const manifest: Manifest = await fetch('assets/manifest.json').then((r) => r.json())
  const identity = await loadIdentity()
  const params = new URLSearchParams(location.search)

  let world = parseHash()
  let nonce: string | null = null
  if (!world) {
    const w = WorldState.newWorldId(identity.pub)
    world = { id: w.id, secret: randomSecret() }
    nonce = w.nonce
    history.replaceState(null, '', `${location.pathname}${location.search}#w=${world.id}.${world.secret}`)
  }

  const net: Transport = params.get('net') === 'local'
    ? new LocalTransport(world.id)
    : new TrysteroTransport(world.id, world.secret, store<RTCIceServer[] | undefined>('po:turn', undefined))

  const sync = new DocSync(net, world.id)
  await sync.whenLoaded()
  const state = new WorldState(sync.doc, identity, world.id)
  await state.refresh()

  const presets = manifest.avatars.presets
  const meKey = 'po:me' + (profile() ? ':' + profile() : '')
  const me = store(meKey, {
    name: `Guest ${Math.floor(Math.random() * 900 + 100)}`,
    avatar: presets[Math.floor(Math.random() * presets.length)].id,
  })
  if (params.get('name')) me.name = params.get('name')!

  if (nonce) {
    await state.authorMany([
      { t: 'genesis', p: { nonce, name: `${me.name}'s office` } },
      ...STARTER_ZONES.map((z) => ({ t: 'zone.set', p: { ...z, floor: 0 } })),
      ...STARTER_DECOR.map(([item, x, y, f], i) => ({ t: 'decor.set', p: { id: 's' + i, item, x, y, f: f ?? 'S', floor: 0 } })),
    ])
  }

  const call = new Call(net, store<RTCIceServer[] | undefined>('po:turn', undefined))
  const hud = new Hud(manifest, net, world, call, state)
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    pixelArt: true,
    backgroundColor: '#141319',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [],
    callbacks: {
      postBoot: (game) => {
        game.scene.add('world', WorldScene, true, {
          manifest, net, call, state, me,
          onReady: (s: WorldScene) => {
            hud.attach(s, (name, avatar) => { s.setMe(name, avatar); save(meKey, { name, avatar }) })
            ;(window as any).__po = { scene: s, net, doc: sync.doc, call, state }
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
