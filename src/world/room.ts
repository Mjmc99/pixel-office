import type { Facing, ItemDef } from './types'

/** Anything with a position + facing that references an item definition. */
export interface Placement { id?: string; item: string; x: number; y: number; f: Facing }

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
 * Can `def` go at (x, y, f)? It can't cover a blocked tile (walls, other
 * people's offices…). Solid items can't overlap other solid items; flat items
 * (rugs, ponds) can't overlap other flat items but may sit under furniture.
 */
export function canPlace(
  def: ItemDef, x: number, y: number, f: Facing,
  placed: Iterable<Placement>, defs: Map<string, ItemDef>,
  blocked: (x: number, y: number) => boolean, ignore?: string,
) {
  const mine = tilesOf(def, { x, y, f })
  if (mine.some(([tx, ty]) => blocked(tx, ty))) return false
  const taken = new Set<string>()
  for (const p of placed) {
    if (p.id && p.id === ignore) continue
    const d = defs.get(p.item)
    if (!d || d.flat !== def.flat) continue
    for (const [tx, ty] of tilesOf(d, p)) taken.add(tx + ',' + ty)
  }
  return !mine.some(([tx, ty]) => taken.has(tx + ',' + ty))
}

/** Tiles avatars can't walk through. */
export function solidTiles(placed: Iterable<Placement>, defs: Map<string, ItemDef>, into = new Set<string>()) {
  for (const p of placed) {
    const d = defs.get(p.item)
    if (!d || d.flat) continue
    for (const [tx, ty] of tilesOf(d, p)) into.add(tx + ',' + ty)
  }
  return into
}
