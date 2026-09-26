import type { Facing, ItemDef, Placed } from './types'

/** Phase 0: one room. Later phases generate a whole building of these. */
export const ROOM_W = 20          // interior tiles
export const ROOM_H = 13
// map coords include the wall ring: walls at x=0, x=ROOM_W+1, y=0, y=ROOM_H+1
export const MAP_W = ROOM_W + 2
export const MAP_H = ROOM_H + 2

export function isWall(x: number, y: number) {
  return x <= 0 || y <= 0 || x >= MAP_W - 1 || y >= MAP_H - 1
}

export function footprint(def: ItemDef, f: Facing) {
  const v = def.views[f]
  return { w: v.w, d: v.d }
}

/** Tiles covered by a placed item. */
export function tilesOf(def: ItemDef, p: { x: number; y: number; f: Facing }) {
  const { w, d } = footprint(def, p.f)
  const out: [number, number][] = []
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < d; dy++) out.push([p.x + dx, p.y + dy])
  return out
}

/**
 * Can `def` go at (x, y, f)? Solid items can't overlap walls or other solid
 * items; flat items (rugs) can't overlap other flat items but may sit under
 * furniture. `ignore` skips one placed id (when rotating in place).
 */
export function canPlace(
  def: ItemDef, x: number, y: number, f: Facing,
  placed: Map<string, Placed>, defs: Map<string, ItemDef>, ignore?: string,
) {
  const mine = tilesOf(def, { x, y, f })
  if (mine.some(([tx, ty]) => isWall(tx, ty))) return false
  const taken = new Set<string>()
  for (const [id, p] of placed) {
    if (id === ignore) continue
    const d = defs.get(p.item)
    if (!d || d.flat !== def.flat) continue
    for (const [tx, ty] of tilesOf(d, p)) taken.add(tx + ',' + ty)
  }
  return !mine.some(([tx, ty]) => taken.has(tx + ',' + ty))
}

/** Tiles avatars can't walk through. */
export function solidTiles(placed: Map<string, Placed>, defs: Map<string, ItemDef>) {
  const s = new Set<string>()
  for (const p of placed.values()) {
    const d = defs.get(p.item)
    if (!d || d.flat) continue
    for (const [tx, ty] of tilesOf(d, p)) s.add(tx + ',' + ty)
  }
  return s
}

/** A furnished starter room so a new world isn't empty. */
export function starterLayout(): Placed[] {
  const P = (item: string, x: number, y: number, f: Facing = 'S'): Placed => ({ item, x, y, f, by: 'starter' })
  return [
    P('office/rug', 7, 6),
    P('office/sofa', 8, 5, 'S'),
    P('office/coffee_table', 8, 7),
    P('office/tv', 8, 10, 'N'),
    P('office/desk', 2, 2), P('office/chair', 2, 3, 'N'),
    P('office/desk', 5, 2), P('office/chair', 5, 3, 'N'),
    P('office/bookshelf', 14, 1),
    P('office/bookshelf', 15, 1),
    P('office/whiteboard', 17, 2),
    P('office/plant', 1, 1),
    P('office/plant', 20, 12),
    P('office/lamp', 12, 5),
    P('office/water_cooler', 20, 1),
    P('office/meeting_table', 15, 8),
    P('office/chair', 15, 7, 'S'), P('office/chair', 17, 7, 'S'),
    P('office/chair', 15, 10, 'N'), P('office/chair', 17, 10, 'N'),
    P('office/chair', 14, 8, 'E'), P('office/chair', 18, 9, 'W'),
    P('office/filing_cabinet', 1, 12),
  ]
}
