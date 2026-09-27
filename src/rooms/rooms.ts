import { nudge } from '../world/state'
import { Emitter, type Transport } from '../net/transport'
import { buildingPlan, SLOT_SIZES, type Slot, type SlotSize } from '../world/building'
import { registerOp, type View, type WorldState } from '../world/state'
import type { Zone } from '../media/proximity'
import type { CustomAsset } from '../world/types'
import {
  packageToToken, pkgKey, signPackage, storeAll, storePut, verifyPackage,
  type RoomContent, type RoomPackage, type RoomThing,
} from './package'

/** An office placed into a slot of this world (from the signed op log). */
export interface Placement {
  key: string; slot: string; floor: number
  owner: string; roomId: string; name: string; size: SlotSize
  by: string; pending: boolean
}

export const placements = (v: View) => (v.ext.get('rooms') ?? new Map()) as Map<string, Placement>
const slotById = (id: string) => buildingPlan().slots.find((s) => s.id === id)

// ---- op log rules for offices ------------------------------------------------
registerOp('room.place', (v, op, r) => {
  const p = op.p ?? {}
  const rooms = v.ext.get('rooms') ?? new Map<string, Placement>()
  v.ext.set('rooms', rooms)
  const slot = slotById(p.slot)
  const floor = Number(p.floor) || 0
  const key = `${floor}:${p.slot}`
  if (r.banned || !slot || slot.size !== p.size || floor >= v.floors || rooms.has(key)) return
  if ([...rooms.values()].some((x) => x.owner === p.owner && x.roomId === p.roomId)) return
  if (v.policy.rooms === 'closed' && !r.mod) return
  rooms.set(key, {
    key, slot: p.slot, floor, owner: String(p.owner), roomId: String(p.roomId), name: String(p.name ?? 'Office').slice(0, 40),
    size: p.size, by: op.by, pending: v.policy.rooms === 'approval' && !r.mod,
  })
})
// an office owner (or a mod) moves an office to another free slot of the same size
registerOp('room.move', (v, op, r) => {
  const p = op.p ?? {}
  const rooms = placements(v)
  const from = `${p.from?.floor}:${p.from?.slot}`
  const pl = rooms.get(from)
  const slot = slotById(p.to?.slot)
  const floor = Number(p.to?.floor) || 0
  const key = `${floor}:${p.to?.slot}`
  if (!pl || r.banned || !(r.mod || op.by === pl.owner)) return
  if (!slot || slot.size !== pl.size || floor >= v.floors || rooms.has(key)) return
  rooms.delete(from)
  rooms.set(key, { ...pl, key, slot: slot.id, floor })
})
registerOp('room.approve', (v, op, r) => {
  const pl = placements(v).get(`${op.p?.floor}:${op.p?.slot}`)
  if (pl && r.mod) pl.pending = false
})
registerOp('room.remove', (v, op, r) => {
  const rooms = placements(v)
  const key = `${op.p?.floor}:${op.p?.slot}`
  const pl = rooms.get(key)
  if (pl && (r.mod || op.by === pl.owner || (pl.pending && op.by === pl.by))) rooms.delete(key)
})

/**
 * Keeps the newest verified package for every office, shares packages with
 * peers, and lets office owners edit their own office (every edit re-signs
 * the package and bumps its version).
 */
export class Rooms {
  readonly onChange = new Emitter<[]>()
  readonly pkgs = new Map<string, RoomPackage>()
  private ch

  constructor(net: Transport, private state: WorldState) {
    this.ch = net.channel<RoomPackage>('pkg')
    this.ch.onMessage((p) => void this.accept(p as RoomPackage, true))
    net.onPeerJoin((peer) => { for (const p of this.relevant()) this.ch.send(p, peer) })
  }

  async init() {
    for (const p of await storeAll()) if (await verifyPackage(p)) this.keep(p)
  }

  private keep(p: RoomPackage) {
    const k = pkgKey(p)
    const cur = this.pkgs.get(k)
    if (cur && cur.ver >= p.ver) return false
    this.pkgs.set(k, p)
    return true
  }

  /** Accept a package if it's valid and newer than what we have. */
  async accept(p: RoomPackage, fromNet = false) {
    const cur = this.pkgs.get(pkgKey(p))
    if (cur && cur.ver >= p.ver) return false
    if (!(await verifyPackage(p))) return false
    if (!this.keep(p)) return false
    await storePut(p)
    if (!fromNet) this.ch.send(p)
    this.onChange.emit()
    return true
  }

  /** Packages for offices placed in this world (what we share with newcomers). */
  private relevant() {
    const out: RoomPackage[] = []
    for (const pl of placements(this.state.view).values()) {
      const p = this.pkgs.get(pkgKey(pl))
      if (p) out.push(p)
    }
    return out
  }

