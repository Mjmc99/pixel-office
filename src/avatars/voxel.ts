/**
 * Browser port of tools/assets/voxel.py: builds a small voxel model and renders
 * it in oblique 3/4 view (screen_y = y - z) for the four facings, with the same
 * shading, silhouette outline and contour rules as the offline asset builder.
 * Used for avatars, which are assembled from parts at runtime.
 */
export type Facing = 'S' | 'E' | 'N' | 'W'
export const FACINGS: Facing[] = ['S', 'E', 'N', 'W']

export interface Mat { ramp: [number, number, number][]; tex?: 'flat' | 'dither' | 'noise'; emissive?: boolean }

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

/** 4-step ramp (dark -> light) from one base colour, same maths as avatars.py. */
export function ramp(base: string): [number, number, number][] {
  const [r, g, b] = hex(base).map((v) => v / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  let h = 0, s = 0
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  const hue2 = (p: number, q: number, t: number) => {
    t = (t + 1) % 1
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  const hls = (hh: number, ll: number, ss: number): [number, number, number] => {
    if (ss === 0) return [ll, ll, ll].map((v) => Math.round(v * 255)) as [number, number, number]
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss, p = 2 * ll - q
    return [hue2(p, q, hh + 1 / 3), hue2(p, q, hh), hue2(p, q, hh - 1 / 3)].map((v) => Math.round(v * 255)) as [number, number, number]
  }
  const c = (x: number) => Math.max(0, Math.min(1, x))
  return ([[-0.28, 0.05, 0.03], [-0.13, 0.03, 0.015], [0, 0, 0], [0.12, -0.05, -0.02]] as const)
    .map(([dl, ds, dh]) => hls((h + dh + 1) % 1, c(l + dl), c(s + ds)))
}
export const fixedRamp = (...hs: string[]) => hs.map(hex) as [number, number, number][]

/** Deterministic hash of ints -> [0, 1) (texture noise). */
function h01(...v: number[]) {
  let x = 2166136261
  for (const n of v) { x ^= n + 0x9e3779b9; x = Math.imul(x, 16777619); x ^= x >>> 13 }
  return ((x >>> 0) % 100000) / 100000
}

export class VModel {
  grid: Uint8Array
  detail: Int8Array
  mats: string[] = ['']
  constructor(readonly w: number, readonly d: number, readonly h: number) {
    this.grid = new Uint8Array(w * d * h)
    this.detail = new Int8Array(w * d * h)
  }
  private i(x: number, y: number, z: number) { return (x * this.d + y) * this.h + z }
  private mid(m: string) { let i = this.mats.indexOf(m); if (i < 0) { i = this.mats.length; this.mats.push(m) } return i }
  get(x: number, y: number, z: number) {
    return x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h ? 0 : this.grid[this.i(x, y, z)]
  }
  /** Fill [x0,x1) × [y0,y1) × [z0,z1). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: string) {
    const id = this.mid(m)
    for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x++)
      for (let y = Math.max(0, y0); y < Math.min(this.d, y1); y++)
        for (let z = Math.max(0, z0); z < Math.min(this.h, z1); z++) this.grid[this.i(x, y, z)] = id
  }
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x++)
      for (let y = Math.max(0, y0); y < Math.min(this.d, y1); y++)
        for (let z = Math.max(0, z0); z < Math.min(this.h, z1); z++) this.grid[this.i(x, y, z)] = 0
  }
  set(x: number, y: number, z: number, m: string) { this.box(x, y, z, x + 1, y + 1, z + 1, m) }

  texture(pal: Record<string, Mat>, seed = 7) {
    for (let x = 0; x < this.w; x++) for (let y = 0; y < this.d; y++) for (let z = 0; z < this.h; z++) {
      const g = this.grid[this.i(x, y, z)]
      if (!g) continue
      const t = pal[this.mats[g]]?.tex
      let d = 0
      if (t === 'dither') d = (x + y + z) % 2 === 0 && h01(seed, x >> 1, y >> 1, z >> 1) > 0.5 ? -1 : 0
      else if (t === 'noise') { const r = h01(seed, x, y, z); d = r < 0.15 ? -1 : r > 0.88 ? 1 : 0 }
      this.detail[this.i(x, y, z)] = d
    }
  }

  /** Grid rotated for a facing (same mapping as np.rot90 in voxel.py). */
  private rotated(f: Facing) {
    const { w: W, d: D, h: H } = this
    const [nw, nd] = f === 'E' || f === 'W' ? [D, W] : [W, D]
    const at = (a: number, b: number): [number, number] =>
      f === 'S' ? [a, b] : f === 'E' ? [W - 1 - b, a] : f === 'N' ? [W - 1 - a, D - 1 - b] : [b, D - 1 - a]
    const g = new Uint8Array(nw * nd * H), det = new Int8Array(nw * nd * H)
    for (let a = 0; a < nw; a++) for (let b = 0; b < nd; b++) {
      const [x, y] = at(a, b)
      for (let z = 0; z < H; z++) { g[(a * nd + b) * H + z] = this.grid[this.i(x, y, z)]; det[(a * nd + b) * H + z] = this.detail[this.i(x, y, z)] }
    }
    return { g, det, W: nw, D: nd, H }
  }

  /** Render one facing into RGBA pixels of size W × (D + H). */
  render(f: Facing, pal: Record<string, Mat>): ImageData {
    const { g, det, W, D, H } = this.rotated(f)
    const idx = (x: number, y: number, z: number) => (x * D + y) * H + z
    const G = (x: number, y: number, z: number) => x < 0 || y < 0 || z < 0 || x >= W || y >= D || z >= H ? 0 : g[idx(x, y, z)]
    const PH = D + H
    const img = new ImageData(W, PH)
    const src = new Int16Array(W * PH * 3).fill(-99), face = new Int8Array(W * PH), mat = new Uint8Array(W * PH)
    const put = (px: number, py: number, rgb: number[], x: number, y: number, z: number, fc: number, m: number) => {
      const o = (py * W + px) * 4
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255
      const s = (py * W + px) * 3
      src[s] = x; src[s + 1] = y; src[s + 2] = z; face[py * W + px] = fc; mat[py * W + px] = m
    }
    const col = (m: Mat, i: number) => m.ramp[Math.max(0, Math.min(3, i))]
    for (let y = 0; y < D; y++) for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const mi = g[idx(x, y, z)]
      if (!mi) continue
      const m = pal[this.mats[mi]]
      const dd = det[idx(x, y, z)]
      let fshade = 2
      if (!m.emissive && G(x + 1, y, z) === 0 && G(x - 1, y, z) !== 0) fshade = 1
      if (G(x, y, z + 1) === 0) put(x, y - z + H - 1, col(m, 3 + Math.min(0, dd)), x, y, z, 1, mi)
      if (G(x, y + 1, z) === 0) {
        const ao = !m.emissive && (z === 0 || (y + 1 < D && G(x, y + 1, z + 1) !== 0)) ? -1 : 0
        put(x, y - z + H, col(m, fshade + dd + ao), x, y, z, 2, mi)
      }
    }
    // outline + contour pass
    const out = new Uint8ClampedArray(img.data)
    const alpha = (px: number, py: number) => px < 0 || py < 0 || px >= W || py >= PH ? 0 : img.data[(py * W + px) * 4 + 3]
    for (let py = 0; py < PH; py++) for (let px = 0; px < W; px++) {
      if (!alpha(px, py)) continue
      const m = pal[this.mats[mat[py * W + px]]]
      const o = (py * W + px) * 4
      const paint = (i: number) => { const c = col(m, i); out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2] }
      if (!alpha(px, py - 1) || !alpha(px, py + 1) || !alpha(px - 1, py) || !alpha(px + 1, py)) { paint(m.emissive ? 1 : 0); continue }
      const s = (py * W + px) * 3
      for (const [qx, qy] of [[px, py - 1], [px - 1, py]]) {
        const q = (qy * W + qx) * 3
        const dist = Math.abs(src[s] - src[q]) + Math.abs(src[s + 1] - src[q + 1]) + Math.abs(src[s + 2] - src[q + 2])
        const nearer = src[s + 1] - src[s + 2] >= src[q + 1] - src[q + 2]
        if ((dist > 2 && nearer && mat[qy * W + qx] !== mat[py * W + px]) || (dist > 3 && nearer)) {
          if (!m.emissive) paint(face[py * W + px] === 1 ? 1 : 0)
          break
        }
      }
    }
    return new ImageData(out, W, PH)
  }
}
