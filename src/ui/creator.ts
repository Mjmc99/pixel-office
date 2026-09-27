import { avatarSheet, avatarThumb, FRAME_H, FRAME_W } from '../avatars/avatars'
import {
  BOTTOMS, CLOTH, decodeLook, encodeLook, EYEWEAR, FACIAL, HAIR_COLORS, HAIR_STYLES, HATS, SKIN_GRADIENT, skinHex, STARTERS,
  suggestLook, TOPS, varyLook, type Look,
} from '../avatars/parts'
import { el } from './hud'

type Row =
  | { kind: 'chips'; label: string; key: keyof Look; options: readonly string[] }
  | { kind: 'swatch'; label: string; key: keyof Look; colors: string[] }
  | { kind: 'skin'; label: string }

type Part = 'hat' | 'head' | 'torso' | 'legs'
const PARTS: { id: Part; label: string; keys: (keyof Look)[]; rows: Row[] }[] = [
  { id: 'hat', label: 'Hat', keys: ['hat', 'hatColor'], rows: [
    { kind: 'chips', label: 'Hat', key: 'hat', options: HATS },
    { kind: 'swatch', label: 'Colour', key: 'hatColor', colors: CLOTH },
  ] },
  { id: 'head', label: 'Head', keys: ['skin', 'hair', 'hairColor', 'facial', 'eyewear'], rows: [
    { kind: 'skin', label: 'Skin tone' },
    { kind: 'chips', label: 'Hair', key: 'hair', options: HAIR_STYLES },
    { kind: 'swatch', label: 'Hair colour', key: 'hairColor', colors: HAIR_COLORS },
    { kind: 'chips', label: 'Facial hair', key: 'facial', options: FACIAL },
    { kind: 'chips', label: 'Eyewear', key: 'eyewear', options: EYEWEAR },
  ] },
  { id: 'torso', label: 'Torso', keys: ['top', 'topColor', 'trim'], rows: [
    { kind: 'chips', label: 'Top', key: 'top', options: TOPS },
    { kind: 'swatch', label: 'Colour', key: 'topColor', colors: CLOTH },
    { kind: 'swatch', label: 'Trim / collar', key: 'trim', colors: CLOTH },
  ] },
  { id: 'legs', label: 'Legs', keys: ['bottom', 'bottomColor', 'shoes'], rows: [
    { kind: 'chips', label: 'Bottoms', key: 'bottom', options: BOTTOMS },
    { kind: 'swatch', label: 'Colour', key: 'bottomColor', colors: CLOTH },
    { kind: 'swatch', label: 'Shoes', key: 'shoes', colors: CLOTH },
  ] },
]

/** How often picking a starter gives you a personal variation instead of the exact starter. */
const VARY_CHANCE = 0.8

/**
 * Character creator. Four parts (hat, head, torso, legs), each with its own tab and dice;
 * a skin-tone slider; starter looks (usually varied so you're one of a kind) and a row
 * of matching combo ideas.
 */
export class Creator {
  private modal = el('div', 'modal hidden creator')
  private look!: Look
  private onSave: (recipe: string) => void = () => {}
  private timer = 0
  private tab: Part = 'head'
  private ideas: Look[] = []
  private note = ''
  private starter: Look | null = null
  private redraw = () => {}

