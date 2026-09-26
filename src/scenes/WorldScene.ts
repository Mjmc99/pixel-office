import Phaser from 'phaser'
import * as Y from 'yjs'
import type { Transport } from '../net/transport'
import type { Call } from '../media/call'
import { zoneAt, type Zone } from '../media/proximity'
import { MAP_H, MAP_W, canPlace, isWall, solidTiles } from '../world/room'
import { FACINGS, type Facing, type ItemDef, type Manifest, type Placed, type Presence } from '../world/types'

const T = 16
const SPEED = 72                 // px per second
const SEND_MS = 100
const WALK = [1, 0, 2, 0]        // walk-cycle frame order

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
  // remote interpolation target
  tx: number; ty: number
  seen: number
}

export interface SceneDeps {
  manifest: Manifest
  net: Transport
  doc: Y.Doc
  call: Call
  uid: string
  me: { name: string; avatar: string }
  onReady: (s: WorldScene) => void
}

export class WorldScene extends Phaser.Scene {
  deps!: SceneDeps
  defs = new Map<string, ItemDef>()
  private decor!: Y.Map<Placed>
  private roomMeta!: Y.Map<string>
  private decorSprites = new Map<string, Phaser.GameObjects.Image>()
  private structure: Phaser.GameObjects.Image[] = []
  private solid = new Set<string>()
  private me!: Avatar
  private others = new Map<string, Avatar>()
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private lastSent = 0
  private lastSentState = ''
  private posCh!: ReturnType<Transport['channel']>
  private chatCh!: ReturnType<Transport['channel']>
  // decorate mode
  decorating = false
  private buildItem: string | null = null
  private buildFacing: Facing = 'S'
  private ghost?: Phaser.GameObjects.Image
  private hoverId: string | null = null
  typing = false
  zones: Zone[] = []
  private zoneMap!: Y.Map<Zone>
  zoneMode = false
  private dragStart: { x: number; y: number } | null = null
  private dragGfx?: Phaser.GameObjects.Graphics
  private zoneGfx: Phaser.GameObjects.GameObject[] = []
  private lastCallTick = 0
  onChange: () => void = () => {}

  constructor() { super('world') }

  init(deps: SceneDeps) { this.deps = deps }

  preload() {
    const m = this.deps.manifest
    for (const [tid, th] of Object.entries(m.themes)) {
      this.load.atlas(tid, `assets/${th.atlas}.png`, `assets/${th.atlas}.json`)
      for (const it of th.items) this.defs.set(it.id, it)
    }
    this.load.atlas('avatars', 'assets/avatars.png', 'assets/avatars.json')
  }

