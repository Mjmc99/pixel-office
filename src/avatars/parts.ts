import { fixedRamp, ramp, VModel, type Mat } from './voxel'

/**
 * An avatar is four parts — hat, head, torso, legs — described by a short recipe
 * string (e.g. "v2.0.0.140.0.2.0.0.0.5.9.0.6.12"). The recipe is what travels in
 * presence; every browser renders it with the same voxel builder.
 */

// ---------------------------------------------------------------- palettes
/** Skin tone stops, light -> deep. The skin slider (0-255) blends between them. */
export const SKIN_STOPS = ['#fbe3cf', '#f4cfae', '#eab98f', '#d9a07a', '#c68a62', '#a86d48', '#8a5a3a', '#6e4630', '#553423', '#3e2619']
export const HAIR_COLORS = ['#16100c', '#3a2418', '#6a4128', '#8a3a1e', '#c8621e', '#e8c060', '#f0e2b0', '#8a8a90', '#e8e8ec',
  '#3a6ad8', '#e86a9a', '#3ab070', '#8a4ac8']
export const CLOTH = ['#d84a3a', '#e8903a', '#e8c030', '#44a060', '#2aa6a0', '#3a78c8', '#24324a', '#8a4ac8', '#e86a9a',
  '#eeeef0', '#8a8a94', '#34343e', '#16161c', '#7a5236', '#6a7a3a', '#9ae0c4']
const NEUTRAL = [6, 9, 10, 11, 12, 13, 14]
const BRIGHT = [0, 1, 2, 3, 4, 5, 7, 8, 15]
const SHOE = [12, 13, 9, 11, 6]
const NATURAL_HAIR = 9

// ---------------------------------------------------------------- parts
export const HATS = ['None', 'Beanie', 'Cap', 'Top hat', 'Party hat', 'Bow', 'Flower', 'Crown', 'Cat ears'] as const
export const HAIR_STYLES = ['Short', 'Buzz', 'Long', 'Bun', 'Curly', 'Ponytail', 'Mohawk', 'Bob', 'Spiky', 'Bald'] as const
export const FACIAL = ['None', 'Beard', 'Mustache', 'Stubble'] as const
export const EYEWEAR = ['None', 'Glasses', 'Round glasses', 'Sunglasses', 'VR visor'] as const
export const TOPS = ['T-shirt', 'Hoodie', 'Suit', 'Sweater', 'Dress', 'Tank top'] as const
export const BOTTOMS = ['Pants', 'Shorts', 'Skirt'] as const

export interface Look {
  // hat
  hat: number; hatColor: number
  // head
  skin: number; hair: number; hairColor: number; facial: number; eyewear: number
  // torso
  top: number; topColor: number; trim: number
  // legs
  bottom: number; bottomColor: number; shoes: number
}
const KEYS: [keyof Look, number][] = [
  ['hat', HATS.length], ['hatColor', CLOTH.length],
  ['skin', 256], ['hair', HAIR_STYLES.length], ['hairColor', HAIR_COLORS.length], ['facial', FACIAL.length], ['eyewear', EYEWEAR.length],
  ['top', TOPS.length], ['topColor', CLOTH.length], ['trim', CLOTH.length],
  ['bottom', BOTTOMS.length], ['bottomColor', CLOTH.length], ['shoes', CLOTH.length],
]

export const DEFAULT_LOOK: Look = {
  hat: 0, hatColor: 0, skin: 40, hair: 0, hairColor: 1, facial: 0, eyewear: 0,
  top: 0, topColor: 5, trim: 9, bottom: 0, bottomColor: 6, shoes: 12,
}

export const encodeLook = (l: Look) => 'v2.' + KEYS.map(([k]) => l[k]).join('.')
export const sameLook = (a: Look, b: Look) => KEYS.every(([k]) => a[k] === b[k])

