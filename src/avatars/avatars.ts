import type Phaser from 'phaser'
import { buildAvatar, decodeLook, MODEL_H, palette, toRecipe } from './parts'
import { FACINGS } from './voxel'

/** Every avatar frame is 16 × (16 + MODEL_H) px; the feet sit 8.5 rows below the model height. */
export const FRAME_W = 16, FRAME_H = 16 + MODEL_H
export const ORIGIN: [number, number] = [0.5, (MODEL_H + 8.5) / FRAME_H]

const sheets = new Map<string, HTMLCanvasElement>()

/** Render a recipe to a 12-frame sheet: facings S,E,N,W × walk frames 0,1,2. Cached. */
export function avatarSheet(recipe: string): HTMLCanvasElement {
  const key = toRecipe(recipe)
  let c = sheets.get(key)
  if (c) return c
  const look = decodeLook(key)
  const pal = palette(look)
  c = document.createElement('canvas')
  c.width = FRAME_W * 12; c.height = FRAME_H
  const g = c.getContext('2d')!
  for (let fr = 0; fr < 3; fr++) {
    const m = buildAvatar(look, fr)
    m.texture(pal)
    FACINGS.forEach((f, fi) => g.putImageData(m.render(f, pal), (fi * 3 + fr) * FRAME_W, 0))
  }
  sheets.set(key, c)
  return c
}

/** Phaser texture key for a recipe (created on first use) with frames "S_0" … "W_2". */
export function avatarTexture(scene: Phaser.Scene, recipe: string): string {
  const key = 'av:' + toRecipe(recipe)
  if (scene.textures.exists(key)) return key
  const tex = scene.textures.addCanvas(key, avatarSheet(recipe))!
  FACINGS.forEach((f, fi) => { for (let fr = 0; fr < 3; fr++) tex.add(`${f}_${fr}`, 0, (fi * 3 + fr) * FRAME_W, 0, FRAME_W, FRAME_H) })
  return key
}

const thumbs = new Map<string, string>()
/** PNG data URL of the front-facing standing frame, for the HUD. */
export function avatarThumb(recipe: string): string {
  const key = toRecipe(recipe)
  let u = thumbs.get(key)
  if (!u) {
    const c = document.createElement('canvas')
    c.width = FRAME_W; c.height = FRAME_H
    c.getContext('2d')!.drawImage(avatarSheet(key), 0, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H)
    u = c.toDataURL()
    thumbs.set(key, u)
  }
  return u
}
