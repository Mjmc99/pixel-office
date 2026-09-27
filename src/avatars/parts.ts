import { fixedRamp, ramp, VModel, type Mat } from './voxel'

/**
 * Avatar = a small recipe of part choices. It's what travels in presence
 * (e.g. "v1.3.2.4.1.6.0.2.1.5.0.0.0.2") and every browser renders it with the
 * same voxel builder, so thousands of combinations cost no image downloads.
 */
export const SKIN = ['#fbe0cc', '#f4cfae', '#eab98f', '#d9a07a', '#c68a62', '#a86d48', '#8a5a3a', '#6e4630', '#553423', '#3e2619']
export const HAIR_COLORS = ['#16100c', '#3a2418', '#6a4128', '#8a3a1e', '#c8621e', '#e8c060', '#f0e2b0', '#8a8a90', '#e8e8ec',
  '#3a6ad8', '#e86a9a', '#3ab070', '#8a4ac8']
export const CLOTH = ['#d84a3a', '#e8903a', '#e8c030', '#44a060', '#2aa6a0', '#3a78c8', '#24324a', '#8a4ac8', '#e86a9a',
  '#eeeef0', '#8a8a94', '#34343e', '#16161c', '#7a5236', '#6a7a3a', '#9ae0c4']

export const HAIR_STYLES = ['Short', 'Buzz', 'Long', 'Bun', 'Curly', 'Ponytail', 'Mohawk', 'Bob', 'Spiky', 'Bald'] as const
export const TOPS = ['T-shirt', 'Hoodie', 'Suit', 'Sweater', 'Dress', 'Tank top'] as const
export const BOTTOMS = ['Pants', 'Shorts', 'Skirt'] as const
export const FACIAL = ['None', 'Beard', 'Mustache', 'Stubble'] as const
export const EYEWEAR = ['None', 'Glasses', 'Round glasses', 'Sunglasses', 'VR visor'] as const
export const HEADWEAR = ['None', 'Cap', 'Beanie', 'Headphones', 'Cat ears', 'Flower'] as const

export interface Look {
  skin: number; hair: number; hairColor: number
  top: number; topColor: number; trim: number
  bottom: number; bottomColor: number; shoes: number
  facial: number; eyewear: number; headwear: number; accent: number
}
const KEYS: [keyof Look, number][] = [
  ['skin', SKIN.length], ['hair', HAIR_STYLES.length], ['hairColor', HAIR_COLORS.length],
  ['top', TOPS.length], ['topColor', CLOTH.length], ['trim', CLOTH.length],
  ['bottom', BOTTOMS.length], ['bottomColor', CLOTH.length], ['shoes', CLOTH.length],
  ['facial', FACIAL.length], ['eyewear', EYEWEAR.length], ['headwear', HEADWEAR.length], ['accent', CLOTH.length],
]

export const DEFAULT_LOOK: Look = { skin: 1, hair: 0, hairColor: 1, top: 0, topColor: 5, trim: 9, bottom: 0, bottomColor: 6, shoes: 12, facial: 0, eyewear: 0, headwear: 0, accent: 0 }

export const encodeLook = (l: Look) => 'v1.' + KEYS.map(([k]) => l[k]).join('.')

/** Parse a recipe from anyone (untrusted): bad or out-of-range values fall back safely. */
export function decodeLook(s: string | undefined | null): Look {
  const parts = typeof s === 'string' && s.startsWith('v1.') ? s.slice(3).split('.').map((x) => parseInt(x, 10)) : []
  const l = { ...DEFAULT_LOOK }
  KEYS.forEach(([k, n], i) => { const v = parts[i]; if (Number.isInteger(v) && v >= 0 && v < n) l[k] = v })
  return l
}

