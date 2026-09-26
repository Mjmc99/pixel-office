import * as Y from 'yjs'
import type { Rooms } from '../rooms/rooms'
import { kindOf, type Thing, type WorldScene } from '../scenes/WorldScene'
import { buildingPlan } from '../world/building'
import type { WorldState } from '../world/state'
import { el, esc, type Hud } from '../ui/hud'
import { TvSync, parseVideoId, type TvState } from './tv'
import { embedUrl } from './embeds'
import type { Screens } from './screens'

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

  private banner = el('div', 'tvbanner hidden')

  constructor(private hud: Hud, private scene: WorldScene, private doc: Y.Doc, private state: WorldState, private rooms: Rooms, private screens: Screens) {
    hud.root.append(this.box, this.banner)
    setInterval(() => this.tick(), 300)
    screens.onChange.on(() => this.refreshScreen?.())
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

  // ------------------------------------------------------------------ TV: YouTube · screen · web page · open together
  private refreshScreen?: () => void

  /** TVs on my floor, with their shared state, and whether I'm "at" them. */
  tvs() {
    return this.scene.allThings().filter((t) => kindOf(t.item) === 'tv').map((t) => {
      const m = this.doc.getMap<any>('tv:' + t.id)
      return { t, map: m, mode: (m.get('mode') ?? (m.get('v') ? 'yt' : 'off')) as string, x: (t.x + 1) * 16, y: (t.y + 1) * 16 }
    })
  }

  private tick() {
    // who's connected for screen shares
    const tvs = this.tvs()
    this.screens.tick(this.scene.mePos(), this.scene.peerPositions(),
      tvs.filter((v) => v.mode === 'screen').map((v) => ({ id: v.t.id, x: v.x, y: v.y, sharer: v.map.get('sharer') })), this.scene.zones)
    // banner for something being shared at a TV I'm near (when its panel isn't open)
    const me = this.scene.mePos()
    const near = tvs.find((v) => (v.mode === 'screen' || v.mode === 'link' || v.mode === 'web') && Math.hypot(me.x - v.x, me.y - v.y) < 8 * 16 && this.openId !== v.t.id)
    this.banner.classList.toggle('hidden', !near)
    if (!near) return
    const by = esc(near.map.get('sharerName') ?? near.map.get('byName') ?? 'Someone')
    const key = near.t.id + near.mode + (near.map.get('url') ?? '') + (near.map.get('sharer') ?? '')
    if (this.banner.dataset.key === key) return
    this.banner.dataset.key = key
    this.banner.innerHTML = ''
    if (near.mode === 'link') {
      const url = String(near.map.get('url') ?? '')
      const a = el('a', 'btn small', 'Open it too') as HTMLAnchorElement
      a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'
      this.banner.append(el('span', '', `${by} opened <b>${esc(hostOf(url))}</b> at the TV`), a)
    } else {
      const b = el('button', 'btn small', 'Watch')
      b.onclick = () => this.open(near.t)
      this.banner.append(el('span', '', near.mode === 'screen' ? `${by} is sharing their screen on the TV` : `${by} put <b>${esc(hostOf(String(near.map.get('url'))))}</b> on the TV`), b)
    }
  }

  private television(t: Thing, body: HTMLElement) {
    const map = this.doc.getMap<any>('tv:' + t.id)
    const tabs = el('div', 'row tvtabs')
    const screen = el('div', 'tvscreen')
    const yt = el('div', 'tvlayer'), live = el('video', 'tvlayer') as HTMLVideoElement, web = el('div', 'tvlayer'), link = el('div', 'tvlayer tvoff')
    live.autoplay = true; live.playsInline = true; live.muted = false
    screen.append(yt, live, web, link)
    const status = el('div', 'sub')
    const controls = el('div', 'objbody')
    body.append(tabs, screen, status, controls)

    let tab = (map.get('mode') as string) ?? 'yt'
    if (tab === 'off') tab = 'yt'
    const who = () => this.scene.deps.me.name
    const render = () => {
      const mode = (map.get('mode') ?? (map.get('v') ? 'yt' : 'off')) as string
      yt.style.display = mode === 'yt' ? '' : 'none'
      live.style.display = mode === 'screen' ? '' : 'none'
      web.style.display = mode === 'web' ? '' : 'none'
      link.style.display = mode === 'link' || mode === 'off' ? '' : 'none'
      if (mode === 'screen') {
        const sharer = map.get('sharer')
        const stream = sharer === this.scene.deps.net.selfId ? this.screens.sharing?.stream ?? null : this.screens.streams.get(sharer) ?? null
        if (live.srcObject !== stream) { live.srcObject = stream; void live.play().catch(() => {}) }
        status.innerHTML = stream ? `${esc(map.get('sharerName') ?? '')} is sharing their screen` : 'Connecting to the shared screen…'
      } else if (live.srcObject) live.srcObject = null
      if (mode === 'web') {
        const url = embedUrl(String(map.get('url') ?? '')) ?? 'about:blank'
        let f = web.querySelector('iframe')
        if (!f) {
          f = document.createElement('iframe')
          f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation')
          f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write'
          web.append(f)
        }
        if (f.src !== url) f.src = url
        status.innerHTML = `${esc(map.get('byName') ?? '')} put <b>${esc(hostOf(url))}</b> on the TV. If it stays blank, that site blocks embedding: use Open together or Share screen.`
      } else web.innerHTML = ''
      if (mode === 'link') {
        const url = String(map.get('url') ?? '')
        link.innerHTML = ''
        const a = el('a', 'btn', `Open ${esc(hostOf(url))} in a new tab`) as HTMLAnchorElement
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'
        link.append(a)
        status.innerHTML = `${esc(map.get('byName') ?? 'Someone')} is looking at this together with you`
      }
      if (mode === 'off') { link.textContent = 'The TV is off.'; status.textContent = '' }
      // tabs + controls for the tab I'm on
      tabs.innerHTML = ''
      for (const [id, label] of [['yt', 'YouTube'], ['screen', 'Share screen'], ['web', 'Web page'], ['link', 'Open together']]) {
        const b = el('button', 'tab' + (tab === id ? ' on' : ''), label)
        b.onclick = () => { tab = id; renderControls() }
        tabs.append(b)
      }
    }
    const renderControls = () => {
      render()
      controls.innerHTML = ''
      if (tab === 'yt') {
        const inp = el('input') as HTMLInputElement
        inp.placeholder = 'Paste a YouTube link and press Enter'
        this.hud.guardTyping(inp)
        inp.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return
          const id = parseVideoId(inp.value)
          if (!id) { status.textContent = 'That doesn\'t look like a YouTube link.'; return }
          this.tv!.load(id); inp.value = ''
        })
        const row = el('div', 'row')
        const play = el('button', 'btn small', 'Play'), pause = el('button', 'btn small', 'Pause'), stop = el('button', 'btn small danger', 'Turn off')
        play.onclick = () => this.tv!.play(); pause.onclick = () => this.tv!.pause(); stop.onclick = () => this.tv!.off()
        row.append(play, pause, stop)
        controls.append(inp, row)
      } else if (tab === 'screen') {
        const mine = map.get('sharer') === this.scene.deps.net.selfId && this.screens.sharing
        const b = el('button', 'btn', mine ? 'Stop sharing' : 'Share a tab or window')
        b.onclick = async () => {
          if (mine) this.screens.stopFor(map)
          else if (!(await this.screens.share(t.id, map, who()))) status.textContent = 'Sharing was cancelled.'
          renderControls()
        }
        controls.append(b, el('div', 'hint', 'Everyone at this TV (in its zone, or nearby) sees it, streamed straight from your browser.'))
      } else {
        const inp = el('input') as HTMLInputElement
        inp.placeholder = tab === 'web' ? 'https://… (Figma, Google Docs/Slides, Excalidraw, Vimeo, Loom…)' : 'https://… any site'
        this.hud.guardTyping(inp)
        inp.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return
          let u: URL
          try { u = new URL(inp.value.trim()) } catch { status.textContent = 'Enter a full https:// link.'; return }
          if (u.protocol !== 'https:') { status.textContent = 'Only https:// links.'; return }
          map.doc!.transact(() => { map.set('mode', tab); map.set('url', u.href); map.set('byName', who()) })
          inp.value = ''
        })
        const off = el('button', 'btn small danger', 'Turn off')
        off.onclick = () => map.set('mode', 'off')
        controls.append(inp, off)
      }
    }
    this.tv = new TvSync(map, yt, (s: TvState | null, pos: number) => {
      if ((map.get('mode') ?? 'yt') === 'yt') status.innerHTML = s?.v ? `${s.playing ? '▶ Playing' : '❚❚ Paused'} <code>${esc(s.v)}</code> at ${fmt(pos)} · everyone watching this TV stays in sync` : 'The TV is off.'
    })
    const obs = () => renderControls()
    map.observe(obs)
    this.refreshScreen = () => render()
    renderControls()
    this.cleanup.push(() => { map.unobserve(obs); this.refreshScreen = undefined; this.tv?.destroy(); this.tv = undefined; live.srcObject = null })
  }
}

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