/** Parse a recipe from anyone (untrusted): bad or out-of-range values fall back safely. */
export function decodeLook(s: unknown): Look {
  const l = { ...DEFAULT_LOOK }
  if (typeof s !== 'string') return l
  if (s.startsWith('v1.')) return fromV1(s)
  const parts = s.startsWith('v2.') ? s.slice(3).split('.').map((x) => (/^\d{1,3}$/.test(x) ? +x : NaN)) : []
  KEYS.forEach(([k, n], i) => { const v = parts[i]; if (Number.isInteger(v) && v >= 0 && v < n) l[k] = v })
  return l
}

/** v1 recipes (first creator version) -> v2. */
function fromV1(s: string): Look {
  const p = s.slice(3).split('.').map((x) => parseInt(x, 10))
  const ok = (v: number, n: number, d: number) => (Number.isInteger(v) && v >= 0 && v < n ? v : d)
  const oldHat = [0, 2, 1, 0, 8, 6][ok(p[11], 6, 0)]
  return {
    hat: oldHat, hatColor: ok(p[12], CLOTH.length, 0),
    skin: Math.round(ok(p[0], 10, 1) * 255 / 9), hair: ok(p[1], HAIR_STYLES.length, 0), hairColor: ok(p[2], HAIR_COLORS.length, 1),
    facial: ok(p[9], FACIAL.length, 0), eyewear: ok(p[10], EYEWEAR.length, 0),
    top: ok(p[3], TOPS.length, 0), topColor: ok(p[4], CLOTH.length, 5), trim: ok(p[5], CLOTH.length, 9),
    bottom: ok(p[6], BOTTOMS.length, 0), bottomColor: ok(p[7], CLOTH.length, 6), shoes: ok(p[8], CLOTH.length, 12),
  }
}

// ---------------------------------------------------------------- skin
const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
/** Skin slider value (0-255) -> colour, blended between SKIN_STOPS. */
export function skinHex(v: number) {
  const t = (Math.max(0, Math.min(255, v)) / 255) * (SKIN_STOPS.length - 1)
  const i = Math.min(SKIN_STOPS.length - 2, Math.floor(t)), f = t - i
  const a = hexRgb(SKIN_STOPS[i]), b = hexRgb(SKIN_STOPS[i + 1])
  return '#' + a.map((c, j) => Math.round(c + (b[j] - c) * f).toString(16).padStart(2, '0')).join('')
}
export const SKIN_GRADIENT = `linear-gradient(90deg, ${SKIN_STOPS.join(', ')})`

// ---------------------------------------------------------------- suggestions
type Rand = () => number
const pick = <T,>(r: Rand, a: readonly T[]) => a[Math.floor(r() * a.length)]
const idx = (r: Rand, n: number) => Math.floor(r() * n)

/** A random look whose colours go together (bright top -> calm bottoms, neutral shoes...). */
export function suggestLook(r: Rand = Math.random): Look {
  const topColor = idx(r, CLOTH.length)
  const brightTop = BRIGHT.includes(topColor)
  const l: Look = {
    hat: 0, hatColor: 0,
    skin: idx(r, 256),
    hair: r() < 0.08 ? 9 : idx(r, HAIR_STYLES.length - 1),
    hairColor: r() < 0.8 ? idx(r, NATURAL_HAIR) : NATURAL_HAIR + idx(r, HAIR_COLORS.length - NATURAL_HAIR),
    facial: r() < 0.2 ? 1 + idx(r, FACIAL.length - 1) : 0,
    eyewear: r() < 0.25 ? 1 + idx(r, EYEWEAR.length - 1) : 0,
    top: idx(r, TOPS.length), topColor,
    trim: r() < 0.6 ? pick(r, [9, 12, 11]) : pick(r, BRIGHT),
    bottom: r() < 0.7 ? 0 : 1 + idx(r, BOTTOMS.length - 1),
    bottomColor: brightTop && r() < 0.8 ? pick(r, NEUTRAL) : idx(r, CLOTH.length),
    shoes: r() < 0.85 ? pick(r, SHOE) : pick(r, BRIGHT),
  }
  if (r() < 0.4) { l.hat = 1 + idx(r, HATS.length - 1); l.hatColor = pick(r, [topColor, l.trim, pick(r, BRIGHT)]) }
  if (l.trim === topColor) l.trim = 9
  return l
}