export function randomLook(rand = Math.random): Look {
  const l = {} as Look
  for (const [k, n] of KEYS) l[k] = Math.floor(rand() * n)
  // keep randoms tasteful: mostly no accessories, natural hair colours
  if (rand() < 0.75) l.hairColor = Math.floor(rand() * 9)
  if (rand() < 0.6) l.eyewear = 0
  if (rand() < 0.6) l.headwear = 0
  if (rand() < 0.7) l.facial = 0
  if (l.hair === 9 && rand() < 0.5) l.hair = 0
  return l
}

/** The 8 original presets, as recipes (so old saved avatars keep their look). */
export const LEGACY: Record<string, Look> = {
  ada: { ...DEFAULT_LOOK, skin: 2, hair: 0, hairColor: 1, topColor: 5, bottomColor: 11 },
  bo: { ...DEFAULT_LOOK, skin: 6, hair: 1, hairColor: 0, topColor: 0, bottomColor: 11 },
  cy: { ...DEFAULT_LOOK, skin: 1, hair: 2, hairColor: 5, topColor: 3, bottomColor: 13 },
  dee: { ...DEFAULT_LOOK, skin: 5, hair: 3, hairColor: 3, topColor: 2, bottomColor: 6 },
  eli: { ...DEFAULT_LOOK, skin: 8, hair: 0, hairColor: 0, topColor: 7, bottomColor: 12 },
  fox: { ...DEFAULT_LOOK, skin: 0, hair: 2, hairColor: 4, topColor: 11, bottomColor: 13 },
  gus: { ...DEFAULT_LOOK, skin: 3, hair: 1, hairColor: 7, topColor: 4, bottomColor: 11 },
  hana: { ...DEFAULT_LOOK, skin: 1, hair: 3, hairColor: 0, topColor: 8, bottomColor: 6 },
}
export const toRecipe = (a: unknown) => typeof a === 'string' && Object.hasOwn(LEGACY, a) ? encodeLook(LEGACY[a]) : encodeLook(decodeLook(typeof a === 'string' ? a : ''))

export function palette(l: Look): Record<string, Mat> {
  return {
    skin: { ramp: ramp(SKIN[l.skin]) },
    hair: { ramp: ramp(HAIR_COLORS[l.hairColor]), tex: 'dither' },
    shirt: { ramp: ramp(CLOTH[l.topColor]) },
    trim: { ramp: ramp(CLOTH[l.trim]) },
    pants: { ramp: ramp(CLOTH[l.bottomColor]) },
    shoes: { ramp: ramp(CLOTH[l.shoes]).map((c) => c.map((v) => Math.round(v * 0.55))) as Mat['ramp'] },
    eyes: { ramp: fixedRamp('#0c0a10', '#141018', '#1c1822', '#2a2432') },
    acc: { ramp: ramp(CLOTH[l.accent]) },
    frame: { ramp: fixedRamp('#16141c', '#24202c', '#34303e', '#4a4658') },
    lens: { ramp: fixedRamp('#0a1a2a', '#10304a', '#1a5a80', '#40a0d0'), emissive: false },
    visor: { ramp: fixedRamp('#0a4a5a', '#10a0c0', '#40e0ff', '#c0f8ff'), emissive: true },
    blush: { ramp: fixedRamp('#b85a5a', '#d87070', '#e88a8a', '#f0a0a0') },
  }
}

/**
 * Build the chibi avatar for one walk frame (0 stand, 1/2 step). Front faces +y.
 * Model is 16 wide × 16 deep × 28 tall; feet around y≈8.5 (rendered frames are 16 × 44).
 */