  list() { return [...placements(this.state.view).values()] }
  onFloor(floor: number) { return this.list().filter((p) => p.floor === floor) }
  pkgFor(pl: { owner: string; roomId: string }) { return this.pkgs.get(pkgKey(pl)) }
  placementAt(slot: string, floor: number) { return placements(this.state.view).get(`${floor}:${slot}`) }
  mine() { return this.list().filter((p) => p.owner === this.state.me.pub) }
  myPackages() { return [...this.pkgs.values()].filter((p) => p.owner === this.state.me.pub) }
  findPlaced(p: { owner: string; roomId: string }) { return this.list().find((x) => x.owner === p.owner && x.roomId === p.roomId) }

  freeSlot(size: SlotSize, floor: number): Slot | null {
    return this.freeSlots(floor, size)[0] ?? null
  }
  /** Empty slots on a floor (optionally only one size). */
  freeSlots(floor: number, size?: SlotSize): Slot[] {
    const taken = new Set(this.onFloor(floor).map((p) => p.slot))
    return buildingPlan().slots.filter((s) => (!size || s.size === size) && !taken.has(s.id))
  }
  /** My offices (packages I own) that aren't placed in this world. */
  myUnplaced() { return this.myPackages().filter((p) => !this.findPlaced(p)) }
  canPlace() {
    const v = this.state.view
    return !this.state.isBanned && (v.policy.rooms !== 'closed' || this.state.isMod)
  }

  /** Create a brand-new office owned by me and put it in `slot`. */
  async claim(slot: Slot, floor: number, ownerName: string) {
    const content: RoomContent = {
      v: 1, owner: this.state.me.pub, ownerName, roomId: Math.random().toString(36).slice(2, 10), ver: 1,
      name: `${ownerName}'s office`, size: slot.size, floorStyle: 'office',
      things: slot.size === 'M'
        ? [{ id: 'd1', item: 'office/desk', x: 1, y: 1, f: 'S' }, { id: 'c1', item: 'office/chair', x: 1, y: 2, f: 'N' }, { id: 'p1', item: 'office/plant', x: 10, y: 0, f: 'S' }]
        : [{ id: 'd1', item: 'office/desk', x: 1, y: 1, f: 'S' }, { id: 'c1', item: 'office/chair', x: 1, y: 2, f: 'N' }],
      zones: [{ id: 'room', name: `${ownerName}'s office`, x: 0, y: 0, w: SLOT_SIZES[slot.size].w, h: SLOT_SIZES[slot.size].h }],
      objects: [], code: null,
    }
    const pkg = await signPackage(this.state.me, content)
    await this.accept(pkg)
    await this.place(pkg, slot, floor)
    return pkg
  }

  async place(pkg: RoomPackage, slot: Slot, floor: number) {
    await this.accept(pkg)
    await this.state.author('room.place', { slot: slot.id, floor, owner: pkg.owner, roomId: pkg.roomId, name: pkg.name, size: pkg.size })
    this.ch.send(pkg)
  }

  /** Owner-only: change my office. Re-signs with ver+1 and broadcasts. */
  async edit(pl: Placement, mutate: (c: RoomContent) => void) {
    const cur = this.pkgFor(pl)
    if (!cur || cur.owner !== this.state.me.pub) return
    const { sig: _s, ...content } = cur
    const next: RoomContent = JSON.parse(JSON.stringify(content))
    mutate(next)
    next.ver = cur.ver + 1
    await this.accept(await signPackage(this.state.me, next))
  }

  /** Move an office to another free slot (same size), on any floor. */
  move(pl: Placement, slot: Slot, floor: number) {
    return this.state.author('room.move', { from: { slot: pl.slot, floor: pl.floor }, to: { slot: slot.id, floor } })
  }

  approve(pl: Placement) { return this.state.author('room.approve', { slot: pl.slot, floor: pl.floor }) }
  remove(pl: Placement) { return this.state.author('room.remove', { slot: pl.slot, floor: pl.floor }) }

  async shareLink(pl: { owner: string; roomId: string }, withWorld: string | null) {
    const p = this.pkgFor(pl)
    if (!p) return null
    const token = await packageToToken(p)
    const base = `${location.origin}${location.pathname}${location.search}`
    return `${base}#${withWorld ? `w=${withWorld}&` : ''}r=${token}`
  }

  // ---- scene integration -------------------------------------------------------
  /** Things inside offices on this floor, translated to world coordinates. */
  things(floor: number) {
    const out: { id: string; item: string; x: number; y: number; f: RoomThing['f']; floor: number; editable: boolean; source: 'room'; cfg?: any; ox: number; oy: number }[] = []
    for (const pl of this.onFloor(floor)) {
      const pkg = this.pkgFor(pl)
      const slot = slotById(pl.slot)
      if (!pkg || !slot || pl.pending) continue
      const mine = pkg.owner === this.state.me.pub && !this.state.isBanned
      for (const t of pkg.things) {
        out.push({ id: `${pl.key}/${t.id}`, item: t.item, x: slot.x + t.x, y: slot.y + t.y, f: t.f, floor, editable: mine, source: 'room', cfg: t.cfg, ox: nudge(t.ox), oy: nudge(t.oy) })
      }
    }
    return out
  }

