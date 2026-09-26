import Phaser from 'phaser'
import type { Transport } from '../net/transport'
import type { Call } from '../media/call'
import { zoneAt, type Zone } from '../media/proximity'
import { buildingPlan, FLOOR, inside, isWallTile, regionAt, slotAt, tileAt, type Plan } from '../world/building'
import { sign, verify } from '../world/crypto'
import { canPlace, solidTiles, type Placement } from '../world/room'
import type { DecorDef, View, WorldState, ZoneDef } from '../world/state'
import { FACINGS, type Facing, type ItemDef, type Manifest, type Presence } from '../world/types'

const T = 16
const SPEED = 80                 // px per second
const SEND_MS = 100
const WALK = [1, 0, 2, 0]        // walk-cycle frame order

/** Floor styles per building region: [atlas, frame]. */
const REGION_FLOORS: Record<string, [string, string]> = {
  corridor: ['office', 'floor1_0'], lobby: ['zen', 'floor0_0'], lounge: ['cabin', 'floor0_0'],
  cafe: ['office', 'floor0_0'], library: ['cabin', 'floor1_0'], empty: ['zen', 'floor1_0'],
}

interface Avatar {
  sprite: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text
  bubble?: Phaser.GameObjects.Text
  bubbleUntil?: number
  preset: string
  mic: boolean
  cam: boolean
  facing: Facing
  moving: boolean
  animT: number
  floor: number
  tx: number; ty: number
  seen: number
  uid?: string      // verified identity (public key)
  name: string
}

/** Something drawn on the map that people can bump into (world decor, room decor…). */
export interface Thing extends Placement { id: string; floor: number; editable: boolean; source: 'world' | 'room' }

export interface SceneDeps {
  manifest: Manifest
  net: Transport
  call: Call
  state: WorldState
  me: { name: string; avatar: string }
  onReady: (s: WorldScene) => void
}

export class WorldScene extends Phaser.Scene {
  deps!: SceneDeps
  plan: Plan = buildingPlan()
  defs = new Map<string, ItemDef>()
  floor = 0
  private thingSprites = new Map<string, Phaser.GameObjects.Image>()
  private things = new Map<string, Thing>()
  private structure: Phaser.GameObjects.GameObject[] = []
  private structureKey = ''
  private solid = new Set<string>()
  private me!: Avatar
  private others = new Map<string, Avatar>()
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private lastSent = 0
  private lastSentState = ''
  private posCh!: ReturnType<Transport['channel']>
  private chatCh!: ReturnType<Transport['channel']>
  private helloCh!: ReturnType<Transport['channel']>
  /** Later phases add more things to draw (placed rooms). */
  extraThings: (floor: number) => Thing[] = () => []
  /** Later phases add more no-go tiles (other people's rooms while editing, …). */
  extraBlocked: (x: number, y: number, floor: number) => boolean = () => false
  /** Later phases decide who may edit what inside rooms. */
  roomEditHook: {
    canEditAt: (x: number, y: number, floor: number) => boolean
    set: (t: Omit<Thing, 'editable' | 'source'>) => void
    del: (id: string) => void
  } | null = null
  // decorate mode
  decorating = false
  private buildItem: string | null = null
  private buildFacing: Facing = 'S'
  private ghost?: Phaser.GameObjects.Image
  private hoverId: string | null = null
  typing = false
  zones: Zone[] = []
  zoneMode = false
  private dragStart: { x: number; y: number } | null = null
  private dragGfx?: Phaser.GameObjects.Graphics
  private zoneGfx: Phaser.GameObjects.GameObject[] = []
  private lastCallTick = 0
  onElevator = false
  onChange: () => void = () => {}

  constructor() { super('world') }

  init(deps: SceneDeps) { this.deps = deps }

  get state() { return this.deps.state }
  get view(): View { return this.deps.state.view }

  preload() {
    const m = this.deps.manifest
    for (const [tid, th] of Object.entries(m.themes)) {
      this.load.atlas(tid, `assets/${th.atlas}.png`, `assets/${th.atlas}.json`)
      for (const it of th.items) this.defs.set(it.id, it)
    }
    this.load.atlas('avatars', 'assets/avatars.png', 'assets/avatars.json')
  }