export function buildAvatar(l: Look, frame: number): VModel {
  const m = new VModel(16, 16, 28)
  const [lo, ro] = ([[0, 0], [1, -1], [-1, 1]] as const)[frame]
  const bottom = BOTTOMS[l.bottom], top = TOPS[l.top]
  // legs + shoes
  for (const [x0, off] of [[5, lo], [9, ro]] as const) {
    const legMat = top === 'Dress' || bottom === 'Skirt' ? 'skin' : 'pants'
    m.box(x0, 6 + off, 1, x0 + 2, 9 + off, 6, legMat)
    if (bottom === 'Shorts' && top !== 'Dress') m.box(x0, 6 + off, 1, x0 + 2, 9 + off, 4, 'skin')
    m.box(x0, 6 + off, 0, x0 + 2, 10 + off, 1, 'shoes')
  }
  if (bottom === 'Skirt' && top !== 'Dress') m.box(4, 5, 4, 12, 11, 7, 'pants')
  // torso
  m.box(4, 5, 6, 12, 10, 13, 'shirt')
  if (top === 'Dress') m.box(4, 5, 3, 12, 11, 8, 'shirt')
  if (top === 'Hoodie') { m.box(4, 5, 12, 12, 7, 15, 'shirt'); m.box(6, 10, 7, 10, 10, 9, 'trim') }
  if (top === 'Suit') { m.box(7, 9, 7, 9, 10, 13, 'trim'); m.set(7, 10, 11, 'acc'); m.set(8, 10, 11, 'acc'); m.box(7, 10, 8, 9, 11, 11, 'acc') }
  if (top === 'Sweater') m.box(4, 5, 10, 12, 10, 11, 'trim')
  if (top === 'Tank top') { m.box(4, 5, 11, 5, 10, 13, 'skin'); m.box(11, 5, 11, 12, 10, 13, 'skin') }
  // arms
  for (const [x0, off] of [[3, -lo], [12, -ro]] as const) {
    m.box(x0, 7 + off, 8, x0 + 1, 9 + off, 13, top === 'Tank top' ? 'skin' : 'shirt')
    m.box(x0, 7 + off, 7, x0 + 1, 9 + off, 8, 'skin')
  }
  // head + face (head is 10 wide × 6 deep × 11 tall; the face is the y=10 layer)
  m.box(3, 5, 13, 13, 11, 24, 'skin')
  for (const x of [5, 10]) m.box(x, 10, 16, x + 1, 11, 19, 'eyes')
  m.set(4, 10, 15, 'blush'); m.set(11, 10, 15, 'blush')
  // facial hair
  const fh = FACIAL[l.facial]
  if (fh === 'Beard') { m.box(4, 9, 13, 12, 11, 16, 'hair'); m.box(3, 7, 14, 4, 10, 18, 'hair'); m.box(12, 7, 14, 13, 10, 18, 'hair') }
  if (fh === 'Mustache') m.box(5, 10, 15, 11, 11, 16, 'hair')
  if (fh === 'Stubble') for (let x = 5; x < 11; x += 2) m.set(x, 10, 14, 'hair')
  // hair
  const hs = HAIR_STYLES[l.hair]
  const cap = () => { m.box(3, 4, 22, 13, 11, 25, 'hair'); m.box(3, 4, 14, 13, 5, 22, 'hair') }
  const sides = (low: number) => { m.box(2, 5, low, 3, 10, 24, 'hair'); m.box(13, 5, low, 14, 10, 24, 'hair') }
  const fringe = () => { m.box(4, 10, 21, 12, 11, 23, 'hair'); m.box(3, 10, 18, 4, 11, 22, 'hair'); m.box(12, 10, 18, 13, 11, 22, 'hair') }
  switch (hs) {
    case 'Short': cap(); sides(18); fringe(); break
    case 'Buzz': m.box(3, 4, 23, 13, 11, 25, 'hair'); m.box(3, 4, 17, 13, 5, 23, 'hair'); m.box(3, 5, 21, 4, 10, 23, 'hair'); m.box(12, 5, 21, 13, 10, 23, 'hair'); break
    case 'Long': cap(); sides(12); fringe(); m.box(3, 3, 9, 13, 5, 16, 'hair'); break
    case 'Bun': cap(); sides(18); fringe(); m.box(6, 5, 25, 10, 9, 28, 'hair'); break
    case 'Curly':
      m.box(2, 3, 21, 14, 11, 27, 'hair'); m.box(2, 3, 14, 14, 5, 21, 'hair'); sides(15)
      m.box(4, 10, 21, 12, 11, 24, 'hair'); m.box(1, 5, 17, 2, 10, 24, 'hair'); m.box(14, 5, 17, 15, 10, 24, 'hair'); break
    case 'Ponytail': cap(); sides(19); fringe(); m.box(7, 2, 14, 9, 4, 23, 'hair'); m.box(6, 3, 21, 10, 4, 24, 'acc'); break
    case 'Mohawk': m.box(7, 3, 24, 9, 11, 28, 'hair'); m.box(7, 3, 16, 9, 4, 24, 'hair'); break
    case 'Bob': cap(); fringe(); m.box(2, 4, 15, 3, 11, 25, 'hair'); m.box(13, 4, 15, 14, 11, 25, 'hair'); break
    case 'Spiky':
      cap(); sides(19); fringe()
      for (const [x, y] of [[4, 5], [7, 6], [10, 5], [5, 8], [9, 8], [12, 7]]) m.box(x, y, 25, x + 2, y + 2, 27, 'hair'); break
    case 'Bald': break
  }
  // headwear (after hair so it covers it)
  const hw = HEADWEAR[l.headwear]
  if (hw === 'Cap') { m.box(3, 4, 23, 13, 11, 26, 'acc'); m.box(4, 10, 22, 12, 14, 23, 'acc'); m.set(8, 7, 26, 'trim') }
  if (hw === 'Beanie') { m.box(3, 4, 22, 13, 11, 27, 'acc'); m.box(3, 4, 22, 13, 11, 23, 'trim'); m.box(7, 6, 27, 9, 8, 28, 'trim') }
  if (hw === 'Headphones') {
    m.box(3, 7, 26, 13, 9, 27, 'frame'); m.box(2, 7, 23, 3, 9, 26, 'frame'); m.box(13, 7, 23, 14, 9, 26, 'frame')
    m.box(1, 6, 16, 3, 10, 21, 'acc'); m.box(13, 6, 16, 15, 10, 21, 'acc')
  }
  if (hw === 'Cat ears') { m.box(3, 6, 25, 6, 9, 28, 'acc'); m.box(10, 6, 25, 13, 9, 28, 'acc'); m.set(4, 8, 27, 'blush'); m.set(11, 8, 27, 'blush') }
  if (hw === 'Flower') { m.box(10, 8, 23, 13, 11, 26, 'acc'); m.set(11, 10, 25, 'trim') }
  // eyewear (one layer in front of the face)
  const ew = EYEWEAR[l.eyewear]
  if (ew === 'Glasses' || ew === 'Sunglasses') {
    const lens = ew === 'Sunglasses' ? 'lens' : 'eyes'
    for (const x of [4, 9]) { m.box(x, 11, 15, x + 3, 12, 20, 'frame'); m.box(x + 1, 11, 16, x + 2, 12, 19, lens) }
    m.box(7, 11, 18, 9, 12, 19, 'frame')
    if (ew === 'Sunglasses') { m.box(4, 11, 16, 7, 12, 19, 'lens'); m.box(9, 11, 16, 12, 12, 19, 'lens') }
  }
  if (ew === 'Round glasses') {
    for (const x of [4, 9]) {
      m.box(x, 11, 16, x + 3, 12, 17, 'acc'); m.box(x, 11, 19, x + 3, 12, 20, 'acc')
      m.box(x, 11, 17, x + 1, 12, 19, 'acc'); m.box(x + 2, 11, 17, x + 3, 12, 19, 'acc'); m.box(x + 1, 11, 17, x + 2, 12, 19, 'eyes')
    }
    m.box(7, 11, 18, 9, 12, 19, 'acc')
  }
  if (ew === 'VR visor') { m.box(3, 10, 15, 13, 13, 21, 'frame'); m.box(4, 12, 16, 12, 13, 20, 'visor'); m.box(2, 6, 17, 3, 10, 19, 'frame'); m.box(13, 6, 17, 14, 10, 19, 'frame') }
  return m
}