  create() {
    const { doc, net } = this.deps
    this.decor = doc.getMap<Placed>('decor')
    this.roomMeta = doc.getMap<string>('room')
    this.zoneMap = doc.getMap<Zone>('zones')
    this.readZones()

    this.cameras.main.setBackgroundColor('#1b1a22')
    this.cameras.main.setRoundPixels(true)
    this.fitZoom()
    this.scale.on('resize', () => this.fitZoom())

    this.buildStructure()
    this.buildZones()
    this.zoneMap.observe(() => { this.readZones(); this.buildZones(); this.onChange() })
    this.roomMeta.observe(() => { this.buildStructure(); this.onChange() })
    this.syncDecor()
    this.decor.observe(() => { this.syncDecor(); this.onChange() })

    // me
    const spawn = this.findSpawn()
    this.me = this.makeAvatar(this.deps.me.avatar, this.deps.me.name, spawn.x, spawn.y)
    this.cameras.main.startFollow(this.me.sprite, true, 0.15, 0.15)
    this.cameras.main.setBounds(-T * 2, -T * 4, (MAP_W + 4) * T, (MAP_H + 6) * T)

    // input
    const kb = this.input.keyboard!
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,R,B,ESC,DELETE,SHIFT', false) as Record<string, Phaser.Input.Keyboard.Key>
    kb.on('keydown-R', () => { if (!this.typing && this.decorating) this.rotate(this.keys.SHIFT.isDown ? -1 : 1) })
    kb.on('keydown-B', () => { if (!this.typing) this.setDecorating(!this.decorating) })
    kb.on('keydown-ESC', () => { if (this.decorating) this.buildItem ? this.setBuildItem(null) : this.setDecorating(false) })
    kb.on('keydown-DELETE', () => { if (this.decorating && this.hoverId) this.decor.delete(this.hoverId) })
    this.input.mouse?.disableContextMenu()
    this.input.on('pointermove', () => this.updateGhost())
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p))
    this.input.on('pointerup', () => this.onPointerUp())

    // network
    this.posCh = net.channel<Presence>('pos')
    this.posCh.onMessage((d, peer) => this.onPresence(d as Presence, peer))
    this.chatCh = net.channel<string>('chat')
    this.chatCh.onMessage((d, peer) => { const a = this.others.get(peer); if (a) this.say(a, String(d).slice(0, 200)) })
    net.onPeerJoin((peer) => this.posCh.send(this.presence(), peer))
    net.onPeerLeave((peer) => this.removeOther(peer))

    const timer = window.setInterval(() => this.netTick(), 50)
    this.events.once('destroy', () => clearInterval(timer))
    this.deps.onReady(this)
  }

  // ------------------------------------------------------------------ layout
  private fitZoom() {
    const cam = this.cameras.main
    const z = Math.max(2, Math.min(4, Math.floor(Math.min(this.scale.width / ((MAP_W + 2) * T), this.scale.height / ((MAP_H + 5) * T)))))
    cam.setZoom(z)
  }

  get theme() { return this.roomMeta.get('theme') ?? 'office' }
  setTheme(t: string) { this.roomMeta.set('theme', t) }

  private buildStructure() {
    for (const o of this.structure) o.destroy()
    this.structure = []
    const th = this.theme
    const floors = this.deps.manifest.themes[th].floors.filter((f) => f.startsWith('floor0'))
    for (let y = 1; y < MAP_H - 1; y++) {
      for (let x = 1; x < MAP_W - 1; x++) {
        const v = floors[(x * 7 + y * 13) % 5 === 0 ? 1 % floors.length : 0]
        this.structure.push(this.add.image(x * T, y * T, th, v).setOrigin(0, 0).setDepth(-20000))
      }
    }
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (!isWall(x, y)) continue
        const low = y === MAP_H - 1
        const img = this.add.image(x * T, (y + 1) * T, th, low ? 'wall_low' : 'wall_tall').setOrigin(0, 1)
        img.setDepth(low ? 100000 + x : (y + 1) * T - 0.5)
        this.structure.push(img)
      }
    }
  }

  private readZones() {
    const out: Zone[] = []
    this.zoneMap.forEach((z, id) => out.push({ ...z, id }))
    this.zones = out.sort((a, b) => a.name.localeCompare(b.name))
  }

  /** World owner (whoever created it). Unclaimed worlds from phase 0 let anyone edit. */
  get isOwner() {
    const owner = this.roomMeta.get('owner')
    return !owner || owner === this.deps.uid
  }

  setZoneMode(on: boolean) {
    this.zoneMode = on && this.isOwner
    if (on) this.setBuildItem(null)
    this.dragStart = null
    this.dragGfx?.clear()
    this.updateGhost()
    this.onChange()
  }

  renameZone(id: string, name: string) {
    const z = this.zoneMap.get(id)
    if (z && this.isOwner) this.zoneMap.set(id, { ...z, name: name.slice(0, 32) || z.name })
  }
  deleteZone(id: string) { if (this.isOwner) this.zoneMap.delete(id) }

  /** Try to add a zone; returns its id or null if it's outside the room or overlaps another. */
  addZone(x: number, y: number, w: number, h: number, name?: string): string | null {
    if (!this.isOwner || w < 1 || h < 1) return null
    if (x < 1 || y < 1 || x + w > MAP_W - 1 || y + h > MAP_H - 1) return null
    const hit = this.zones.some((z) => x < z.x + z.w && z.x < x + w && y < z.y + z.h && z.y < y + h)
    if (hit) return null
    const id = 'z' + Math.random().toString(36).slice(2, 8)
    let n = this.zones.length + 1
    while (this.zones.some((z) => z.name === `Zone ${n}`)) n++
    this.zoneMap.set(id, { id, name: name ?? `Zone ${n}`, x, y, w, h })
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
    const ok = r.x >= 1 && r.y >= 1 && r.x + r.w <= MAP_W - 1 && r.y + r.h <= MAP_H - 1 &&
      !this.zones.some((z) => r.x < z.x + z.w && z.x < r.x + r.w && r.y < z.y + z.h && z.y < r.y + r.h)
    const c = ok ? 0x7ad08a : 0xff7070
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

  private buildZones() {
    for (const o of this.zoneGfx) o.destroy()
    this.zoneGfx = []
    for (const z of this.zones) {
      const g = this.add.graphics().setDepth(-15000)
      g.fillStyle(0xf2c14e, 0.07).fillRect(z.x * T, z.y * T, z.w * T, z.h * T)
      g.lineStyle(1, 0xf2c14e, 0.45)
      // dashed outline
      const dash = (x1: number, y1: number, x2: number, y2: number) => {
        const len = Math.hypot(x2 - x1, y2 - y1), n = Math.floor(len / 4)
        for (let i = 0; i < n; i += 2) {
          const a = i / n, b = Math.min(1, (i + 1) / n)
          g.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b)
        }
      }
      const [x0, y0, x1, y1] = [z.x * T + 0.5, z.y * T + 0.5, (z.x + z.w) * T - 0.5, (z.y + z.h) * T - 0.5]
      dash(x0, y0, x1, y0); dash(x1, y0, x1, y1); dash(x1, y1, x0, y1); dash(x0, y1, x0, y0)
      const label = this.add.text(z.x * T + 3, (z.y + z.h) * T - 3, z.name.toUpperCase(), {
        fontFamily: 'monospace', fontSize: '20px', color: '#f2c14e',
      }).setOrigin(0, 1).setScale(0.25).setResolution(2).setAlpha(0.8).setDepth(-14999)
      this.zoneGfx.push(g, label)
    }
  }

  private findSpawn() {
    const solid = solidTiles(this.readDecor(), this.defs)
    const free: [number, number][] = []
    for (let x = 6; x <= 14; x++) for (const y of [12, 11]) if (!solid.has(x + ',' + y)) free.push([x, y])
    if (free.length) {
      const [x, y] = free[Math.floor(Math.random() * free.length)]
      return { x: x * T + 8, y: y * T + 10 }
    }
    return { x: 5 * T + 8, y: 5 * T + 8 }
  }

  readDecor() {
    const m = new Map<string, Placed>()
    this.decor.forEach((v, k) => m.set(k, v))
    return m
  }

  private syncDecor() {
    const placed = this.readDecor()
    for (const [id, spr] of this.decorSprites) if (!placed.has(id)) { spr.destroy(); this.decorSprites.delete(id) }
    for (const [id, p] of placed) {
      const def = this.defs.get(p.item)
      if (!def) continue
      const [tid] = p.item.split('/')
      const v = def.views[p.f]
      let spr = this.decorSprites.get(id)
      if (!spr) { spr = this.add.image(0, 0, tid, v.frame).setOrigin(0, 1); this.decorSprites.set(id, spr) }
      spr.setTexture(tid, v.frame)
      spr.setPosition(p.x * T, (p.y + v.d) * T)
      spr.setDepth(def.flat ? -10000 + p.y : (p.y + v.d) * T - 0.25)
      spr.setData('id', id)
    }
    this.solid = solidTiles(placed, this.defs)
    this.updateGhost()
  }

  // ------------------------------------------------------------------ avatars
  private makeAvatar(preset: string, name: string, x: number, y: number): Avatar {
    const m = this.deps.manifest.avatars
    const sprite = this.add.image(x, y, 'avatars', `${preset}_S_0`).setOrigin(m.origin[0], m.origin[1])
    const label = this.add.text(x, y, name, {
      fontFamily: 'monospace', fontSize: '24px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 4, y: 1 },
    }).setOrigin(0.5, 1).setScale(0.25).setResolution(2)
    return { sprite, label, preset, mic: false, cam: false, facing: 'S', moving: false, animT: 0, tx: x, ty: y, seen: Date.now() }
  }

  private drawAvatar(a: Avatar, dt: number) {
    a.animT = a.moving ? a.animT + dt : 0
    const fr = a.moving ? WALK[Math.floor(a.animT / 130) % WALK.length] : 0
    a.sprite.setFrame(`${a.preset}_${a.facing}_${fr}`)
    a.sprite.setDepth(a.sprite.y)
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

  private blocked(px: number, py: number) {
    // feet hitbox: 8 x 4 px around the feet point
    for (const [ox, oy] of [[-4, -2], [3, -2], [-4, 1], [3, 1]]) {
      const tx = Math.floor((px + ox) / T), ty = Math.floor((py + oy) / T)
      if (isWall(tx, ty) || this.solid.has(tx + ',' + ty)) return true
    }
    return false
  }

  private presence(): Presence {
    return { x: Math.round(this.me.sprite.x), y: Math.round(this.me.sprite.y), f: this.me.facing, m: this.me.moving,
      a: this.me.preset, n: this.deps.me.name, mic: this.deps.call.devices.micOn, cam: this.deps.call.devices.camOn }
  }

  private onPresence(d: Presence, peer: string) {
    let a = this.others.get(peer)
    if (!a) { a = this.makeAvatar(d.a, d.n, d.x, d.y); this.others.set(peer, a); this.onChange() }
    a.tx = d.x; a.ty = d.y; a.facing = d.f; a.moving = d.m; a.seen = Date.now()
    a.mic = !!d.mic; a.cam = !!d.cam
    if (a.preset !== d.a) a.preset = d.a
    if (a.label.text !== d.n) { a.label.setText(d.n); this.onChange() }
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
    this.me.label.setText(name)
    this.lastSentState = ''
  }

  private setSpeaking(a: Avatar, on: boolean) {
    a.label.setBackgroundColor(on ? '#2f9e5acc' : '#00000088')
  }

  /** Everything the HUD needs about the call, ~5x/second. */
  callInfo() {
    const call = this.deps.call
    const inCall = new Set(call.inCall())
    const peers = [...this.others.entries()].filter(([id]) => inCall.has(id)).map(([id, a]) => ({
      id, name: a.label.text, cam: a.cam, mic: a.mic, preset: a.preset,
    }))
    const zone = zoneAt(this.zones, { x: this.me.sprite.x, y: this.me.sprite.y })
    return { zone: zone?.name ?? null, peers, me: { name: this.deps.me.name, preset: this.me.preset } }
  }

  peerNames() { return [...this.others.values()].map((a) => a.label.text) }

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

  /** Runs on a timer (not the render loop) so calls and presence keep going in background tabs. */
  private netTick() {
    const me = this.me
    const now = Date.now()
    if (now - this.lastCallTick > 200) {
      this.lastCallTick = now
      const pos = new Map<string, { x: number; y: number }>()
      for (const [peer, a] of this.others) pos.set(peer, { x: a.tx, y: a.ty })
      this.deps.call.tick({ x: me.sprite.x, y: me.sprite.y }, pos, this.zones)
      this.setSpeaking(me, this.deps.call.devices.speaking())
      for (const [peer, a] of this.others) this.setSpeaking(a, a.mic && this.deps.call.speaking(peer))
    }
    // presence: ~10 Hz while something changes, 1 Hz heartbeat otherwise
    const state = JSON.stringify(this.presence())
    if ((state !== this.lastSentState && now - this.lastSent > SEND_MS) || now - this.lastSent > 1000) {
      this.posCh.send(this.presence())
      this.lastSent = now
      this.lastSentState = state
    }
  }

  // ------------------------------------------------------------------ decorating
  setDecorating(on: boolean) {
    this.decorating = on
    if (!on) this.setZoneMode(false)
    if (!on) this.setBuildItem(null)
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

  private rotate(dir: 1 | -1) {
    const next = (f: Facing) => FACINGS[(FACINGS.indexOf(f) + dir + 4) % 4]
    if (this.buildItem) {
      this.buildFacing = next(this.buildFacing)
      this.updateGhost()
      this.onChange()
      return
    }
    // rotate the hovered item in place, if it fits
    if (!this.hoverId) return
    const p = this.decor.get(this.hoverId)
    const def = p && this.defs.get(p.item)
    if (!p || !def) return
    const f = next(p.f)
    if (canPlace(def, p.x, p.y, f, this.readDecor(), this.defs, this.hoverId)) this.decor.set(this.hoverId, { ...p, f })
    else this.cameras.main.shake(80, 0.002)
  }

  private pointerTile() {
    const p = this.input.activePointer
    const w = this.cameras.main.getWorldPoint(p.x, p.y)
    return { wx: w.x, wy: w.y, tx: Math.floor(w.x / T), ty: Math.floor(w.y / T) }
  }

  /** Top-most placed item under the pointer (by sprite pixels, not just footprint). */
  private pick(): string | null {
    const { wx, wy } = this.pointerTile()
    let best: { id: string; depth: number } | null = null
    for (const [id, spr] of this.decorSprites) {
      const b = spr.getBounds()
      if (!b.contains(wx, wy)) continue
      const px = Math.floor(wx - b.x), py = Math.floor(wy - b.y)
      const alpha = this.textures.getPixelAlpha(px, py, spr.texture.key, spr.frame.name)
      if (alpha !== null && alpha !== undefined && alpha < 10) continue
      if (!best || spr.depth > best.depth) best = { id, depth: spr.depth }
    }
    return best?.id ?? null
  }

  private updateGhost() {
    for (const spr of this.decorSprites.values()) spr.clearTint()
    if (this.zoneMode) { if (this.dragStart) this.drawDrag(); return }
    if (!this.decorating) return
    const { tx, ty } = this.pointerTile()
    if (this.ghost && this.buildItem) {
      const def = this.defs.get(this.buildItem)!
      const v = def.views[this.buildFacing]
      // anchor the ghost so its footprint is centred on the pointer
      const gx = tx - Math.floor((v.w - 1) / 2), gy = ty - Math.floor((v.d - 1) / 2)
      this.ghost.setFrame(v.frame).setPosition(gx * T, (gy + v.d) * T).setDepth(300000)
      const ok = canPlace(def, gx, gy, this.buildFacing, this.readDecor(), this.defs)
      this.ghost.setTint(ok ? 0xa0ffa0 : 0xff7070)
      this.ghost.setData('pos', { x: gx, y: gy, ok })
      this.hoverId = null
      return
    }
    this.hoverId = this.pick()
    if (this.hoverId) this.decorSprites.get(this.hoverId)?.setTint(0xfff2a0)
  }

  private onPointerDown(p: Phaser.Input.Pointer) {
    if (this.zoneMode) {
      if (p.rightButtonDown()) {
        const { tx, ty } = this.pointerTile()
        const z = this.zones.find((z) => tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h)
        if (z) this.deleteZone(z.id)
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
      else if (this.hoverId) this.decor.delete(this.hoverId)
      return
    }
    if (this.buildItem && this.ghost) {
      const pos = this.ghost.getData('pos') as { x: number; y: number; ok: boolean }
      if (!pos?.ok) { this.cameras.main.shake(80, 0.002); return }
      const id = Math.random().toString(36).slice(2, 10)
      this.decor.set(id, { item: this.buildItem, x: pos.x, y: pos.y, f: this.buildFacing, by: this.deps.net.selfId })
      if (!p.event.shiftKey && this.ghost.getData('moving')) this.setBuildItem(null)
      return
    }
    // pick up an existing item to move it
    if (this.hoverId) {
      const placed = this.decor.get(this.hoverId)
      if (!placed) return
      this.decor.delete(this.hoverId)
      this.buildFacing = placed.f
      this.setBuildItem(placed.item)
      this.ghost?.setData('moving', true)
    }
  }

  /** Test/debug hook. */
  debugState() {
    return {
      me: { x: this.me.sprite.x, y: this.me.sprite.y, f: this.me.facing },
      others: [...this.others.entries()].map(([id, a]) => ({ id, x: a.sprite.x, y: a.sprite.y, n: a.label.text, said: a.bubble?.text })),
      decor: this.decor.size,
      theme: this.theme,
      zone: zoneAt(this.zones, { x: this.me.sprite.x, y: this.me.sprite.y })?.id ?? null,
      call: this.deps.call.mesh.stats(),
    }
  }

  teleport(x: number, y: number) { this.me.sprite.setPosition(x, y) }
}
