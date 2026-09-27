/**
 * Floor plans. Each floor of a world uses one layout (picked by the owner or
 * a mod): the office building below, a starship, a submarine, an apartment,
 * or a tabletop hall. The default "building" layout:
 *
 *   y 1-13   north offices (M slots, 12x13 inside) + library, doors onto the corridor
 *   y 15-17  main corridor, full width
 *   y 19-24  south offices (S slots, 8x6 inside), doors onto the corridor
 *   x 27-34  spine from the corridor down to the lobby (y 18-36)
 *   y 27-36  lounge (west) · lobby with elevator (centre) · cafe (east)
 *
 * Plans are computed, not stored, so every peer draws the same floors.
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

export const SLOT_SIZES: Record<SlotSize, { w: number; h: number }> = { M: { w: 12, h: 13 }, S: { w: 8, h: 6 } }

export interface Plan {
  w: number; h: number
  tiles: Uint8Array
  regions: Region[]
  slots: Slot[]
  spawn: { x: number; y: number }
  elevator: Rect
  /** default theme for this plan's walls (and a hint for the palette) */
  theme: string
  /** floor style for carved tiles outside any region (doorways, openings) */
  floorStyle: string
}

/** Floor layouts a world owner or mod can pick per floor. */
export const LAYOUT_IDS = ['building', 'starship', 'submarine', 'apartment', 'tavern'] as const
export type LayoutId = typeof LAYOUT_IDS[number]
export const isLayout = (v: unknown): v is LayoutId => LAYOUT_IDS.includes(v as LayoutId)

/** Small plan-building kit: carve rooms out of solid wall. */
function makePlan(w: number, h: number, theme: string, spawn: { x: number; y: number }, elevator: Rect,
  build: (k: { region: (id: string, name: string, kind: Region['kind'], style: string, r: Rect) => void; carve: (r: Rect) => void; slot: (id: string, size: SlotSize, x: number, y: number, doorSide: 'N' | 'S', name?: string) => void }) => void): Plan {
  const tiles = new Uint8Array(w * h).fill(WALL)
  const regions: Region[] = []
  const slots: Slot[] = []
  const carve = (r: Rect) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y * w + x] = FLOOR
  }
  const region = (id: string, name: string, kind: Region['kind'], style: string, r: Rect) => {
    carve(r); regions.push({ id, name, kind, style, ...r })
  }
  const slot = (id: string, size: SlotSize, x: number, y: number, doorSide: 'N' | 'S', name?: string) => {
    const { w: sw, h: sh } = SLOT_SIZES[size]
    region(id, name ?? `Office ${id}`, 'slot', theme === 'office' ? 'empty' : `${theme}:1`, { x, y, w: sw, h: sh })
    const door = { x: x + sw / 2 - 1, y: doorSide === 'S' ? y + sh : y - 1, w: 2, h: 1 }
    carve(door)
    slots.push({ id, size, x, y, w: sw, h: sh, door, doorSide })
  }
  build({ region, carve, slot })
  return { w, h, tiles, regions, slots, spawn, elevator, theme, floorStyle: theme === 'office' ? 'corridor' : `${theme}:0` }
}

const cache = new Map<string, Plan>()

/** The plan for a layout (computed, not stored, so every peer draws the same floor). */
export function planFor(layout: string | undefined): Plan {
  const id = isLayout(layout) ? layout : 'building'
  let p = cache.get(id)
  if (!p) { p = PLANS[id](); cache.set(id, p) }
  return p
}

/** The plan of one floor, given the world's per-floor layouts. */
export const planOf = (layouts: Map<number, string> | undefined, floor: number) => planFor(layouts?.get(floor))

export function buildingPlan(): Plan { return planFor('building') }