  create() {
    const { net } = this.deps
    this.cameras.main.setBackgroundColor('#141319')
    this.cameras.main.setRoundPixels(true)
    this.fitZoom()
    this.scale.on('resize', () => this.fitZoom())

    const sp = this.plan.spawn
    this.me = this.makeAvatar(this.deps.me.avatar, this.deps.me.name, sp.x * T + 8 + (Math.random() * 32 - 16), sp.y * T + 10)
    this.cameras.main.startFollow(this.me.sprite, true, 0.15, 0.15)
    this.cameras.main.setBounds(-T * 4, -T * 6, (this.plan.w + 8) * T, (this.plan.h + 10) * T)

    this.rebuild()
    this.state.onChange.on(() => { this.rebuild(); this.onChange() })

    const kb = this.input.keyboard!
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,R,B,ESC,DELETE,SHIFT', false) as Record<string, Phaser.Input.Keyboard.Key>
    kb.on('keydown-R', () => { if (!this.typing && this.decorating) this.rotate(this.keys.SHIFT.isDown ? -1 : 1) })
    kb.on('keydown-B', () => { if (!this.typing) this.setDecorating(!this.decorating) })
    kb.on('keydown-ESC', () => { if (this.decorating) this.buildItem ? this.setBuildItem(null) : this.setDecorating(false) })
    kb.on('keydown-DELETE', () => { if (this.decorating && this.hoverId) this.deleteThing(this.hoverId) })
    this.input.mouse?.disableContextMenu()
    this.input.on('pointermove', () => this.updateGhost())
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p))
    this.input.on('pointerup', () => this.onPointerUp())

    // network
    this.posCh = net.channel<Presence>('pos')
    this.posCh.onMessage((d, peer) => this.onPresence(d as Presence, peer))
    this.chatCh = net.channel<string>('chat')
    this.chatCh.onMessage((d, peer) => {
      const a = this.others.get(peer)
      if (a && !this.isBanned(a) && a.floor === this.floor) this.say(a, String(d).slice(0, 200))
    })
    // prove who we are: sign our session peer id with our identity key
    this.helloCh = net.channel<{ uid: string; sig: string }>('hello')
    const hello = async (to?: string) => {
      const sig = await sign(this.state.me, this.state.worldId + ':' + net.selfId)
      this.helloCh.send({ uid: this.state.me.pub, sig }, to)
    }
    this.helloCh.onMessage(async (d: any, peer) => {
      if (typeof d?.uid !== 'string' || !(await verify(d.uid, this.state.worldId + ':' + peer, d.sig))) return
      this.peerUid.set(peer, d.uid)
      const a = this.others.get(peer)
      if (a) a.uid = d.uid
      this.onChange()
    })
    net.onPeerJoin((peer) => { this.posCh.send(this.presence(), peer); void hello(peer) })
    net.onPeerLeave((peer) => { this.removeOther(peer); this.peerUid.delete(peer) })
    void hello()

    const timer = window.setInterval(() => this.netTick(), 50)
    this.events.once('destroy', () => clearInterval(timer))
    this.deps.onReady(this)
  }

  /** peer (session) id -> verified identity key */
  readonly peerUid = new Map<string, string>()
  private isBanned(a: Avatar) { return !!a.uid && this.view.bans.has(a.uid) }

  // ------------------------------------------------------------------ layout
  private fitZoom() {
    const z = Math.max(2, Math.min(4, Math.round(Math.min(this.scale.width, this.scale.height * 1.4) / (T * 22))))
    this.cameras.main.setZoom(z)
  }

  get theme() { return this.view.themes.get(this.floor) ?? 'office' }
  setTheme(t: string) { void this.state.author('theme', { floor: this.floor, theme: t }) }

  /** Re-derive everything visible from the replayed world view. */
  rebuild() {
    const key = this.theme + ':' + this.floor
    if (key !== this.structureKey) { this.structureKey = key; this.buildStructure() }
    this.zones = [...this.view.zones.values()].filter((z) => z.floor === this.floor).sort((a, b) => a.name.localeCompare(b.name))
    this.buildZones()
    this.syncThings()
    if (this.floor >= this.view.floors) this.goFloor(0)
  }

  private buildStructure() {
    for (const o of this.structure) o.destroy()
    this.structure = []
    const p = this.plan, th = this.theme
    // floors: one render texture for the whole plan
    const rt = this.add.renderTexture(0, 0, p.w * T, p.h * T).setOrigin(0, 0).setDepth(-20000)
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        if (tileAt(p, x, y) !== FLOOR) continue
        const r = regionAt(p, x, y)
        const [atlas, frame] = REGION_FLOORS[r?.style ?? 'corridor'] ?? REGION_FLOORS.corridor
        rt.stamp(atlas, (x * 7 + y * 13) % 11 === 0 ? frame.replace('_0', '_1') : frame, x * T, y * T, { originX: 0, originY: 0 })
      }
    }
    rt.render()
    this.structure.push(rt)
    // empty offices: dim + sign
    for (const s of p.slots) {
      const g = this.add.graphics().setDepth(-19000)
      g.fillStyle(0x0c0b10, 0.3).fillRect(s.x * T, s.y * T, s.w * T, s.h * T)
      this.structure.push(g)
      const t = this.add.text((s.x + s.w / 2) * T, (s.y + s.h / 2) * T, `OFFICE ${s.id}\navailable`, {
        fontFamily: 'monospace', fontSize: '24px', color: '#8f8a9c', align: 'center',
      }).setOrigin(0.5).setScale(0.25).setResolution(2).setDepth(-18999)
      t.setData('slot', s.id)
      this.structure.push(t)
    }
    // elevator pad
    const e = p.elevator
    const eg = this.add.graphics().setDepth(-18990)
    eg.fillStyle(0xf2c14e, 0.25).fillRect(e.x * T, e.y * T, e.w * T, e.h * T)
    eg.lineStyle(1, 0xf2c14e, 0.9).strokeRect(e.x * T + 0.5, e.y * T + 0.5, e.w * T - 1, e.h * T - 1)
    const et = this.add.text((e.x + e.w / 2) * T, (e.y + 0.5) * T, 'ELEVATOR', { fontFamily: 'monospace', fontSize: '20px', color: '#f2c14e' })
      .setOrigin(0.5).setScale(0.25).setResolution(2).setDepth(-18989)
    this.structure.push(eg, et)
    // walls: tall where a floor lies to the south (face visible), low where floor lies north
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        if (tileAt(p, x, y) !== 2) continue
        let near = false
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (tileAt(p, x + dx, y + dy) === FLOOR) { near = true; break }
        const southFloor = tileAt(p, x, y + 1) === FLOOR
        const northFloor = tileAt(p, x, y - 1) === FLOOR
        const low = northFloor && !southFloor
        if (!near && y < p.h - 1 && tileAt(p, x, y + 1) === 2) {
          // interior of a wall mass: just a dark cap (drawn 2 tiles up like the tall caps)
          const cap = this.add.rectangle(x * T, (y - 2) * T, T, T, 0x1c1a24).setOrigin(0, 0).setDepth((y + 1) * T - 1)
          this.structure.push(cap)
          continue
        }
        const img = this.add.image(x * T, (y + 1) * T, th, low ? 'wall_low' : 'wall_tall').setOrigin(0, 1)
        img.setDepth(low ? (y + 1) * T + 40 : (y + 1) * T - 0.5)
        this.structure.push(img)
      }
    }
  }

  private buildZones() {
    for (const o of this.zoneGfx) o.destroy()
    this.zoneGfx = []
    for (const z of this.zones) {
      const g = this.add.graphics().setDepth(-15000)
      const stage = (z as ZoneDef).stage
      const col = stage ? 0xe86a9a : 0xf2c14e
      g.fillStyle(col, 0.07).fillRect(z.x * T, z.y * T, z.w * T, z.h * T)
      g.lineStyle(1, col, 0.45)
      const dash = (x1: number, y1: number, x2: number, y2: number) => {
        const len = Math.hypot(x2 - x1, y2 - y1), n = Math.floor(len / 4)
        for (let i = 0; i < n; i += 2) {
          const a = i / n, b = Math.min(1, (i + 1) / n)
          g.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b)
        }
      }
      const [x0, y0, x1, y1] = [z.x * T + 0.5, z.y * T + 0.5, (z.x + z.w) * T - 0.5, (z.y + z.h) * T - 0.5]
      dash(x0, y0, x1, y0); dash(x1, y0, x1, y1); dash(x1, y1, x0, y1); dash(x0, y1, x0, y0)
      const label = this.add.text(z.x * T + 3, (z.y + z.h) * T - 3, (stage ? '★ ' : '') + z.name.toUpperCase(), {
        fontFamily: 'monospace', fontSize: '20px', color: stage ? '#e86a9a' : '#f2c14e',
      }).setOrigin(0, 1).setScale(0.25).setResolution(2).setAlpha(0.8).setDepth(-14999)
      this.zoneGfx.push(g, label)
    }
  }

  /** World decor + room things (phase 3) on the current floor. */
  private collectThings() {
    const out = new Map<string, Thing>()
    const canWorld = this.state.canDecorate()
    for (const d of this.view.decor.values()) {
      if (d.floor !== this.floor) continue
      out.set(d.id, { id: d.id, item: d.item, x: d.x, y: d.y, f: d.f, floor: d.floor, editable: canWorld, source: 'world' })
    }
    for (const t of this.extraThings(this.floor)) out.set(t.id, t)
    return out
  }

  syncThings() {
    this.things = this.collectThings()
    for (const [id, spr] of this.thingSprites) if (!this.things.has(id)) { spr.destroy(); this.thingSprites.delete(id) }
    for (const [id, p] of this.things) {
      const def = this.defs.get(p.item)
      if (!def) continue
      const [tid] = p.item.split('/')
      const v = def.views[p.f]
      let spr = this.thingSprites.get(id)
      if (!spr) { spr = this.add.image(0, 0, tid, v.frame).setOrigin(0, 1); this.thingSprites.set(id, spr) }
      spr.setTexture(tid, v.frame)
      spr.setPosition(p.x * T, (p.y + v.d) * T)
      spr.setDepth(def.flat ? -10000 + p.y : (p.y + v.d) * T - 0.25)
    }
    this.solid = solidTiles(this.things.values(), this.defs)
    this.updateGhost()
  }

  // ------------------------------------------------------------------ floors
  goFloor(n: number) {
    if (n === this.floor || n < 0 || n >= this.view.floors) return
    this.floor = n
    const e = this.plan.elevator
    this.me.sprite.setPosition((e.x + 1) * T, (e.y - 1) * T + 10)
    this.structureKey = ''
    this.rebuild()
    for (const a of this.others.values()) this.showOther(a)
    this.lastSentState = ''
    this.onChange()
  }

  private showOther(a: Avatar) {
    const vis = a.floor === this.floor && !this.isBanned(a)
    a.sprite.setVisible(vis); a.label.setVisible(vis); a.bubble?.setVisible(vis)
  }

  // ------------------------------------------------------------------ avatars
  private makeAvatar(preset: string, name: string, x: number, y: number): Avatar {
    const m = this.deps.manifest.avatars
    const sprite = this.add.image(x, y, 'avatars', `${preset}_S_0`).setOrigin(m.origin[0], m.origin[1])
    const label = this.add.text(x, y, name, {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 4, y: 1 },
    }).setOrigin(0.5, 1).setScale(0.25).setResolution(2)
    return { sprite, label, preset, mic: false, cam: false, facing: 'S', moving: false, animT: 0, floor: 0, tx: x, ty: y, seen: Date.now(), name }
  }

  private labelText(a: Avatar) {
    const role = a === this.me ? this.state.roleOf(this.state.me.pub) : a.uid ? this.state.roleOf(a.uid) : 'member'
    return (role === 'owner' ? '♛ ' : role === 'mod' ? '◆ ' : '') + a.name
  }

  private drawAvatar(a: Avatar, dt: number) {
    a.animT = a.moving ? a.animT + dt : 0
    const fr = a.moving ? WALK[Math.floor(a.animT / 130) % WALK.length] : 0
    a.sprite.setFrame(`${a.preset}_${a.facing}_${fr}`)
    a.sprite.setDepth(a.sprite.y)
    const text = this.labelText(a)
    if (a.label.text !== text) a.label.setText(text)
    a.label.setPosition(Math.round(a.sprite.x), Math.round(a.sprite.y - 36))
    a.label.setDepth(200000)
    if (a.bubble) {
      a.bubble.setPosition(Math.round(a.sprite.x), Math.round(a.sprite.y - 44)).setDepth(200001)
      if (Date.now() > (a.bubbleUntil ?? 0)) { a.bubble.destroy(); a.bubble = undefined }
    }
  }

  say(a: Avatar | 'me', text: string) {
    const av = a === 'me' ? this.me : a
    if (a === 'me') this.chatCh.send(text)
    av.bubble?.destroy()
    av.bubble = this.add.text(av.sprite.x, av.sprite.y, text, {
      fontFamily: 'monospace', fontSize: '24px', color: '#1b1a22', backgroundColor: '#f4f1e8', padding: { x: 6, y: 3 },
      wordWrap: { width: 480 },
    }).setOrigin(0.5, 1).setScale(0.25).setResolution(2)
    av.bubbleUntil = Date.now() + 4000 + text.length * 60
  }

  blockedTile(tx: number, ty: number) {
    return isWallTile(this.plan, tx, ty) || this.solid.has(tx + ',' + ty) || this.extraBlocked(tx, ty, this.floor)
  }

  private blocked(px: number, py: number) {
    for (const [ox, oy] of [[-4, -2], [3, -2], [-4, 1], [3, 1]]) {
      if (this.blockedTile(Math.floor((px + ox) / T), Math.floor((py + oy) / T))) return true
    }
    return false
  }

  private presence(): Presence & { fl: number } {
    return { x: Math.round(this.me.sprite.x), y: Math.round(this.me.sprite.y), f: this.me.facing, m: this.me.moving,
      a: this.me.preset, n: this.deps.me.name, mic: this.deps.call.devices.micOn, cam: this.deps.call.devices.camOn, fl: this.floor }
  }

  private onPresence(d: Presence & { fl?: number }, peer: string) {
    let a = this.others.get(peer)
    if (!a) {
      a = this.makeAvatar(d.a, d.n, d.x, d.y)
      a.uid = this.peerUid.get(peer)
      this.others.set(peer, a)
      this.onChange()
    }
    a.tx = d.x; a.ty = d.y; a.facing = d.f; a.moving = d.m; a.seen = Date.now()
    a.mic = !!d.mic; a.cam = !!d.cam
    a.preset = d.a
    const floor = d.fl ?? 0
    if (a.floor !== floor) { a.floor = floor; a.sprite.setPosition(d.x, d.y) }
    if (a.name !== d.n) { a.name = String(d.n).slice(0, 24); this.onChange() }
    this.showOther(a)
  }

  private removeOther(peer: string) {
    const a = this.others.get(peer)
    if (!a) return
    a.sprite.destroy(); a.label.destroy(); a.bubble?.destroy()
    this.others.delete(peer)
    this.onChange()
  }

  setMe(name: string, avatar: string) {
    this.deps.me = { name, avatar }
    this.me.preset = avatar
    this.me.name = name
    this.lastSentState = ''
  }

  /** People in this world right now (for the people list). */
  people() {
    return [...this.others.entries()].map(([peer, a]) => ({
      peer, name: a.name, uid: a.uid, floor: a.floor,
      role: a.uid ? this.state.roleOf(a.uid) : 'unverified', banned: this.isBanned(a),
    }))
  }
  peerNames() { return this.people().filter((p) => !p.banned).map((p) => p.name) }

  update(_t: number, dtMs: number) {
    const dt = Math.min(dtMs, 50)
    const k = this.keys
    let vx = 0, vy = 0
    if (!this.typing) {
      if (k.A.isDown || k.LEFT.isDown) vx -= 1
      if (k.D.isDown || k.RIGHT.isDown) vx += 1
      if (k.W.isDown || k.UP.isDown) vy -= 1
      if (k.S.isDown || k.DOWN.isDown) vy += 1
    }
    const me = this.me
    me.moving = vx !== 0 || vy !== 0
    if (me.moving) {
      const len = Math.hypot(vx, vy)
      const step = (SPEED * dt) / 1000
      const nx = me.sprite.x + (vx / len) * step
      const ny = me.sprite.y + (vy / len) * step
      if (!this.blocked(nx, me.sprite.y)) me.sprite.x = nx
      if (!this.blocked(me.sprite.x, ny)) me.sprite.y = ny
      me.facing = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'E' : 'W') : vy > 0 ? 'S' : 'N'
    }
    this.drawAvatar(me, dt)
    const onElev = inside(this.plan.elevator, Math.floor(me.sprite.x / T), Math.floor(me.sprite.y / T))
    if (onElev !== this.onElevator) { this.onElevator = onElev; this.onChange() }

    const now = Date.now()
    for (const [peer, a] of this.others) {
      if (now - a.seen > 8000) { this.removeOther(peer); continue }
      const f = 1 - Math.pow(0.001, dt / 1000 * 4)
      a.sprite.x += (a.tx - a.sprite.x) * f
      a.sprite.y += (a.ty - a.sprite.y) * f
      if (Math.hypot(a.tx - a.sprite.x, a.ty - a.sprite.y) < 0.5) { a.sprite.x = a.tx; a.sprite.y = a.ty }
      this.drawAvatar(a, dt)
    }
  }

  private setSpeaking(a: Avatar, on: boolean) {
    a.label.setBackgroundColor(on ? '#2f9e5acc' : '#00000088')
  }

  /** Everything the HUD needs about the call, ~5x/second. */
  callInfo() {
    const inCall = new Set(this.deps.call.inCall())
    const peers = [...this.others.entries()].filter(([id]) => inCall.has(id)).map(([id, a]) => ({
      id, name: a.name, cam: a.cam, mic: a.mic, preset: a.preset,
    }))
    const zone = zoneAt(this.zones, { x: this.me.sprite.x, y: this.me.sprite.y })
    return { zone: zone?.name ?? null, peers, me: { name: this.deps.me.name, preset: this.me.preset } }
  }

  /** Runs on a timer (not the render loop) so calls and presence keep going in background tabs. */
  private netTick() {
    const me = this.me
    const now = Date.now()
    if (now - this.lastCallTick > 200) {
      this.lastCallTick = now
      const pos = new Map<string, { x: number; y: number }>()
      for (const [peer, a] of this.others) {
        if (a.floor === this.floor && !this.isBanned(a)) pos.set(peer, { x: a.tx, y: a.ty })
      }
      if (this.state.isBanned) pos.clear()
      this.deps.call.tick({ x: me.sprite.x, y: me.sprite.y }, pos, this.zones)
      this.setSpeaking(me, this.deps.call.devices.speaking())
      for (const [peer, a] of this.others) this.setSpeaking(a, a.mic && this.deps.call.speaking(peer))
    }
    const state = JSON.stringify(this.presence())
    if ((state !== this.lastSentState && now - this.lastSent > SEND_MS) || now - this.lastSent > 1000) {
      this.posCh.send(this.presence())
      this.lastSent = now
      this.lastSentState = state
    }
  }

  // ------------------------------------------------------------------ zones
  get canEditZones() { return this.state.isMod && !this.state.isBanned }

  setZoneMode(on: boolean) {
    this.zoneMode = on && this.canEditZones
    if (on) this.setBuildItem(null)
    this.dragStart = null
    this.dragGfx?.clear()
    this.updateGhost()
    this.onChange()
  }

  renameZone(id: string, name: string) {
    const z = this.view.zones.get(id)
    if (z && this.canEditZones) void this.state.author('zone.set', { ...z, name: name.slice(0, 32) || z.name })
  }
  deleteZone(id: string) { if (this.canEditZones) void this.state.author('zone.del', { id }) }
  toggleStage(id: string) {
    const z = this.view.zones.get(id)
    if (z && this.canEditZones) void this.state.author('zone.set', { ...z, stage: !z.stage })
  }

  private zoneOk(r: { x: number; y: number; w: number; h: number }) {
    const p = this.plan
    if (r.w < 1 || r.h < 1 || r.x < 1 || r.y < 1 || r.x + r.w > p.w - 1 || r.y + r.h > p.h - 1) return false
    // commons zones can't cover offices (room owners zone their own rooms)
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (slotAt(p, x, y)) return false
    return !this.zones.some((z) => r.x < z.x + z.w && z.x < r.x + r.w && r.y < z.y + z.h && z.y < r.y + r.h)
  }

  /** Add a zone on this floor; returns its id, or null if it overlaps or leaves the building. */
  addZone(x: number, y: number, w: number, h: number, name?: string): string | null {
    if (!this.canEditZones || !this.zoneOk({ x, y, w, h })) return null
    const id = 'z' + Math.random().toString(36).slice(2, 8)
    let n = this.zones.length + 1
    while (this.zones.some((z) => z.name === `Zone ${n}`)) n++
    void this.state.author('zone.set', { id, name: name ?? `Zone ${n}`, x, y, w, h, floor: this.floor })
    return id
  }

  private dragRect() {
    if (!this.dragStart) return null
    const { tx, ty } = this.pointerTile()
    const x = Math.min(tx, this.dragStart.x), y = Math.min(ty, this.dragStart.y)
    return { x, y, w: Math.abs(tx - this.dragStart.x) + 1, h: Math.abs(ty - this.dragStart.y) + 1 }
  }

  private drawDrag() {
    const r = this.dragRect()
    if (!this.dragGfx) this.dragGfx = this.add.graphics().setDepth(300001)
    this.dragGfx.clear()
    if (!r) return
    const c = this.zoneOk(r) ? 0x7ad08a : 0xff7070
    this.dragGfx.fillStyle(c, 0.18).fillRect(r.x * T, r.y * T, r.w * T, r.h * T)
    this.dragGfx.lineStyle(1, c, 0.9).strokeRect(r.x * T + 0.5, r.y * T + 0.5, r.w * T - 1, r.h * T - 1)
  }

  private onPointerUp() {
    if (!this.zoneMode || !this.dragStart) return
    const r = this.dragRect()
    this.dragStart = null
    this.dragGfx?.clear()
    if (r && !this.addZone(r.x, r.y, r.w, r.h)) this.cameras.main.shake(80, 0.002)
  }

  // ------------------------------------------------------------------ decorating
  setDecorating(on: boolean) {
    this.decorating = on
    if (!on) { this.setZoneMode(false); this.setBuildItem(null) }
    this.hoverId = null
    this.updateGhost()
    this.onChange()
  }

  setBuildItem(id: string | null) {
    this.buildItem = id
    this.ghost?.destroy()
    this.ghost = undefined
    if (id) {
      const def = this.defs.get(id)!
      this.ghost = this.add.image(0, 0, id.split('/')[0], def.views[this.buildFacing].frame).setOrigin(0, 1).setAlpha(0.75)
    }
    this.updateGhost()
    this.onChange()
  }

  get selectedItem() { return this.buildItem }
  get facing() { return this.buildFacing }

  /** Where may I put things? World decor outside offices; my own room inside it. */
  canEditAt(x: number, y: number) {
    if (slotAt(this.plan, x, y)) return this.roomEditHook?.canEditAt(x, y, this.floor) ?? false
    return this.state.canDecorate()
  }

  private placeBlocked(x: number, y: number, anchorX: number, anchorY: number) {
    if (isWallTile(this.plan, x, y) || inside(this.plan.elevator, x, y)) return true
    // a piece may not straddle the office/commons boundary
    return slotAt(this.plan, x, y)?.id !== slotAt(this.plan, anchorX, anchorY)?.id || !this.canEditAt(x, y)
  }

  canPlaceAt(def: ItemDef, x: number, y: number, f: Facing, ignore?: string) {
    return canPlace(def, x, y, f, this.things.values(), this.defs, (tx, ty) => this.placeBlocked(tx, ty, x, y), ignore)
  }

  private writeThing(t: { id: string; item: string; x: number; y: number; f: Facing }) {
    if (slotAt(this.plan, t.x, t.y)) this.roomEditHook?.set({ ...t, floor: this.floor })
    else void this.state.author('decor.set', { ...t, floor: this.floor } satisfies Omit<DecorDef, 'by'>)
  }

  deleteThing(id: string) {
    const t = this.things.get(id)
    if (!t?.editable) return
    if (t.source === 'room') this.roomEditHook?.del(id)
    else void this.state.author('decor.del', { id })
  }

  private rotate(dir: 1 | -1) {
    const next = (f: Facing) => FACINGS[(FACINGS.indexOf(f) + dir + 4) % 4]
    if (this.buildItem) {
      this.buildFacing = next(this.buildFacing)
      this.updateGhost()
      this.onChange()
      return
    }
    if (!this.hoverId) return
    const p = this.things.get(this.hoverId)
    const def = p && this.defs.get(p.item)
    if (!p || !def || !p.editable) return
    const f = next(p.f)
    if (this.canPlaceAt(def, p.x, p.y, f, p.id)) this.writeThing({ id: p.id, item: p.item, x: p.x, y: p.y, f })
    else this.cameras.main.shake(80, 0.002)
  }

  private pointerTile() {
    const p = this.input.activePointer
    const w = this.cameras.main.getWorldPoint(p.x, p.y)
    return { wx: w.x, wy: w.y, tx: Math.floor(w.x / T), ty: Math.floor(w.y / T) }
  }

  /** Top-most editable thing under the pointer (by sprite pixels, not just footprint). */
  private pick(): string | null {
    const { wx, wy } = this.pointerTile()
    let best: { id: string; depth: number } | null = null
    for (const [id, spr] of this.thingSprites) {
      if (!this.things.get(id)?.editable) continue
      const b = spr.getBounds()
      if (!b.contains(wx, wy)) continue
      const alpha = this.textures.getPixelAlpha(Math.floor(wx - b.x), Math.floor(wy - b.y), spr.texture.key, spr.frame.name)
      if (alpha !== null && alpha !== undefined && alpha < 10) continue
      if (!best || spr.depth > best.depth) best = { id, depth: spr.depth }
    }
    return best?.id ?? null
  }

  private updateGhost() {
    for (const spr of this.thingSprites.values()) spr.clearTint()
    if (this.zoneMode) { if (this.dragStart) this.drawDrag(); return }
    if (!this.decorating) return
    const { tx, ty } = this.pointerTile()
    if (this.ghost && this.buildItem) {
      const def = this.defs.get(this.buildItem)!
      const v = def.views[this.buildFacing]
      const gx = tx - Math.floor((v.w - 1) / 2), gy = ty - Math.floor((v.d - 1) / 2)
      this.ghost.setFrame(v.frame).setPosition(gx * T, (gy + v.d) * T).setDepth(300000)
      const ok = this.canPlaceAt(def, gx, gy, this.buildFacing)
      this.ghost.setTint(ok ? 0xa0ffa0 : 0xff7070)
      this.ghost.setData('pos', { x: gx, y: gy, ok })
      this.hoverId = null
      return
    }
    this.hoverId = this.pick()
    if (this.hoverId) this.thingSprites.get(this.hoverId)?.setTint(0xfff2a0)
  }

  private onPointerDown(p: Phaser.Input.Pointer) {
    if (this.zoneMode) {
      if (p.rightButtonDown()) {
        const { tx, ty } = this.pointerTile()
        const z = this.zones.find((z) => tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h)
        if (z && !(z as ZoneDef).room) this.deleteZone(z.id)
        return
      }
      const { tx, ty } = this.pointerTile()
      this.dragStart = { x: tx, y: ty }
      this.drawDrag()
      return
    }
    if (!this.decorating) return
    this.updateGhost()
    if (p.rightButtonDown()) {
      if (this.buildItem) this.setBuildItem(null)
      else if (this.hoverId) this.deleteThing(this.hoverId)
      return
    }
    if (this.buildItem && this.ghost) {
      const pos = this.ghost.getData('pos') as { x: number; y: number; ok: boolean }
      if (!pos?.ok) { this.cameras.main.shake(80, 0.002); return }
      const id = Math.random().toString(36).slice(2, 10)
      this.writeThing({ id, item: this.buildItem, x: pos.x, y: pos.y, f: this.buildFacing })
      // optimistic: treat as taken until the op replays
      this.things.set(id, { id, item: this.buildItem, x: pos.x, y: pos.y, f: this.buildFacing, floor: this.floor, editable: true, source: 'world' })
      if (!p.event.shiftKey && this.ghost.getData('moving')) this.setBuildItem(null)
      return
    }
    if (this.hoverId) {
      const placed = this.things.get(this.hoverId)
      if (!placed) return
      this.deleteThing(this.hoverId)
      this.buildFacing = placed.f
      this.setBuildItem(placed.item)
      this.ghost?.setData('moving', true)
    }
  }

  /** Test/debug hook. */
  debugState() {
    return {
      me: { x: this.me.sprite.x, y: this.me.sprite.y, f: this.me.facing, floor: this.floor },
      others: [...this.others.entries()].map(([id, a]) => ({ id, x: a.sprite.x, y: a.sprite.y, n: a.name, said: a.bubble?.text, uid: a.uid, floor: a.floor, visible: a.sprite.visible })),
      decor: this.view.decor.size,
      things: this.things.size,
      theme: this.theme,
      zone: zoneAt(this.zones, { x: this.me.sprite.x, y: this.me.sprite.y })?.id ?? null,
      call: this.deps.call.mesh.stats(),
      owner: this.state.isOwner,
    }
  }

  teleport(x: number, y: number) { this.me.sprite.setPosition(x, y) }
  tileToScreen(tx: number, ty: number) {
    const c = this.cameras.main
    return { x: (tx * T + 8 - c.worldView.x) * c.zoom, y: (ty * T + 8 - c.worldView.y) * c.zoom }
  }
}