/** Starter looks shown in the creator. Picking one usually gives a personal variation. */
export const STARTERS: { name: string; look: Look }[] = [
  { name: 'Classic', look: { ...DEFAULT_LOOK } },
  { name: 'Hoodie', look: { ...DEFAULT_LOOK, skin: 150, hair: 4, hairColor: 0, top: 1, topColor: 3, trim: 9, bottom: 1, bottomColor: 11, hat: 2, hatColor: 0 } },
  { name: 'Exec', look: { ...DEFAULT_LOOK, skin: 90, hair: 1, hairColor: 7, eyewear: 1, top: 2, topColor: 11, trim: 9, bottomColor: 11, shoes: 12, facial: 1 } },
  { name: 'Cozy', look: { ...DEFAULT_LOOK, skin: 20, hair: 3, hairColor: 3, top: 3, topColor: 1, trim: 9, bottom: 2, bottomColor: 13, shoes: 13, hat: 1, hatColor: 5 } },
  { name: 'Punk', look: { ...DEFAULT_LOOK, skin: 60, hair: 6, hairColor: 10, eyewear: 3, top: 5, topColor: 12, trim: 0, bottomColor: 12, shoes: 12 } },
  { name: 'Techie', look: { ...DEFAULT_LOOK, skin: 200, hair: 8, hairColor: 0, eyewear: 4, top: 1, topColor: 11, trim: 4, bottomColor: 6 } },
  { name: 'Sunday', look: { ...DEFAULT_LOOK, skin: 230, hair: 2, hairColor: 0, top: 4, topColor: 15, trim: 9, bottom: 2, shoes: 9, hat: 6, hatColor: 8 } },
  { name: 'Scholar', look: { ...DEFAULT_LOOK, skin: 120, hair: 5, hairColor: 5, eyewear: 2, top: 3, topColor: 14, trim: 9, bottomColor: 13, shoes: 13 } },
]

/**
 * A personal take on a starter: new skin tone, and fresh (still matching) colours
 * for a couple of parts. The shape of the starter stays.
 */
export function varyLook(base: Look, r: Rand = Math.random): Look {
  const l = { ...base, skin: idx(r, 256) }
  if (r() < 0.6) l.hairColor = r() < 0.85 ? idx(r, NATURAL_HAIR) : NATURAL_HAIR + idx(r, HAIR_COLORS.length - NATURAL_HAIR)
  if (r() < 0.7) {
    l.topColor = idx(r, CLOTH.length)
    if (BRIGHT.includes(l.topColor) && !NEUTRAL.includes(l.bottomColor)) l.bottomColor = pick(r, NEUTRAL)
  }
  if (r() < 0.4) l.bottomColor = pick(r, NEUTRAL)
  if (r() < 0.4) l.trim = pick(r, [9, 12, 11, ...BRIGHT])
  if (l.hat && r() < 0.6) l.hatColor = pick(r, [l.topColor, l.trim, pick(r, BRIGHT)])
  if (l.trim === l.topColor) l.trim = l.topColor === 9 ? 12 : 9
  return l
}

/** The 8 original presets, so old saved avatars keep roughly their look. */
const LEGACY: Record<string, [number, number, number, number, number]> = {
  // skin, hair, hairColor, topColor, bottomColor
  ada: [57, 0, 1, 5, 11], bo: [170, 1, 0, 0, 11], cy: [28, 2, 5, 3, 13], dee: [142, 3, 3, 2, 6],
  eli: [227, 0, 0, 7, 12], fox: [0, 2, 4, 11, 13], gus: [85, 1, 7, 4, 11], hana: [28, 3, 0, 8, 6],
}
export function toRecipe(a: unknown): string {
  if (typeof a === 'string' && Object.hasOwn(LEGACY, a)) {
    const [skin, hair, hairColor, topColor, bottomColor] = LEGACY[a]
    return encodeLook({ ...DEFAULT_LOOK, skin, hair, hairColor, topColor, bottomColor })
  }
  return encodeLook(decodeLook(typeof a === 'string' ? a.slice(0, 80) : ''))
}