  zones(floor: number): (Zone & { room: string })[] {
    const out: (Zone & { room: string })[] = []
    for (const pl of this.onFloor(floor)) {
      const pkg = this.pkgFor(pl), slot = slotById(pl.slot)
      if (!pkg || !slot || pl.pending) continue
      for (const z of pkg.zones) out.push({ id: `${pl.key}/${z.id}`, name: z.name, x: slot.x + z.x, y: slot.y + z.y, w: z.w, h: z.h, room: pl.key })
    }
    return out
  }

  /** My (active) placement whose slot contains world tile x,y on floor. */
  myPlacementAt(x: number, y: number, floor: number) {
    const slot = buildingPlan().slots.find((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
    if (!slot) return null
    const pl = this.placementAt(slot.id, floor)
    return pl && !pl.pending && pl.owner === this.state.me.pub && !this.state.isBanned && this.pkgFor(pl) ? { pl, slot } : null
  }

  setThing(t: { id: string; item: string; x: number; y: number; f: RoomThing['f']; floor: number; cfg?: any; ox?: number; oy?: number }) {
    const hit = this.myPlacementAt(t.x, t.y, t.floor)
    if (!hit) return
    const localId = t.id.includes('/') ? t.id.split('/').pop()! : t.id
    void this.edit(hit.pl, (c) => {
      c.things = c.things.filter((x) => x.id !== localId)
      c.things.push({ id: localId, item: t.item, x: t.x - hit.slot.x, y: t.y - hit.slot.y, f: t.f, ...(t.cfg ? { cfg: t.cfg } : {}), ...(nudge(t.ox) || nudge(t.oy) ? { ox: nudge(t.ox), oy: nudge(t.oy) } : {}) })
    })
  }

  delThing(id: string) {
    const [key, localId] = [id.slice(0, id.lastIndexOf('/')), id.slice(id.lastIndexOf('/') + 1)]
    const pl = placements(this.state.view).get(key)
    if (!pl || pl.owner !== this.state.me.pub) return
    void this.edit(pl, (c) => { c.things = c.things.filter((x) => x.id !== localId) })
  }

  addZone(r: { x: number; y: number; w: number; h: number }, floor: number, name?: string) {
    const hit = this.myPlacementAt(r.x, r.y, floor)
    if (!hit) return null
    const s = hit.slot
    if (r.x + r.w > s.x + s.w || r.y + r.h > s.y + s.h) return null
    const pkg = this.pkgFor(hit.pl)!
    const local = { x: r.x - s.x, y: r.y - s.y, w: r.w, h: r.h }
    // zones may nest (fully inside or fully around another) but not partially overlap
    const contains = (a: typeof local, b: typeof local) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h
    const overl = pkg.zones.some((z) => local.x < z.x + z.w && z.x < local.x + local.w && local.y < z.y + z.h && z.y < local.y + local.h
      && !contains(z, local) && !contains(local, z))
    if (overl) return null
    const id = 'z' + Math.random().toString(36).slice(2, 7)
    void this.edit(hit.pl, (c) => { c.zones.push({ id, name: name ?? `Zone ${c.zones.length + 1}`, ...local }) })
    return id
  }

  delZone(fullId: string) {
    const key = fullId.slice(0, fullId.lastIndexOf('/')), id = fullId.slice(fullId.lastIndexOf('/') + 1)
    const pl = placements(this.state.view).get(key)
    if (pl?.owner !== this.state.me.pub) return
    void this.edit(pl, (c) => { c.zones = c.zones.filter((z) => z.id !== id) })
  }

  renameZone(fullId: string, name: string) {
    const key = fullId.slice(0, fullId.lastIndexOf('/')), id = fullId.slice(fullId.lastIndexOf('/') + 1)
    const pl = placements(this.state.view).get(key)
    if (pl?.owner !== this.state.me.pub) return
    void this.edit(pl, (c) => { const z = c.zones.find((z) => z.id === id); if (z) z.name = name.slice(0, 32) })
  }

  /** Custom sprites used by offices on this floor. */
  assets(floor: number) {
    return this.onFloor(floor).flatMap((pl) => this.pkgFor(pl)?.assets ?? [])
  }

  async addAsset(pl: Placement, a: CustomAsset) {
    await this.edit(pl, (c) => { c.assets = [...(c.assets ?? []).filter((x) => x.id !== a.id), a].slice(-8) })
  }

  /** Signature of what affects the drawn building (to know when to redraw floors/signs). */
  structureSig(floor: number) {
    return this.onFloor(floor).map((p) => { const k = this.pkgFor(p); return `${p.slot}:${p.pending}:${k?.floorStyle}:${k?.wallStyle}:${k?.name}` }).join('|')
  }
}