  constructor(root: HTMLElement, private setTyping: (b: boolean) => void, private taken: () => Set<string> = () => new Set()) {
    root.append(this.modal)
    this.modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close() })
  }

  get open() { return !this.modal.classList.contains('hidden') }

  show(recipe: string, onSave: (recipe: string) => void) {
    this.look = decodeLook(recipe)
    this.onSave = onSave
    this.ideas = this.freshIdeas()
    this.note = ''
    this.starter = null
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

  /** Is this exact look already worn by someone here? */
  private isTaken(l: Look) { return this.taken().has(encodeLook(l)) }

  private freshIdeas() {
    const out: Look[] = []
    while (out.length < 6) { const l = suggestLook(); if (!this.isTaken(l)) out.push(l) }
    return out
  }

  /** Pick a starter: most of the time you get your own variation of it. */
  pickStarter(i: number, rand = Math.random) {
    const base = STARTERS[i].look
    this.starter = base
    if (rand() < VARY_CHANCE || this.isTaken(base)) {
      let l = varyLook(base, rand)
      for (let n = 0; n < 10 && this.isTaken(l); n++) l = varyLook(base, rand)
      this.look = l
      this.note = `Your own take on <b>${STARTERS[i].name}</b>: new skin tone and colours.`
    } else {
      this.look = { ...base }
      this.note = `The original <b>${STARTERS[i].name}</b>.`
    }
    this.render()
  }

  private rollPart(p: (typeof PARTS)[number]) {
    const s = suggestLook()
    for (const k of p.keys) this.look[k] = s[k]
    if (p.id === 'hat' && !this.look.hat) this.look.hat = 1 + Math.floor(Math.random() * (HATS.length - 1))
  }

  private render() {
    clearInterval(this.timer)
    const m = this.modal
    m.innerHTML = ''
    const box = el('div', 'card creator-card')
    box.append(el('div', 'title', 'Your character'))

    // ---- preview
    const prev = el('div', 'cr-preview')
    const big = el('canvas', 'cr-big') as HTMLCanvasElement
    big.width = FRAME_W; big.height = FRAME_H
    const turn = el('div', 'cr-turn')
    const minis = [0, 1, 2, 3].map(() => { const c = el('canvas') as HTMLCanvasElement; c.width = FRAME_W; c.height = FRAME_H; turn.append(c); return c })
    const badge = el('div', 'cr-badge')
    prev.append(big, turn, badge)
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
    this.redraw = () => {
      t = 0; draw()
      const dup = this.isTaken(this.look)
      badge.className = 'cr-badge' + (dup ? ' dup' : '')
      badge.textContent = dup ? 'Someone here already looks exactly like this' : '✨ One of a kind here'
    }
    this.redraw()
    this.timer = window.setInterval(draw, 160)

    const opts = el('div', 'cr-opts')

    // ---- starters
    opts.append(el('div', 'cr-sec', 'Start from'))
    const starters = el('div', 'cr-looks')
    STARTERS.forEach((s, i) => {
      const b = el('button', 'cr-look' + (this.starter === s.look ? ' on' : ''))
      b.title = s.name
      b.dataset.starter = s.name
      const img = el('img') as HTMLImageElement
      img.src = avatarThumb(encodeLook(s.look))
      b.append(img, el('span', '', s.name))
      b.onclick = () => this.pickStarter(i)
      starters.append(b)
    })
    opts.append(starters)
    if (this.note) {
      const n = el('div', 'cr-note', this.note + ' ')
      if (this.starter) {
        const base = this.starter
        const same = encodeLook(this.look) === encodeLook(base)
        const link = el('button', 'linkish', same ? 'Make it unique' : 'Use the original')
        link.onclick = () => {
          const i = STARTERS.findIndex((s) => s.look === base)
          if (same) { this.look = varyLook(base); this.note = `Your own take on <b>${STARTERS[i].name}</b>: new skin tone and colours.` }
          else { this.look = { ...base }; this.note = `The original <b>${STARTERS[i].name}</b>.` }
          this.render()
        }
        n.append(link)
      }
      opts.append(n)
    }

    // ---- ideas
    const ideasHead = el('div', 'cr-sec', 'Ideas ')
    const more = el('button', 'btn small', '↻ More ideas')
    more.onclick = () => { this.ideas = this.freshIdeas(); this.render() }
    ideasHead.append(more)
    opts.append(ideasHead)
    const ideas = el('div', 'cr-looks')
    for (const idea of this.ideas) {
      const b = el('button', 'cr-look idea')
      const img = el('img') as HTMLImageElement
      img.src = avatarThumb(encodeLook(idea))
      b.append(img)
      b.onclick = () => { this.look = { ...idea }; this.starter = null; this.note = ''; this.render() }
      ideas.append(b)
    }
    opts.append(ideas)

    // ---- the four parts
    const tabs = el('div', 'cr-tabs')
    const pane = el('div', 'cr-pane')
    for (const p of PARTS) {
      const tb = el('button', 'btn small' + (this.tab === p.id ? ' on' : ''), p.label)
      tb.dataset.part = p.id
      tb.onclick = () => { this.tab = p.id; this.render() }
      tabs.append(tb)
    }
    const part = PARTS.find((p) => p.id === this.tab)!
    const dice = el('button', 'btn small', `🎲 Just the ${part.label.toLowerCase()}`)
    dice.onclick = () => { this.rollPart(part); this.render() }
    tabs.append(el('span', 'grow'), dice)
    for (const row of part.rows) pane.append(this.row(row))
    opts.append(el('div', 'cr-sec', 'Customize'), tabs, pane)

    const body = el('div', 'cr-body')
    body.append(prev, opts)
    const actions = el('div', 'row')
    const rnd = el('button', 'btn', '🎲 Surprise me')
    rnd.onclick = () => { this.look = this.freshIdeas()[0]; this.starter = null; this.note = ''; this.render() }
    const cancel = el('button', 'btn', 'Cancel')
    cancel.onclick = () => this.close()
    const save = el('button', 'btn on', 'Save')
    save.onclick = () => { const r = encodeLook(this.look); this.close(); this.onSave(r) }
    actions.append(rnd, el('span', 'grow'), cancel, save)
    box.append(body, actions)
    m.append(box)
    save.focus({ preventScroll: true })
  }

  private row(row: Row) {
    const r = el('div', 'cr-row')
    r.append(el('div', 'cr-label', row.label))
    const wrap = el('div', 'cr-choices')
    const changed = () => { this.redraw() }
    if (row.kind === 'skin') {
      const slider = el('input', 'cr-skin') as HTMLInputElement
      slider.type = 'range'; slider.min = '0'; slider.max = '255'; slider.value = String(this.look.skin)
      slider.style.background = SKIN_GRADIENT
      const chip = el('span', 'cr-skinchip')
      const sync = () => { chip.style.background = skinHex(this.look.skin) }
      slider.oninput = () => { this.look.skin = +slider.value; sync(); changed() }
      const roll = el('button', 'btn small', '🎲')
      roll.title = 'Random skin tone'
      roll.onclick = () => { this.look.skin = Math.floor(Math.random() * 256); slider.value = String(this.look.skin); sync(); changed() }
      sync()
      wrap.append(slider, chip, roll)
    } else if (row.kind === 'chips') {
      row.options.forEach((name, i) => {
        const b = el('button', 'btn small' + (this.look[row.key] === i ? ' on' : ''), name)
        b.dataset.i = String(i)
        b.onclick = () => { this.look[row.key] = i; this.mark(wrap, i); changed() }
        wrap.append(b)
      })
    } else {
      row.colors.forEach((c, i) => {
        const b = el('button', 'cr-sw' + (this.look[row.key] === i ? ' on' : ''))
        b.style.background = c
        b.title = c
        b.dataset.i = String(i)
        b.onclick = () => { this.look[row.key] = i; this.mark(wrap, i); changed() }
        wrap.append(b)
      })
    }
    r.append(wrap)
    return r
  }

  private mark(wrap: HTMLElement, i: number) {
    wrap.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.classList.toggle('on', b.dataset.i === String(i)))
  }
}
