import * as Y from 'yjs'
import type { Rooms } from '../rooms/rooms'
import { kindOf, type Thing, type WorldScene } from '../scenes/WorldScene'
import { buildingPlan } from '../world/building'
import type { WorldState } from '../world/state'
import { el, esc, type Hud } from '../ui/hud'
import { TvSync, parseVideoId, type TvState } from './tv'

/**
 * Panels for no-code objects. Their live state (strokes, notes, what's on TV)
 * lives in the world's Yjs doc under a key per object, so everyone in the
 * world shares it and it survives reloads. Only placement/config is signed.
 */
export class ObjectPanels {
  private box = el('div', 'objpanel hidden')
  private current: Thing | null = null
  private cleanup: (() => void)[] = []
  private tv?: TvSync

  constructor(private hud: Hud, private scene: WorldScene, private doc: Y.Doc, private state: WorldState, private rooms: Rooms) {
    hud.root.append(this.box)
    scene.onInteract = (t) => this.open(t)
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.current && !scene.typing) this.close() })
  }

  get openId() { return this.current?.id ?? null }

  close() {
    for (const f of this.cleanup.splice(0)) f()
    this.current = null
    this.box.classList.add('hidden')
    this.box.innerHTML = ''
    this.scene.onChange()
  }

  open(t: Thing) {
    this.close()
    const kind = kindOf(t.item)
    if (!kind) return
    this.current = t
    this.box.classList.remove('hidden')
    const head = el('div', 'objhead')
    const title = el('div', 'ptitle', esc(this.scene.defs.get(t.item)?.label ?? kind))
    const x = el('button', 'btn small', 'Close <kbd>Esc</kbd>')
    x.onclick = () => this.close()
    head.append(title, x)
    this.box.append(head)
    const body = el('div', 'objbody')
    this.box.append(body)
    if (kind === 'portal') this.portal(t, body)
    if (kind === 'whiteboard') this.whiteboard(t, body)
    if (kind === 'notes') this.notes(t, body)
    if (kind === 'tv') this.television(t, body)
    this.scene.onChange()
  }

  // ------------------------------------------------------------------ portal
  /** Everywhere a portal can lead: lobbies, office doors, other portals. */
  targets(except?: string) {
    const plan = buildingPlan()
    const out: { label: string; to: { floor: number; x: number; y: number } }[] = []
    for (let f = 0; f < this.state.view.floors; f++) out.push({ label: `Lobby, floor ${f + 1}`, to: { floor: f, x: plan.spawn.x, y: plan.spawn.y - 1 } })
    for (const pl of this.rooms.list()) {
      if (pl.pending) continue
      const s = plan.slots.find((x) => x.id === pl.slot)!
      out.push({ label: `${this.rooms.pkgFor(pl)?.name ?? pl.name} (${pl.slot}${pl.floor ? `, floor ${pl.floor + 1}` : ''})`, to: { floor: pl.floor, x: s.door.x, y: s.doorSide === 'S' ? s.y + s.h - 1 : s.y } })
    }
    for (const t of this.scene.allThings()) {
      if (kindOf(t.item) !== 'portal' || t.id === except) continue
      out.push({ label: `Portal at ${t.x},${t.y}${t.floor ? ` (floor ${t.floor + 1})` : ''}`, to: { floor: t.floor, x: t.x, y: t.y } })
    }
    return out
  }

  private portal(t: Thing, body: HTMLElement) {
    const to = t.cfg?.to
    body.append(el('div', 'sub', to ? `Leads to: <b>${esc(t.cfg.label ?? `${to.x},${to.y}`)}</b>. Step on the pad to travel.` : 'Not connected yet.'))
    if (!t.editable) return
    const sel = el('select') as HTMLSelectElement
    sel.append(new Option('Choose a destination…', ''))
    const opts = this.targets(t.id)
    opts.forEach((o, i) => sel.append(new Option(o.label, String(i))))
    const save = el('button', 'btn small', 'Connect')
    save.onclick = () => {
      const o = opts[Number(sel.value)]
      if (!o) return
      this.scene.configure(t.id, { to: o.to, label: o.label })
      this.close()
    }
    body.append(el('label', '', 'Destination'), sel, save)
  }

  // ------------------------------------------------------------------ whiteboard
  private whiteboard(t: Thing, body: HTMLElement) {
    type Stroke = { c: string; w: number; p: number[] }
    const strokes = this.doc.getArray<Stroke>('wb:' + t.id)
    const W = 640, H = 400
    const canvas = el('canvas', 'wb') as HTMLCanvasElement
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!
    let color = '#1b1a22', width = 3
    const draw = (s: Stroke) => {
      ctx.strokeStyle = s.c; ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.beginPath()
      for (let i = 0; i < s.p.length; i += 2) {
        const x = s.p[i] * W, y = s.p[i + 1] * H
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    const redraw = () => {
      ctx.fillStyle = '#f6f4ee'; ctx.fillRect(0, 0, W, H)
      strokes.forEach(draw)
    }
    redraw()
    const obs = () => redraw()
    strokes.observe(obs)
    this.cleanup.push(() => strokes.unobserve(obs))
    let cur: Stroke | null = null
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return [Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000]
    }
    canvas.onpointerdown = (e) => { canvas.setPointerCapture(e.pointerId); cur = { c: color, w: width, p: pos(e) } }
    canvas.onpointermove = (e) => { if (!cur) return; cur.p.push(...pos(e)); redraw(); draw(cur) }
    canvas.onpointerup = () => { if (cur && cur.p.length >= 2) strokes.push([cur]); cur = null }
    const tools = el('div', 'row')
    for (const [c, label] of [['#1b1a22', 'Black'], ['#d44c3c', 'Red'], ['#2f78b0', 'Blue'], ['#2f9e5a', 'Green'], ['#f6f4ee', 'Eraser']]) {
      const b = el('button', 'btn small swatch', label)
      b.style.borderColor = c
      b.onclick = () => { color = c; width = c === '#f6f4ee' ? 18 : 3; for (const x of tools.querySelectorAll('.swatch')) x.classList.remove('on'); b.classList.add('on') }
      tools.append(b)
    }
    const clear = el('button', 'btn small danger', 'Clear board')
    clear.onclick = () => this.doc.transact(() => strokes.delete(0, strokes.length))
    tools.append(clear)
    body.append(canvas, tools)
  }

  // ------------------------------------------------------------------ notes
  private notes(t: Thing, body: HTMLElement) {
    type Note = { id: string; text: string; color: string; by: string; t: number }
    const notes = this.doc.getArray<Note>('notes:' + t.id)
    const list = el('div', 'notes')
    const render = () => {
      list.innerHTML = ''
      notes.forEach((n, i) => {
        const card = el('div', 'note', esc(n.text))
        card.style.background = n.color
        card.append(el('i', '', esc(n.by)))
        const rm = el('button', 'x', '×')
        rm.title = 'Remove note'
        rm.onclick = () => notes.delete(i, 1)
        card.append(rm)
        list.append(card)
      })
      if (!notes.length) list.append(el('div', 'sub', 'No notes yet.'))
    }
    render()
    const obs = () => render()
    notes.observe(obs)
    this.cleanup.push(() => notes.unobserve(obs))
    const inp = el('input') as HTMLInputElement
    inp.placeholder = 'Write a note and press Enter'
    inp.maxLength = 280
    this.hud.guardTyping(inp)
    const colors = ['#ffe58a', '#ffb3c1', '#b5e8ff', '#c9f2b5']
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !inp.value.trim()) return
      notes.push([{ id: Math.random().toString(36).slice(2, 8), text: inp.value.trim(), color: colors[notes.length % colors.length], by: this.scene.deps.me.name, t: Date.now() }])
      inp.value = ''
      setTimeout(() => inp.focus(), 0)
    })
    body.append(list, inp)
    setTimeout(() => inp.focus(), 0)
  }

  // ------------------------------------------------------------------ TV / watch party
  private television(t: Thing, body: HTMLElement) {
    const map = this.doc.getMap<any>('tv:' + t.id)
    const screen = el('div', 'tvscreen')
    const status = el('div', 'sub')
    const inp = el('input') as HTMLInputElement
    inp.placeholder = 'Paste a YouTube link and press Enter'
    this.hud.guardTyping(inp)
    const row = el('div', 'row')
    const play = el('button', 'btn small', 'Play'), pause = el('button', 'btn small', 'Pause'), stop = el('button', 'btn small danger', 'Turn off')
    row.append(play, pause, stop)
    body.append(screen, status, inp, row)
    this.tv = new TvSync(map, screen, (s: TvState | null, pos: number) => {
      status.innerHTML = s?.v ? `${s.playing ? '▶ Playing' : '❚❚ Paused'} <code>${esc(s.v)}</code> at ${fmt(pos)} · everyone watching this TV stays in sync` : 'The TV is off.'
    })
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      const id = parseVideoId(inp.value)
      if (!id) { status.textContent = 'That doesn\'t look like a YouTube link.'; return }
      this.tv!.load(id)
      inp.value = ''
    })
    play.onclick = () => this.tv!.play()
    pause.onclick = () => this.tv!.pause()
    stop.onclick = () => this.tv!.off()
    this.cleanup.push(() => { this.tv?.destroy(); this.tv = undefined })
  }
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