// ---------------------------------------------------------------- model
export function palette(l: Look): Record<string, Mat> {
  return {
    skin: { ramp: ramp(skinHex(l.skin)) },
    hair: { ramp: ramp(HAIR_COLORS[l.hairColor]), tex: 'dither' },
    shirt: { ramp: ramp(CLOTH[l.topColor]) },
    trim: { ramp: ramp(CLOTH[l.trim]) },
    pants: { ramp: ramp(CLOTH[l.bottomColor]) },
    shoes: { ramp: ramp(CLOTH[l.shoes]).map((c) => c.map((v) => Math.round(v * 0.55))) as Mat['ramp'] },
    hat: { ramp: ramp(CLOTH[l.hatColor]) },
    hat2: { ramp: fixedRamp('#b8b0a0', '#d8d0c0', '#eee8dc', '#fffaf0') },
    tie: { ramp: fixedRamp('#5a1418', '#7a1c20', '#9a2428', '#b83a3a') },
    eyes: { ramp: fixedRamp('#0c0a10', '#141018', '#1c1822', '#2a2432') },
    frame: { ramp: fixedRamp('#16141c', '#24202c', '#34303e', '#4a4658') },
    rim: { ramp: fixedRamp('#6a4a1a', '#8a6424', '#b08a3a', '#d8b060') },
    lens: { ramp: fixedRamp('#0a1a2a', '#10304a', '#1a5a80', '#40a0d0') },
    visor: { ramp: fixedRamp('#0a4a5a', '#10a0c0', '#40e0ff', '#c0f8ff'), emissive: true },
    blush: { ramp: fixedRamp('#b85a5a', '#d87070', '#e88a8a', '#f0a0a0') },
  }
}

/** Model size: 16 wide × 16 deep × MODEL_H tall. Rendered frames are 16 × (16 + MODEL_H). */
export const MODEL_H = 30

/** Build the chibi avatar for one walk frame (0 stand, 1/2 step). Front faces +y. */
export function buildAvatar(l: Look, frame: number): VModel {
  const m = new VModel(16, 16, MODEL_H)
  const [lo, ro] = ([[0, 0], [1, -1], [-1, 1]] as const)[frame]
  buildLegs(m, l, lo, ro)
  buildTorso(m, l, lo, ro)
  const hatBase = buildHead(m, l)
  buildHat(m, l, hatBase)
  return m
}

function buildLegs(m: VModel, l: Look, lo: number, ro: number) {
  const bottom = BOTTOMS[l.bottom], dress = TOPS[l.top] === 'Dress'
  for (const [x0, off] of [[5, lo], [9, ro]] as const) {
    m.box(x0, 6 + off, 1, x0 + 2, 9 + off, 6, dress || bottom === 'Skirt' ? 'skin' : 'pants')
    if (bottom === 'Shorts' && !dress) m.box(x0, 6 + off, 1, x0 + 2, 9 + off, 4, 'skin')
    m.box(x0, 6 + off, 0, x0 + 2, 10 + off, 1, 'shoes')
  }
  if (bottom === 'Skirt' && !dress) m.box(4, 5, 4, 12, 11, 7, 'pants')
}

function buildTorso(m: VModel, l: Look, lo: number, ro: number) {
  const top = TOPS[l.top]
  m.box(4, 5, 6, 12, 10, 13, 'shirt')
  if (top === 'Dress') m.box(4, 5, 3, 12, 11, 8, 'shirt')
  if (top === 'Hoodie') { m.box(4, 5, 12, 12, 7, 15, 'shirt'); m.box(6, 10, 7, 10, 10, 9, 'trim') }
  if (top === 'Suit') { m.box(7, 9, 7, 9, 10, 13, 'trim'); m.box(7, 10, 8, 9, 11, 12, 'tie') }
  if (top === 'Sweater') m.box(4, 5, 10, 12, 10, 11, 'trim')
  if (top === 'T-shirt') m.box(6, 9, 12, 10, 10, 13, 'trim')
  if (top === 'Tank top') { m.box(4, 5, 11, 5, 10, 13, 'skin'); m.box(11, 5, 11, 12, 10, 13, 'skin') }
  for (const [x0, off] of [[3, -lo], [12, -ro]] as const) {
    m.box(x0, 7 + off, 8, x0 + 1, 9 + off, 13, top === 'Tank top' ? 'skin' : 'shirt')
    m.box(x0, 7 + off, 7, x0 + 1, 9 + off, 8, 'skin')
  }
}

