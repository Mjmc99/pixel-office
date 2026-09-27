import { decodeLook, encodeLook, suggestLook, toRecipe } from './avatars/parts'
import { avatarSheet, avatarThumb } from './avatars/avatars'
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
import { Rooms } from './rooms/rooms'
import { tokenToPackage } from './rooms/package'
import { OfficePanel } from './ui/offices'
import { ObjectPanels } from './objects/panels'
import { Importer } from './objects/importer'
import { CodeRunner } from './code/runner'
import { CodeEditor } from './code/editor'
import { kindOf } from './scenes/WorldScene'
import { Screens } from './objects/screens'

/**
 * Invite links look like  …/#w=<worldId>.<secret>  — the part after # never
 * reaches a server. The world id is derived from the creator's public key,
 * which is what makes ownership verifiable without a server.
 */
function parseHash() {
  const m = location.hash.match(/w=([a-z0-9]+)\.([A-Za-z0-9_-]+)/)
  return m ? { id: m[1], secret: m[2] } : null
}
const roomToken = () => location.hash.match(/r=([A-Za-z0-9_-]+)/)?.[1] ?? null

interface Recent { id: string; secret: string; name: string; t: number }

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
  const token = roomToken()
  const recents = store<Recent[]>('po:recent', [])
  // an office link without a world: open it in the last world you visited
  if (!world && token && recents.length) {
    world = { id: recents[0].id, secret: recents[0].secret }
    history.replaceState(null, '', `${location.pathname}${location.search}#w=${world.id}.${world.secret}&r=${token}`)
  }
  if (!world) {
    const w = WorldState.newWorldId(identity.pub)
    world = { id: w.id, secret: randomSecret() }
    nonce = w.nonce
    history.replaceState(null, '', `${location.pathname}${location.search}#w=${world.id}.${world.secret}${token ? `&r=${token}` : ''}`)
  }

  // network settings (Settings > Network); ?relay=wss://… overrides for one visit
  const turn = store<RTCIceServer[]>('po:turn', [])
  const relayOnly = store<boolean>('po:relayOnly', false)
  const relay = params.get('relay') ?? store<string>('po:relay', '') ?? ''
  const net: Transport = params.get('net') === 'local'
    ? new LocalTransport(world.id)
    : new TrysteroTransport(world.id, world.secret, { turn, relay: relay || null, relayOnly })

  const sync = new DocSync(net, world.id)
  await sync.whenLoaded()
  const state = new WorldState(sync.doc, identity, world.id)
  await state.refresh()
  const rooms = new Rooms(net, state)
  await rooms.init()
  const w = world
  const remember = () => save('po:recent', [{ id: w.id, secret: w.secret, name: state.view.name, t: Date.now() },
    ...recents.filter((r) => r.id !== w.id)].slice(0, 10))
  state.onChange.on(remember)

  const meKey = 'po:me' + (profile() ? ':' + profile() : '')
  const me = store(meKey, {
    name: `Guest ${Math.floor(Math.random() * 900 + 100)}`,
    avatar: encodeLook(suggestLook()),
  })
  if (params.get('name')) me.name = params.get('name')!
  me.avatar = toRecipe(me.avatar)

  if (nonce) {
    await state.authorMany([
      { t: 'genesis', p: { nonce, name: `${me.name}'s office` } },
      ...STARTER_ZONES.map((z) => ({ t: 'zone.set', p: { ...z, floor: 0 } })),
      ...STARTER_DECOR.map(([item, x, y, f], i) => ({ t: 'decor.set', p: { id: 's' + i, item, x, y, f: f ?? 'S', floor: 0 } })),
    ])
  }

  const call = new Call(net, turn, relayOnly)
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
            // offices (phase 3)
            s.extraThings = (f) => rooms.things(f)
            s.extraZones = (f) => rooms.zones(f)
            s.structureSig = (f) => rooms.structureSig(f)
            s.slotInfo = (slot, f) => {
              const pl = rooms.placementAt(slot, f)
              if (!pl) return null
              const pkg = rooms.pkgFor(pl)
              return { style: pkg?.floorStyle ?? 'office', wall: pkg?.wallStyle ?? null, label: pkg?.name ?? `${pl.name} (loading…)`, pending: pl.pending || !pkg }
            }
            s.roomEditHook = {
              canEditAt: (x, y, f) => !!rooms.myPlacementAt(x, y, f),
              set: (t) => rooms.setThing(t),
              del: (id) => rooms.delThing(id),
            }
            s.roomZoneHook = {
              canZone: (f) => rooms.onFloor(f).some((p) => p.owner === state.me.pub && !p.pending),
              add: (r, f) => rooms.addZone(r, f),
              del: (id) => rooms.delZone(id),
              rename: (id, n) => rooms.renameZone(id, n),
            }
            s.customAssets = (f) => [...((state.view.ext.get('assets') ?? new Map()) as Map<string, any>).values(), ...rooms.assets(f)]
            rooms.onChange.on(() => s.rebuild())
            s.rebuild()
            hud.attach(s, (name, avatar) => { s.setMe(name, avatar); save(meKey, { name, avatar }) })
            const offices = new OfficePanel(hud, s, rooms, state, () => `${w.id}.${w.secret}`)
            const screens = new Screens(net, turn, relayOnly)
            const objects = new ObjectPanels(hud, s, sync.doc, state, rooms, screens)
            const importer = new Importer(hud, s, state, rooms)
            const runner = new CodeRunner(hud, s, rooms, state, sync.doc, net)
            const editor = new CodeEditor(hud, rooms, runner)
            offices.onEditCode = (pl) => editor.open(pl)
            s.extraInteractable = (t) => runner.active && t.source === 'room'
            s.onInteract = (t) => { if (kindOf(t.item)) objects.open(t); else runner.interact(t) }
            hud.onOffices = () => offices.toggle()
            if (token) void tokenToPackage(token).then((pkg) => pkg && offices.prompt(pkg))
            // links opened in an already-running tab only change the #fragment
            window.addEventListener('hashchange', () => {
              const next = parseHash()
              if (next && next.id !== w.id) return location.reload()
              const t = roomToken()
              if (t) void tokenToPackage(t).then((pkg) => pkg && offices.prompt(pkg))
            })
            ;(window as any).__po = { scene: s, net, doc: sync.doc, call, state, rooms, offices, objects, importer, runner, editor, screens, hud, avatars: { avatarSheet, avatarThumb, encodeLook, decodeLook, suggestLook, toRecipe } }
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