const PLANS: Record<LayoutId, () => Plan> = {
  building: () => makePlan(FLOOR_W, FLOOR_H, 'office', { x: 31, y: 33 }, { x: 30, y: 35, w: 2, h: 1 }, ({ region, carve, slot }) => {
    region('corridor', 'Corridor', 'corridor', 'corridor', { x: 1, y: 15, w: 60, h: 3 })
    region('spine', 'Hall', 'corridor', 'corridor', { x: 27, y: 18, w: 8, h: 9 })
    region('lounge', 'Lounge', 'common', 'lounge', { x: 1, y: 27, w: 25, h: 10 })
    region('lobby', 'Lobby', 'lobby', 'lobby', { x: 27, y: 27, w: 8, h: 10 })
    region('cafe', 'Cafe', 'common', 'cafe', { x: 36, y: 27, w: 25, h: 10 })
    carve({ x: 26, y: 30, w: 1, h: 3 }) // lounge <-> lobby
    carve({ x: 35, y: 30, w: 1, h: 3 }) // lobby <-> cafe
    // north offices
    let n = 0
    for (let x = 1; x + 12 <= 61; x += 13) slot(`N${++n}`, 'M', x, 1, 'S')
    region('library', 'Library', 'common', 'library', { x: 53, y: 1, w: 8, h: 13 })
    carve({ x: 56, y: 14, w: 2, h: 1 })
    // south offices (skipping the spine)
    let s = 0
    for (let x = 1; x + 8 <= 61; x += 9) {
      if (x + 8 > 26 && x < 36) continue
      slot(`S${++s}`, 'S', x, 19, 'N')
    }
  }),

  // Engine room aft (west), cabins along a central corridor, mess + cargo bay, bridge in the nose (east).
  starship: () => makePlan(61, 28, 'starship', { x: 14, y: 15 }, { x: 11, y: 16, w: 2, h: 1 }, ({ region, carve, slot }) => {
    region('engine', 'Engine room', 'common', 'starship:1', { x: 1, y: 8, w: 9, h: 16 })
    region('corridor', 'Main corridor', 'corridor', 'starship:0', { x: 10, y: 14, w: 36, h: 4 })
    let c = 0
    for (const x of [11, 20, 29]) slot(`C${++c}`, 'S', x, 7, 'S', `Cabin C${c}`)
    for (const x of [11, 20, 29]) slot(`C${++c}`, 'S', x, 19, 'N', `Cabin C${c}`)
    region('mess', 'Mess hall', 'common', 'starship:0', { x: 38, y: 6, w: 8, h: 7 })
    carve({ x: 40, y: 13, w: 4, h: 1 })
    region('cargo', 'Cargo bay', 'common', 'starship:1', { x: 38, y: 19, w: 8, h: 8 })
    carve({ x: 40, y: 18, w: 4, h: 1 })
    region('bridge', 'Bridge', 'common', 'starship:0', { x: 47, y: 8, w: 10, h: 16 })
    region('nose', 'Bridge', 'common', 'starship:0', { x: 57, y: 11, w: 3, h: 10 })
    carve({ x: 46, y: 14, w: 1, h: 4 })
  }),

  // A long hull: engine room aft, bunks and the control room amidships, torpedo room in the bow.
  submarine: () => makePlan(61, 21, 'submarine', { x: 22, y: 11 }, { x: 20, y: 10, w: 2, h: 1 }, ({ region, carve, slot }) => {
    region('engine', 'Engine room', 'common', 'submarine:1', { x: 1, y: 5, w: 9, h: 13 })
    region('corridor', 'Passageway', 'corridor', 'submarine:0', { x: 10, y: 9, w: 40, h: 4 })
    slot('B1', 'S', 12, 2, 'S', 'Bunk room B1'); slot('B2', 'S', 39, 2, 'S', 'Bunk room B2')
    slot('B3', 'S', 12, 14, 'N', 'Bunk room B3'); slot('B4', 'S', 39, 14, 'N', 'Bunk room B4')
    region('control', 'Control room', 'common', 'submarine:0', { x: 21, y: 1, w: 16, h: 7 })
    carve({ x: 25, y: 8, w: 8, h: 1 })
    region('galley', 'Galley', 'common', 'submarine:0', { x: 21, y: 14, w: 16, h: 6 })
    carve({ x: 25, y: 13, w: 8, h: 1 })
    region('torpedo', 'Torpedo room', 'common', 'submarine:1', { x: 50, y: 5, w: 9, h: 13 })
    region('bow', 'Torpedo room', 'common', 'submarine:1', { x: 59, y: 8, w: 1, h: 6 })
  }),

  // A penthouse: living room with a city view, kitchen, balcony, and three bedrooms off the hallway.
  apartment: () => makePlan(50, 35, 'apartment', { x: 35, y: 17 }, { x: 36, y: 18, w: 2, h: 1 }, ({ region, carve, slot }) => {
    region('living', 'Living room', 'common', 'apartment:0', { x: 1, y: 1, w: 24, h: 14 })
    region('kitchen', 'Kitchen', 'common', 'apartment:0', { x: 26, y: 1, w: 14, h: 9 })
    carve({ x: 25, y: 3, w: 1, h: 5 })
    region('balcony', 'Balcony', 'common', 'apartment:1', { x: 41, y: 1, w: 8, h: 9 })
    carve({ x: 40, y: 3, w: 1, h: 4 })
    region('hall', 'Hallway', 'corridor', 'apartment:1', { x: 1, y: 16, w: 39, h: 4 })
    carve({ x: 8, y: 15, w: 7, h: 1 })
    carve({ x: 30, y: 10, w: 4, h: 6 })
    let b = 0
    for (const x of [1, 14, 27]) slot(`R${++b}`, 'M', x, 21, 'N', `Bedroom R${b}`)
  }),

  // Tabletop night: one great hall with the gaming table, a library nook and an entry. No offices.
  tavern: () => makePlan(43, 22, 'tavern', { x: 36, y: 17 }, { x: 38, y: 19, w: 2, h: 1 }, ({ region, carve }) => {
    region('hall', 'Great hall', 'common', 'tavern:0', { x: 1, y: 1, w: 30, h: 20 })
    region('library', 'Library', 'common', 'tavern:1', { x: 32, y: 1, w: 10, h: 10 })
    carve({ x: 31, y: 4, w: 1, h: 4 })
    region('entry', 'Entry', 'common', 'tavern:1', { x: 32, y: 12, w: 10, h: 9 })
    carve({ x: 31, y: 14, w: 1, h: 4 })
  }),
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
const wallCache = new WeakMap<Plan, Map<number, string[]>>()
export function wallSlots(p: Plan = buildingPlan()): Map<number, string[]> {
  let out = wallCache.get(p)
  if (out) return out
  out = new Map<number, string[]>()
  for (const s of p.slots) {
    for (let y = s.y - 1; y <= s.y + s.h; y++) {
      for (let x = s.x - 1; x <= s.x + s.w; x++) {
        if (inside(s, x, y) || tileAt(p, x, y) !== WALL) continue
        const i = y * p.w + x
        out.set(i, [...(out.get(i) ?? []), s.id])
      }
    }
  }
  wallCache.set(p, out)
  return out
}

export const inside = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