/** Head, face, hair, eyewear. Returns the z where a hat should sit. */
function buildHead(m: VModel, l: Look): number {
  // head is 10 wide × 6 deep × 11 tall; the face is the y=10 layer
  m.box(3, 5, 13, 13, 11, 24, 'skin')
  for (const x of [5, 10]) m.box(x, 10, 16, x + 1, 11, 19, 'eyes')
  m.set(4, 10, 15, 'blush'); m.set(11, 10, 15, 'blush')
  const fh = FACIAL[l.facial]
  if (fh === 'Beard') { m.box(4, 9, 13, 12, 11, 16, 'hair'); m.box(3, 7, 14, 4, 10, 18, 'hair'); m.box(12, 7, 14, 13, 10, 18, 'hair') }
  if (fh === 'Mustache') m.box(5, 10, 15, 11, 11, 16, 'hair')
  if (fh === 'Stubble') for (let x = 5; x < 11; x += 2) m.set(x, 10, 14, 'hair')

  const hs = HAIR_STYLES[l.hair]
  const cap = () => { m.box(3, 4, 22, 13, 11, 25, 'hair'); m.box(3, 4, 14, 13, 5, 22, 'hair') }
  const sides = (low: number) => { m.box(2, 5, low, 3, 10, 24, 'hair'); m.box(13, 5, low, 14, 10, 24, 'hair') }
  const fringe = () => { m.box(4, 10, 21, 12, 11, 23, 'hair'); m.box(3, 10, 18, 4, 11, 22, 'hair'); m.box(12, 10, 18, 13, 11, 22, 'hair') }
  let hatBase = 25
  switch (hs) {
    case 'Short': cap(); sides(18); fringe(); break
    case 'Buzz': m.box(3, 4, 23, 13, 11, 25, 'hair'); m.box(3, 4, 17, 13, 5, 23, 'hair'); m.box(3, 5, 21, 4, 10, 23, 'hair'); m.box(12, 5, 21, 13, 10, 23, 'hair'); break
    case 'Long': cap(); sides(12); fringe(); m.box(3, 3, 9, 13, 5, 16, 'hair'); break
    case 'Bun': cap(); sides(18); fringe(); m.box(6, 4, 24, 10, 7, 27, 'hair'); break
    case 'Curly':
      m.box(2, 3, 21, 14, 11, 26, 'hair'); m.box(2, 3, 14, 14, 5, 21, 'hair'); sides(15)
      m.box(4, 10, 21, 12, 11, 24, 'hair'); m.box(1, 5, 17, 2, 10, 24, 'hair'); m.box(14, 5, 17, 15, 10, 24, 'hair')
      hatBase = 26; break
    case 'Ponytail': cap(); sides(19); fringe(); m.box(7, 2, 14, 9, 4, 23, 'hair'); m.box(6, 3, 21, 10, 4, 24, 'trim'); break
    case 'Mohawk': m.box(7, 3, 24, 9, 11, 28, 'hair'); m.box(7, 3, 16, 9, 4, 24, 'hair'); break
    case 'Bob': cap(); fringe(); m.box(2, 4, 15, 3, 11, 25, 'hair'); m.box(13, 4, 15, 14, 11, 25, 'hair'); break
    case 'Spiky':
      cap(); sides(19); fringe()
      for (const [x, y] of [[4, 5], [7, 6], [10, 5], [5, 8], [9, 8], [12, 7]]) m.box(x, y, 25, x + 2, y + 2, 27, 'hair'); break
    case 'Bald': hatBase = 24; break
  }

  const ew = EYEWEAR[l.eyewear]
  if (ew === 'Glasses' || ew === 'Sunglasses') {
    const lens = ew === 'Sunglasses' ? 'lens' : 'eyes'
    for (const x of [4, 9]) { m.box(x, 11, 15, x + 3, 12, 20, 'frame'); m.box(x + 1, 11, 16, x + 2, 12, 19, lens) }
    m.box(7, 11, 18, 9, 12, 19, 'frame')
    if (ew === 'Sunglasses') { m.box(4, 11, 16, 7, 12, 19, 'lens'); m.box(9, 11, 16, 12, 12, 19, 'lens') }
  }
  if (ew === 'Round glasses') {
    for (const x of [4, 9]) {
      m.box(x, 11, 16, x + 3, 12, 17, 'rim'); m.box(x, 11, 19, x + 3, 12, 20, 'rim')
      m.box(x, 11, 17, x + 1, 12, 19, 'rim'); m.box(x + 2, 11, 17, x + 3, 12, 19, 'rim'); m.box(x + 1, 11, 17, x + 2, 12, 19, 'eyes')
    }
    m.box(7, 11, 18, 9, 12, 19, 'rim')
  }
  if (ew === 'VR visor') { m.box(3, 10, 15, 13, 13, 21, 'frame'); m.box(4, 12, 16, 12, 13, 20, 'visor'); m.box(2, 6, 17, 3, 10, 19, 'frame'); m.box(13, 6, 17, 14, 10, 19, 'frame') }
  return hatBase
}

