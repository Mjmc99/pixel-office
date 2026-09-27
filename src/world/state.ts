import * as Y from 'yjs'
import { Emitter } from '../net/transport'
import { canonical, idFromKey, sign, verify, type Identity } from './crypto'
import { buildingPlan, inside, slotAt } from './building'
import type { Facing } from './types'

/**
 * The world's shared state is an append-only log of signed operations
 * (a Y.Array, so peers merge it without a server). Every peer replays the
 * log in (ts, id) order and applies an op only if its signature is valid
 * and its author had the right role at that point. A modified client can
 * append junk, but nobody else will apply it.
 *
 * Ownership is rooted in the world id itself: id = hash(ownerKey + nonce),
 * so only the key that created the world can write its genesis op.
 */
export interface Op { id: string; t: string; p: any; by: string; ts: number; sig: string }

export interface ZoneDef { id: string; name: string; x: number; y: number; w: number; h: number; floor: number; stage?: boolean; room?: string }
export interface DecorDef { id: string; item: string; x: number; y: number; f: Facing; floor: number; by: string; room?: string; cfg?: any; ox?: number; oy?: number }
/** Off-grid placement: a pixel offset of at most half a tile from the anchor tile (untrusted input). */
export const nudge = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 8 ? v : 0)
export interface Policy { decor: 'everyone' | 'mods'; rooms: 'open' | 'approval' | 'closed' }

export interface View {
  owner: string | null
  name: string
  mods: Set<string>
  bans: Set<string>
  policy: Policy
  floors: number
  themes: Map<number, string>
  zones: Map<string, ZoneDef>
  decor: Map<string, DecorDef>
  /** extension point for later phases (rooms, objects, …) */
  ext: Map<string, Map<string, any>>
}

const emptyView = (): View => ({
  owner: null, name: 'Pixel Office', mods: new Set(), bans: new Set(),
  policy: { decor: 'mods', rooms: 'open' }, floors: 1, themes: new Map(),
  zones: new Map(), decor: new Map(), ext: new Map(),
})

export const opMessage = (o: Omit<Op, 'sig'>) => canonical([o.id, o.t, o.p, o.by, o.ts])

/** Hooks later phases use to add op types without touching the core. */
export type OpHandler = (v: View, op: Op, role: { owner: boolean; mod: boolean; banned: boolean }) => void
const handlers = new Map<string, OpHandler>()
export function registerOp(t: string, h: OpHandler) { handlers.set(t, h) }

export class WorldState {
  readonly onChange = new Emitter<[View]>()
  readonly log: Y.Array<Op>
  view: View = emptyView()
  private verdict = new Map<string, boolean>()
  private running?: Promise<void>
  private dirty = false

  constructor(doc: Y.Doc, public me: Identity, readonly worldId: string) {
    this.log = doc.getArray<Op>('ops')
    this.log.observe(() => void this.refresh())
    void this.refresh()
  }

  get isOwner() { return this.view.owner === this.me.pub }
  get isMod() { return this.isOwner || this.view.mods.has(this.me.pub) }
  get isBanned() { return this.view.bans.has(this.me.pub) }
  canDecorate() { return !this.isBanned && (this.isMod || this.view.policy.decor === 'everyone') }
  roleOf(uid: string) { return uid === this.view.owner ? 'owner' : this.view.mods.has(uid) ? 'mod' : 'member' }

  /** Sign and append an op. Resolves once it's in the local log (peers get it via Yjs). */
  async author(t: string, p: unknown) {
    const base = { id: Math.random().toString(36).slice(2, 12), t, p, by: this.me.pub, ts: Date.now() }
    const op: Op = { ...base, sig: await sign(this.me, opMessage(base)) }
    this.verdict.set(op.id, true)
    this.log.push([op])
    await this.refresh()
    return op
  }

  /** Sign several ops and append them in one Yjs transaction (one network message). */
  async authorMany(list: { t: string; p: unknown }[]) {
    const ts = Date.now()
    const ops: Op[] = []
    for (const [i, { t, p }] of list.entries()) {
      const base = { id: Math.random().toString(36).slice(2, 12), t, p, by: this.me.pub, ts: ts + i }
      ops.push({ ...base, sig: await sign(this.me, opMessage(base)) })
    }
    for (const o of ops) this.verdict.set(o.id, true)
    this.log.push(ops)
    await this.refresh()
  }

