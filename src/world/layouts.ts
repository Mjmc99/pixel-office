import { planFor, type LayoutId } from './building'
import { STARTER_DECOR, STARTER_ZONES } from './starter'
import type { Facing } from './types'

/**
 * Preset floors. Picking a layout (owner or mods) swaps the floor plan and
 * replaces that floor's furniture and call zones with the preset below.
 * The art for the four themed layouts is drawn in Aseprite
 * (tools/aseprite/draw_layouts.lua).
 */
type D = [item: string, x: number, y: number, f?: Facing]
type Z = { id: string; name: string; x: number; y: number; w: number; h: number }
export interface LayoutDef { id: LayoutId; label: string; blurb: string; offices: string; decor: D[]; zones: Z[] }

const row = (item: string, xs: number[], y: number, f: Facing = 'S'): D[] => xs.map((x) => [item, x, y, f])

export const LAYOUTS: LayoutDef[] = [
  {
    id: 'building', label: 'Office building',
    blurb: 'Corridor, lounge, lobby, cafe and library.',
    offices: '4 large + 4 small offices',
    decor: STARTER_DECOR, zones: STARTER_ZONES,
  },
  {
    id: 'starship', label: 'Starship',
    blurb: 'Bridge in the nose, mess hall, cargo bay and a warp core humming aft.',
    offices: '6 crew cabins (small)',
    decor: [
      // bridge (x47-56, y8-23) + nose (x57-59, y11-20)
      ...row('starship/viewport', [48, 51, 54], 8),
      ['starship/helm', 48, 10], ['starship/helm', 53, 10],
      ['starship/chair', 48, 11, 'N'], ['starship/chair', 49, 11, 'N'], ['starship/chair', 53, 11, 'N'], ['starship/chair', 54, 11, 'N'],
      ['starship/tv', 58, 14, 'W'], ['starship/captain_chair', 54, 15, 'E'], ['starship/rug', 51, 14],
      ['starship/plant', 47, 23], ['starship/plant', 56, 23], ['starship/noteboard', 47, 17, 'E'],
      // engine room (x1-9, y8-23)
      ['starship/rug', 4, 14], ['starship/reactor', 4, 14],
      ['starship/crate', 1, 8], ['starship/crate', 2, 8], ['starship/crate', 1, 9],
      ['starship/locker', 7, 8], ['starship/locker', 8, 8], ['starship/locker', 9, 8],
      ['starship/crate', 1, 23], ['starship/crate', 2, 23], ['starship/crate', 9, 23],
      // mess hall (x38-45, y6-12)
      ['starship/mess_table', 40, 8],
      ['starship/chair', 40, 7, 'S'], ['starship/chair', 41, 7, 'S'], ['starship/chair', 40, 10, 'N'], ['starship/chair', 41, 10, 'N'],
      ['starship/chair', 39, 8, 'E'], ['starship/chair', 42, 9, 'W'],
      ['starship/plant', 38, 6], ['starship/plant', 45, 6], ['starship/viewport', 43, 6],
      // cargo bay (x38-45, y19-26)
      ['starship/crate', 38, 19], ['starship/crate', 39, 19], ['starship/crate', 38, 20], ['starship/crate', 44, 26],
      ['starship/crate', 45, 26], ['starship/crate', 45, 25], ['starship/crate', 41, 24], ['starship/portal', 44, 21],
      ['starship/rug', 40, 21],
      // corridor
      ['starship/noteboard', 37, 14],
    ],
    zones: [
      { id: 'bridge', name: 'Bridge', x: 47, y: 8, w: 10, h: 16 },
      { id: 'mess', name: 'Mess hall', x: 38, y: 6, w: 8, h: 7 },
      { id: 'engine', name: 'Engine room', x: 1, y: 8, w: 9, h: 16 },
    ],
  },
  {
    id: 'submarine', label: 'Submarine',
    blurb: 'Control room with periscope and sonar, galley, torpedo room, engine room.',
    offices: '4 bunk rooms (small)',
    decor: [
      // control room (x21-36, y1-7)
      ['submarine/sonar', 22, 1], ['submarine/sonar', 25, 1], ['submarine/chair', 22, 2], ['submarine/chair', 25, 2],
      ['submarine/periscope', 29, 4], ['submarine/chart_table', 32, 4], ['submarine/tv', 35, 1], ['submarine/valves', 36, 1],
      ['submarine/porthole', 30, 1], ['submarine/lamp', 21, 7], ['submarine/lamp', 36, 7],
      // galley (x21-36, y14-19)
      ['submarine/chart_table', 24, 16], ['submarine/chart_table', 31, 16],
      ['submarine/chair', 23, 16], ['submarine/chair', 23, 17], ['submarine/chair', 26, 16], ['submarine/chair', 26, 17],
      ['submarine/chair', 30, 16], ['submarine/chair', 30, 17], ['submarine/chair', 33, 16], ['submarine/chair', 33, 17],
      ['submarine/crate', 21, 19], ['submarine/crate', 22, 19], ['submarine/crate', 36, 19], ['submarine/pipes', 36, 14],
      // torpedo room (x50-58, y5-17)
      ['submarine/torpedo', 51, 9], ['submarine/torpedo', 51, 11], ['submarine/torpedo', 51, 13],
      ['submarine/porthole', 53, 5], ['submarine/porthole', 56, 5], ['submarine/ballast', 57, 7], ['submarine/ballast', 58, 7],
      ['submarine/diving_suit', 56, 16], ['submarine/crate', 57, 17], ['submarine/crate', 58, 17], ['submarine/lamp', 50, 17],
      // engine room (x1-9, y5-17)
      ['submarine/pipes', 1, 5], ['submarine/pipes', 2, 5], ['submarine/porthole', 4, 5], ['submarine/porthole', 6, 5],
      ['submarine/valves', 8, 5], ['submarine/pipes', 9, 5],
      ['submarine/ballast', 1, 9], ['submarine/ballast', 1, 10], ['submarine/ballast', 1, 11],
      ['submarine/rug', 4, 10], ['submarine/crate', 1, 17], ['submarine/crate', 2, 17], ['submarine/lamp', 9, 17],
      // passageway
      ['submarine/noteboard', 35, 9], ['submarine/portal', 48, 10],
    ],
    zones: [
      { id: 'control', name: 'Control room', x: 21, y: 1, w: 16, h: 7 },
      { id: 'galley', name: 'Galley', x: 21, y: 14, w: 16, h: 6 },
      { id: 'torpedo', name: 'Torpedo room', x: 50, y: 5, w: 9, h: 13 },
    ],
  },
  {
    id: 'apartment', label: 'Neon apartment',
    blurb: 'Sci-fi/cyberpunk penthouse: city-view living room, kitchen bar, balcony.',
    offices: '3 bedrooms (large)',
    decor: [
      // living room (x1-24, y1-14)
      ...row('apartment/window', [2, 5, 8, 11], 1),
      ['apartment/neon_sign', 14, 1], ['apartment/tv', 16, 1], ['apartment/plant', 19, 1], ['apartment/window', 21, 1], ['apartment/plant', 24, 1],
      ['apartment/rug', 15, 4], ['apartment/coffee_table', 15, 4], ['apartment/sofa', 15, 6, 'N'], ['apartment/lamp', 18, 6],
      ['apartment/rug', 4, 5], ['apartment/sofa', 4, 4], ['apartment/coffee_table', 4, 6], ['apartment/lamp', 6, 4], ['apartment/plant', 1, 4],
      ['apartment/desk', 3, 10], ['apartment/chair', 3, 11, 'N'], ['apartment/server', 5, 10], ['apartment/lamp', 1, 10],
      ['apartment/plant', 1, 14], ['apartment/lamp', 24, 14], ['apartment/rug', 20, 11],
      // kitchen (x26-39, y1-9)
      ['apartment/kitchen', 27, 1], ['apartment/kitchen', 29, 1], ['apartment/fridge', 31, 1], ['apartment/neon_sign', 33, 1],
      ['apartment/plant', 39, 1],
      ['apartment/coffee_table', 28, 5], ['apartment/chair', 28, 4, 'S'], ['apartment/chair', 29, 4, 'S'],
      ['apartment/chair', 28, 6, 'N'], ['apartment/chair', 29, 6, 'N'],
      // balcony (x41-48, y1-9)
      ['apartment/plant', 41, 1], ['apartment/plant', 48, 1], ['apartment/plant', 41, 9], ['apartment/plant', 48, 9],
      ['apartment/sofa', 43, 3], ['apartment/coffee_table', 43, 5], ['apartment/lamp', 46, 3], ['apartment/portal', 46, 7],
      // hallway
      ['apartment/noteboard', 26, 16], ['apartment/plant', 1, 16],
    ],
    zones: [
      { id: 'couch', name: 'Couch', x: 13, y: 3, w: 7, h: 5 },
      { id: 'bar', name: 'Kitchen bar', x: 27, y: 3, w: 5, h: 5 },
      { id: 'balcony', name: 'Balcony', x: 41, y: 1, w: 8, h: 9 },
    ],
  },
  {
    id: 'tavern', label: 'Adventurer\'s hall',
    blurb: 'For tabletop nights: a big gaming table with minis and dice, banners, torches.',
    offices: 'No offices',
    decor: [
      // the table (x13-16, y8-10) and its players
      ['tavern/game_table', 13, 8],
      ...row('tavern/chair', [13, 14, 15, 16], 7, 'S'), ...row('tavern/chair', [13, 14, 15, 16], 11, 'N'),
      ['tavern/chair', 12, 9, 'E'], ['tavern/chair', 17, 9, 'W'],
      ['tavern/candelabra', 11, 6], ['tavern/candelabra', 18, 6], ['tavern/candelabra', 11, 12], ['tavern/candelabra', 18, 12],
      // walls of the great hall (x1-30, y1-20)
      ['tavern/armor', 1, 1], ...row('tavern/banner', [3, 7, 22, 26], 1), ['tavern/torch', 11, 1], ['tavern/statue', 14, 1],
      ['tavern/torch', 18, 1], ['tavern/noteboard', 20, 1], ['tavern/tv', 28, 1], ['tavern/armor', 30, 1],
      ['tavern/chest', 27, 3], ['tavern/weapon_rack', 1, 8, 'E'], ['tavern/potion_shelf', 1, 13, 'E'],
      ['tavern/brazier', 6, 16], ['tavern/brazier', 24, 16], ['tavern/rug', 24, 9], ['tavern/portal', 6, 9],
      ['tavern/barrel', 28, 18], ['tavern/barrel', 29, 18], ['tavern/barrel', 29, 19], ['tavern/barrel', 30, 19],
      ['tavern/rug', 13, 15], ['tavern/chest', 16, 15],
      // library (x32-41, y1-10)
      ...row('tavern/bookshelf', [32, 34, 36, 38, 40], 1), ['tavern/rug', 35, 5],
      ['tavern/chair', 35, 7, 'N'], ['tavern/chair', 37, 7, 'N'], ['tavern/candelabra', 41, 5], ['tavern/chest', 41, 10],
      ['tavern/potion_shelf', 32, 9],
      // entry (x32-41, y12-20)
      ['tavern/torch', 32, 12], ['tavern/torch', 41, 12], ['tavern/noteboard', 34, 12], ['tavern/banner', 37, 12],
      ['tavern/barrel', 32, 20],
    ],
    zones: [
      { id: 'table', name: 'The table', x: 11, y: 6, w: 9, h: 8 },
      { id: 'library', name: 'Library', x: 32, y: 1, w: 10, h: 10 },
    ],
  },
]

export const layoutDef = (id: string) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]

/** The signed ops that turn `floor` into layout `id`: the layout itself, then its zones and furniture. */
export function layoutOps(id: LayoutId, floor: number) {
  const def = layoutDef(id)
  const tag = `${id.slice(0, 3)}${floor}-${Math.random().toString(36).slice(2, 6)}`
  return [
    { t: 'layout', p: { floor, layout: id } },
    ...def.zones.map((z) => ({ t: 'zone.set', p: { ...z, id: `${tag}-${z.id}`, floor } })),
    ...def.decor.map(([item, x, y, f], i) => ({ t: 'decor.set', p: { id: `${tag}-${i}`, item, x, y, f: f ?? 'S', floor } })),
  ]
}

/** How many offices a layout has. */
export const officeCount = (id: LayoutId) => planFor(id).slots.length
