import { avatarSheet, FRAME_H, FRAME_W } from '../avatars/avatars'
import {
  BOTTOMS, CLOTH, decodeLook, encodeLook, EYEWEAR, FACIAL, HAIR_COLORS, HAIR_STYLES, HEADWEAR, randomLook, SKIN, TOPS, type Look,
} from '../avatars/parts'
import { el } from './hud'

type Row =
  | { kind: 'chips'; label: string; key: keyof Look; options: readonly string[] }
  | { kind: 'swatch'; label: string; key: keyof Look; colors: string[] }

const SECTIONS: [string, Row[]][] = [
  ['Body', [
    { kind: 'swatch', label: 'Skin', key: 'skin', colors: SKIN },
  ]],
  ['Hair', [
    { kind: 'chips', label: 'Style', key: 'hair', options: HAIR_STYLES },
    { kind: 'swatch', label: 'Colour', key: 'hairColor', colors: HAIR_COLORS },
    { kind: 'chips', label: 'Facial hair', key: 'facial', options: FACIAL },
  ]],
  ['Outfit', [
    { kind: 'chips', label: 'Top', key: 'top', options: TOPS },
    { kind: 'swatch', label: 'Top colour', key: 'topColor', colors: CLOTH },
    { kind: 'swatch', label: 'Trim / collar', key: 'trim', colors: CLOTH },
    { kind: 'chips', label: 'Bottoms', key: 'bottom', options: BOTTOMS },
    { kind: 'swatch', label: 'Bottoms colour', key: 'bottomColor', colors: CLOTH },
    { kind: 'swatch', label: 'Shoes', key: 'shoes', colors: CLOTH },
  ]],
  ['Accessories', [
    { kind: 'chips', label: 'Eyewear', key: 'eyewear', options: EYEWEAR },
    { kind: 'chips', label: 'Headwear', key: 'headwear', options: HEADWEAR },
    { kind: 'swatch', label: 'Accessory colour', key: 'accent', colors: CLOTH },
  ]],
]

/**
 * Character creator: a live, turning, walking preview plus a chip/swatch picker
 * for every part. The result is a short recipe string (see avatars/parts.ts).
 */
export class Creator {
  private modal = el('div', 'modal hidden creator')
  private look!: Look
  private onSave: (recipe: string) => void = () => {}
  private timer = 0

  constructor(root: HTMLElement, private setTyping: (b: boolean) => void) {
    root.append(this.modal)
    this.modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close() })
  }

  get open() { return !this.modal.classList.contains('hidden') }

  show(recipe: string, onSave: (recipe: string) => void) {
    this.look = decodeLook(recipe)
    this.onSave = onSave
    this.modal.classList.remove('hidden')
    this.setTyping(true)
    this.render()
  }

  close() {
    this.modal.classList.add('hidden')
    this.modal.innerHTML = ''
    clearInterval(this.timer)
    this.setTyping(false)
  }

  private render() {
    clearInterval(this.timer)
    const m = this.modal
    m.innerHTML = ''
    const box = el('div', 'card creator-card')
    box.append(el('div', 'title', 'Your character'))

    // preview: big turning figure + the four facings
    const prev = el('div', 'cr-preview')
    const big = el('canvas', 'cr-big') as HTMLCanvasElement
    big.width = FRAME_W; big.height = FRAME_H
    const turn = el('div', 'cr-turn')
    const minis = [0, 1, 2, 3].map(() => { const c = el('canvas') as HTMLCanvasElement; c.width = FRAME_W; c.height = FRAME_H; turn.append(c); return c })
    prev.append(big, turn)
    let t = 0
    const draw = () => {
      const sheet = avatarSheet(encodeLook(this.look))
      const facing = Math.floor(t / 12) % 4, fr = [0, 1, 0, 2][t % 4]
      const g = big.getContext('2d')!
      g.clearRect(0, 0, FRAME_W, FRAME_H)
      g.drawImage(sheet, (facing * 3 + fr) * FRAME_W, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H)
      minis.forEach((c, i) => {
        const h = c.getContext('2d')!
        h.clearRect(0, 0, FRAME_W, FRAME_H)
        h.drawImage(sheet, i * 3 * FRAME_W, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H)
      })
      t++
    }
    draw()
    this.timer = window.setInterval(draw, 160)

    const opts = el('div', 'cr-opts')
    for (const [title, rows] of SECTIONS) {
      opts.append(el('div', 'cr-sec', title))
      for (const row of rows) {
        const r = el('div', 'cr-row')
        r.append(el('div', 'cr-label', row.label))
        const wrap = el('div', 'cr-choices')
        if (row.kind === 'chips') {
          row.options.forEach((name, i) => {
            const b = el('button', 'btn small' + (this.look[row.key] === i ? ' on' : ''), name)
            b.dataset.key = row.key; b.dataset.i = String(i)
            b.onclick = () => { this.look[row.key] = i; this.mark(wrap, i); draw() }
            wrap.append(b)
          })
        } else {
          row.colors.forEach((c, i) => {
            const b = el('button', 'cr-sw' + (this.look[row.key] === i ? ' on' : ''))
            b.style.background = c
            b.title = c
            b.dataset.key = row.key; b.dataset.i = String(i)
            b.onclick = () => { this.look[row.key] = i; this.mark(wrap, i); draw() }
            wrap.append(b)
          })
        }
        r.append(wrap)
        opts.append(r)
      }
    }

    const body = el('div', 'cr-body')
    body.append(prev, opts)
    const actions = el('div', 'row')
    const rnd = el('button', 'btn', '🎲 Randomize')
    rnd.onclick = () => { this.look = randomLook(); this.render() }
    const cancel = el('button', 'btn', 'Cancel')
    cancel.onclick = () => this.close()
    const save = el('button', 'btn on', 'Save')
    save.onclick = () => { const r = encodeLook(this.look); this.close(); this.onSave(r) }
    actions.append(rnd, el('span', 'grow'), cancel, save)
    box.append(body, actions)
    m.append(box)
    save.focus()
  }

  private mark(wrap: HTMLElement, i: number) {
    wrap.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.classList.toggle('on', b.dataset.i === String(i)))
  }
}