  /** Create the world: genesis op proving ownership of the world id. */
  static newWorldId(pub: string) {
    const nonce = Math.random().toString(36).slice(2, 10)
    return { id: idFromKey(pub + ':' + nonce), nonce }
  }

  /** Verify any new ops, then replay. Coalesces bursts; always ends up current. */
  refresh(): Promise<void> {
    this.dirty = true
    if (!this.running) {
      this.running = (async () => {
        while (this.dirty) {
          this.dirty = false
          const ops = this.log.toArray()
          await Promise.all(ops.filter((o) => o && !this.verdict.has(o.id)).map(async (o) => {
            const ok = typeof o.sig === 'string' && typeof o.by === 'string' && await verify(o.by, opMessage(o), o.sig)
            this.verdict.set(o.id, ok)
          }))
          this.view = this.replay(ops)
          this.onChange.emit(this.view)
        }
      })().finally(() => { this.running = undefined })
    }
    return this.running
  }

  private replay(ops: Op[]): View {
    const v = emptyView()
    const plan = buildingPlan()
    const sorted = ops.filter((o) => this.verdict.get(o.id)).sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1))
    for (const op of sorted) {
      const owner = op.by === v.owner
      const mod = owner || v.mods.has(op.by)
      const banned = v.bans.has(op.by)
      const p = op.p ?? {}
      switch (op.t) {
        case 'genesis':
          if (!v.owner && idFromKey(op.by + ':' + p.nonce) === this.worldId) {
            v.owner = op.by
            v.name = String(p.name ?? 'Pixel Office').slice(0, 40)
          }
          break
        case 'role':
          if (owner && p.target !== v.owner) p.role === 'mod' ? v.mods.add(p.target) : v.mods.delete(p.target)
          break
        case 'ban':
          if (mod && !banned && p.target !== v.owner && !(v.mods.has(p.target) && !owner)) {
            p.on ? v.bans.add(p.target) : v.bans.delete(p.target)
          }
          break
        case 'policy':
          if (owner) {
            if (p.decor === 'everyone' || p.decor === 'mods') v.policy.decor = p.decor
            if (['open', 'approval', 'closed'].includes(p.rooms)) v.policy.rooms = p.rooms
          }
          break
        case 'name':
          if (owner) v.name = String(p.name ?? v.name).slice(0, 40)
          break
        case 'floors':
          if (mod) v.floors = Math.max(1, Math.min(9, Math.floor(p.count)))
          break
        case 'theme':
          if (mod && typeof p.theme === 'string') v.themes.set(Number(p.floor) || 0, p.theme)
          break
        case 'zone.set': {
          const z = p as ZoneDef
          const okRect = z.w >= 1 && z.h >= 1 && z.x >= 1 && z.y >= 1 && z.x + z.w < plan.w && z.y + z.h < plan.h
          // zones inside an office belong to that room (phase 3); commons are for mods
          if (mod && !banned && okRect && !z.room) v.zones.set(z.id, { ...z, name: String(z.name).slice(0, 32), stage: !!z.stage })
          break
        }
        case 'zone.del':
          if (mod && !v.zones.get(p.id)?.room) v.zones.delete(p.id)
          break
        case 'decor.set': {
          const d = p as DecorDef
          const allowed = !banned && (mod || v.policy.decor === 'everyone')
          const inSlot = !!slotAt(plan, d.x, d.y)
          if (allowed && !inSlot && d.floor < v.floors) v.decor.set(d.id, { ...d, by: op.by })
          break
        }
        case 'asset.set': {
          const a = p ?? {}
          const assets = v.ext.get('assets') ?? new Map()
          v.ext.set('assets', assets)
          if (mod && !banned && typeof a.png === 'string' && a.png.length <= 90_000 && a.png.startsWith('data:image/png')) {
            assets.set(String(a.id), { id: String(a.id), name: String(a.name ?? 'Custom').slice(0, 32), w: clampInt(a.w, 1, 4), d: clampInt(a.d, 1, 4), frames: a.frames === 4 ? 4 : 1, png: a.png, by: op.by })
          }
          break
        }
        case 'asset.del':
          if (mod) v.ext.get('assets')?.delete(p.id)
          break
        case 'decor.del':
          if (!banned && (mod || v.policy.decor === 'everyone')) v.decor.delete(p.id)
          break
        default: {
          const h = handlers.get(op.t)
          if (h) h(v, op, { owner, mod, banned })
        }
      }
    }
    return v
  }
}

const clampInt = (n: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(Number(n) || lo)))

export { inside }
