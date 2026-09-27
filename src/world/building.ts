/**
 * The office building template. Every floor uses the same plan:
 *
 *   y 1-13   north offices (M slots, 12x13 inside) + library, doors onto the corridor
 *   y 15-17  main corridor, full width
 *   y 19-24  south offices (S slots, 8x6 inside), doors onto the corridor
 *   x 27-34  spine from the corridor down to the lobby (y 18-36)
 *   y 27-36  lounge (west) · lobby with elevator (centre) · cafe (east)
 *
 * The plan is computed, not stored, so every peer draws the same building.
 * What changes per world (furniture, zones, placed rooms) lives in the
 * signed op log (state.ts).
 */
export const FLOOR_W = 62
export const FLOOR_H = 38

export const VOID = 0, FLOOR = 1, WALL = 2
export type SlotSize = 'M' | 'S'

export interface Rect { x: number; y: number; w: number; h: number }
export interface Region extends Rect { id: string; name: string; kind: 'corridor' | 'lobby' | 'common' | 'slot'; style: string }
export interface Slot extends Rect { id: string; size: SlotSize; door: Rect; doorSide: 'N' | 'S' }

export interface Plan {
  w: number; h: number
  tiles: Uint8Array
  regions: Region[]
  slots: Slot[]
  spawn: { x: number; y: number }
  elevator: Rect
}

export const SLOT_SIZES: Record<SlotSize, { w: number; h: number }> = { M: { w: 12, h: 13 }, S: { w: 8, h: 6 } }

let cached: Plan | null = null

export function buildingPlan(): Plan {
  if (cached) return cached
  const w = FLOOR_W, h = FLOOR_H
  const tiles = new Uint8Array(w * h).fill(WALL)
  const regions: Region[] = []
  const slots: Slot[] = []
  const carve = (r: Rect) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y * w + x] = FLOOR
  }
  const region = (id: string, name: string, kind: Region['kind'], style: string, r: Rect) => {
    carve(r); regions.push({ id, name, kind, style, ...r })
  }

  region('corridor', 'Corridor', 'corridor', 'corridor', { x: 1, y: 15, w: 60, h: 3 })
  region('spine', 'Hall', 'corridor', 'corridor', { x: 27, y: 18, w: 8, h: 9 })
  region('lounge', 'Lounge', 'common', 'lounge', { x: 1, y: 27, w: 25, h: 10 })
  region('lobby', 'Lobby', 'lobby', 'lobby', { x: 27, y: 27, w: 8, h: 10 })
  region('cafe', 'Cafe', 'common', 'cafe', { x: 36, y: 27, w: 25, h: 10 })
  carve({ x: 26, y: 30, w: 1, h: 3 }) // lounge <-> lobby
  carve({ x: 35, y: 30, w: 1, h: 3 }) // lobby <-> cafe

  // north offices
  let n = 0
  for (let x = 1; x + 12 <= 61; x += 13) {
    const id = `N${++n}`
    region(id, `Office ${id}`, 'slot', 'empty', { x, y: 1, w: 12, h: 13 })
    const door = { x: x + 5, y: 14, w: 2, h: 1 }
    carve(door)
    slots.push({ id, size: 'M', x, y: 1, w: 12, h: 13, door, doorSide: 'S' })
  }
  region('library', 'Library', 'common', 'library', { x: 53, y: 1, w: 8, h: 13 })
  carve({ x: 56, y: 14, w: 2, h: 1 })

  // south offices (skipping the spine)
  let s = 0
  for (let x = 1; x + 8 <= 61; x += 9) {
    if (x + 8 > 26 && x < 36) continue
    const id = `S${++s}`
    region(id, `Office ${id}`, 'slot', 'empty', { x, y: 19, w: 8, h: 6 })
    const door = { x: x + 3, y: 18, w: 2, h: 1 }
    carve(door)
    slots.push({ id, size: 'S', x, y: 19, w: 8, h: 6, door, doorSide: 'N' })
  }

  cached = { w, h, tiles, regions, slots, spawn: { x: 31, y: 33 }, elevator: { x: 30, y: 35, w: 2, h: 1 } }
  return cached
}

export function tileAt(p: Plan, x: number, y: number) {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return VOID
  return p.tiles[y * p.w + x]
}

export const isWallTile = (p: Plan, x: number, y: number) => tileAt(p, x, y) !== FLOOR

export function regionAt(p: Plan, x: number, y: number): Region | null {
  return p.regions.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ?? null
}

export function slotAt(p: Plan, x: number, y: number): Slot | null {
  return p.slots.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ?? null
}

/**
 * Which offices each wall tile belongs to (tile index -> slot ids, west first).
 * A wall belongs to an office when it touches the office's floor, so a wall
 * shared by two offices lists both; the first one that is placed styles it.
 */
let wallCache: Map<number, string[]> | null = null
export function wallSlots(): Map<number, string[]> {
  if (wallCache) return wallCache
  const p = buildingPlan()
  const out = new Map<number, string[]>()
  for (const s of p.slots) {
    for (let y = s.y - 1; y <= s.y + s.h; y++) {
      for (let x = s.x - 1; x <= s.x + s.w; x++) {
        if (inside(s, x, y) || tileAt(p, x, y) !== WALL) continue
        const i = y * p.w + x
        out.set(i, [...(out.get(i) ?? []), s.id])
      }
    }
  }
  return (wallCache = out)
}

export const inside = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