/** Small hats that sit on top of the hair (b = first free layer above it). */
function buildHat(m: VModel, l: Look, b: number) {
  switch (HATS[l.hat]) {
    case 'Beanie':
      m.box(5, 6, b, 11, 10, b + 2, 'hat'); m.box(5, 6, b, 11, 10, b + 1, 'hat2'); m.box(7, 7, b + 2, 9, 9, b + 3, 'hat2'); break
    case 'Cap':
      m.box(5, 6, b, 11, 10, b + 2, 'hat'); m.box(5, 10, b, 11, 12, b + 1, 'hat'); m.set(8, 8, b + 2, 'hat2'); break
    case 'Top hat':
      m.box(4, 5, b, 12, 11, b + 1, 'hat'); m.box(5, 6, b + 1, 11, 10, b + 4, 'hat'); m.box(5, 6, b + 1, 11, 10, b + 2, 'hat2'); break
    case 'Party hat':
      m.box(6, 6, b, 10, 10, b + 1, 'hat'); m.box(7, 7, b + 1, 9, 9, b + 3, 'hat'); m.set(7, 8, b + 1, 'hat2'); m.set(8, 7, b + 2, 'hat2')
      m.set(8, 8, b + 3, 'hat2'); break
    case 'Bow':
      m.box(8, 8, b - 1, 10, 10, b + 1, 'hat'); m.box(11, 8, b - 1, 13, 10, b + 1, 'hat'); m.set(10, 9, b - 1, 'hat2'); break
    case 'Flower':
      m.box(9, 8, b - 1, 12, 11, b, 'hat'); m.set(10, 9, b - 1, 'hat2'); m.set(10, 10, b, 'hat'); m.set(10, 8, b, 'hat'); break
    case 'Crown':
      m.box(5, 6, b, 11, 10, b + 1, 'hat')
      for (const [x, y] of [[5, 6], [10, 6], [5, 9], [10, 9], [7, 9], [8, 6]]) m.set(x, y, b + 1, 'hat')
      m.set(8, 9, b, 'hat2'); break
    case 'Cat ears':
      m.box(4, 7, b - 1, 6, 9, b + 1, 'hat'); m.box(10, 7, b - 1, 12, 9, b + 1, 'hat'); m.set(4, 8, b + 1, 'hat'); m.set(11, 8, b + 1, 'hat')
      m.set(5, 8, b, 'blush'); m.set(10, 8, b, 'blush'); break
  }
}
