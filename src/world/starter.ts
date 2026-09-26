import type { Facing } from './types'

/** Furniture and call zones a brand-new world starts with (floor 0). */
type D = [item: string, x: number, y: number, f?: Facing]
export const STARTER_DECOR: D[] = [
  // Lounge (x1-25, y27-36)
  ['office/rug', 4, 31], ['office/sofa', 4, 30], ['office/sofa', 6, 30], ['office/coffee_table', 5, 32],
  ['office/tv', 5, 35, 'N'], ['office/plant', 1, 27], ['office/plant', 1, 36], ['office/lamp', 9, 30],
  ['cabin/fireplace', 12, 27], ['cabin/rug', 11, 29], ['cabin/armchair', 11, 30, 'N'], ['cabin/armchair', 14, 30, 'N'],
  ['cabin/log_pile', 15, 27],
  ['office/bookshelf', 18, 27], ['office/bookshelf', 19, 27], ['office/bookshelf', 20, 27],
  ['arcade/arcade_cabinet', 22, 27], ['arcade/arcade_cabinet', 23, 27], ['arcade/pinball', 25, 27],
  ['arcade/chair', 22, 30, 'N'], ['arcade/chair', 23, 30, 'N'], ['office/plant', 25, 36],
  // Lobby (x27-34, y27-36)
  ['office/plant', 27, 27], ['office/plant', 34, 27], ['office/desk', 30, 28], ['office/chair', 30, 27, 'S'],
  ['zen/bamboo', 27, 36], ['zen/bamboo', 34, 36],
  // Cafe (x36-60, y27-36): four tables with chairs
  ...[38, 44, 50].flatMap((x): D[] => [
    ['office/coffee_table', x, 30], ['cabin/chair', x, 29, 'S'], ['cabin/chair', x + 1, 29, 'S'],
    ['cabin/chair', x, 31, 'N'], ['cabin/chair', x + 1, 31, 'N'],
    ['office/coffee_table', x, 34], ['cabin/chair', x, 33, 'S'], ['cabin/chair', x + 1, 33, 'S'],
    ['cabin/chair', x, 35, 'N'], ['cabin/chair', x + 1, 35, 'N'],
  ]),
  ['arcade/vending', 57, 27], ['arcade/vending', 58, 27], ['office/water_cooler', 59, 27], ['office/plant', 60, 27],
  ['office/plant', 60, 36], ['zen/plant', 55, 31],
  // Library (x53-60, y1-13)
  ...[53, 54, 55, 56, 57, 58, 59, 60].map((x): D => ['cabin/bookshelf', x, 1]),
  ['cabin/rug', 55, 7], ['cabin/armchair', 55, 6, 'S'], ['cabin/armchair', 57, 6, 'S'], ['cabin/lamp', 54, 6],
  ['zen/tea_table', 56, 9], ['zen/chair', 55, 9, 'E'], ['zen/chair', 57, 9, 'W'], ['office/plant', 60, 13],
]

export const STARTER_ZONES = [
  { id: 'lounge-sofa', name: 'Lounge sofas', x: 3, y: 29, w: 7, h: 7 },
  { id: 'fireplace', name: 'Fireplace', x: 10, y: 27, w: 7, h: 5 },
  { id: 'cafe-1', name: 'Cafe table 1', x: 37, y: 28, w: 4, h: 5 },
  { id: 'cafe-2', name: 'Cafe table 2', x: 43, y: 28, w: 4, h: 5 },
  { id: 'cafe-3', name: 'Cafe table 3', x: 49, y: 28, w: 4, h: 5 },
  { id: 'cafe-4', name: 'Cafe table 4', x: 37, y: 33, w: 4, h: 4 },
  { id: 'cafe-5', name: 'Cafe table 5', x: 43, y: 33, w: 4, h: 4 },
  { id: 'cafe-6', name: 'Cafe table 6', x: 49, y: 33, w: 4, h: 4 },
  { id: 'library', name: 'Library', x: 53, y: 1, w: 8, h: 13 },
]
