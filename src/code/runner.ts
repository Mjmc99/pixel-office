import * as Y from 'yjs'
import type { Transport } from '../net/transport'
import type { Rooms, Placement } from '../rooms/rooms'
import { pkgKey } from '../rooms/package'
import type { Thing, WorldScene } from '../scenes/WorldScene'
import { buildingPlan } from '../world/building'
import { hashHex, shortKey } from '../world/crypto'
import type { WorldState } from '../world/state'
import { el, esc, type Hud } from '../ui/hud'
import { ALL_PERMS, CodeHost, panelDoc, safeDomains, type Perm, type RoomCode } from './host'

const STATE_LIMIT = 256_000

/**
 * Runs the code of the office you're standing in, with your consent.
 * Owners' own code always runs for them; visitors choose Run / Always / Don't run.
 */
export class CodeRunner {
  private host: CodeHost | null = null
  private running: { key: string; pl: Placement; codeHash: string; granted: Set<Perm> } | null = null
  private state?: Y.Map<any>
  private stateObs?: (e: Y.YMapEvent<any>) => void
  private lastPlayers = ''
  private promptEl = el('div', 'modal hidden')
  private panelEl = el('div', 'card codepanel hidden')
  private panelFrame?: HTMLIFrameElement
  private toastEl = el('div', 'toast hidden')
  private toastTimer = 0
  private declined = new Set<string>()
  private asking: string | null = null
  private ch
  logs: { kind: string; text: string }[] = []
  onLog: () => void = () => {}

  constructor(hud: Hud, private scene: WorldScene, private rooms: Rooms, private world: WorldState, private doc: Y.Doc, private net: Transport) {
    hud.root.append(this.promptEl, this.panelEl, this.toastEl)
    this.ch = net.channel<{ k: string; ev: string; data: unknown }>('rc')
    this.ch.onMessage((m: any, from) => {
      if (!this.running || m?.k !== this.running.key) return
      this.host?.send({ t: 'event', ev: 'message', args: [from, String(m.ev).slice(0, 40), m.data] })
    })
    window.addEventListener('message', (e) => {
      if (this.panelFrame && e.source === this.panelFrame.contentWindow && e.data?.__rc) this.host?.send({ t: 'event', ev: 'panel', args: [e.data.data] })
    })
    setInterval(() => this.tick(), 250)
  }

  get status() {
    return this.running ? { key: this.running.key, dead: this.host?.dead ?? null } : null
  }

  private consentKey(pl: Placement, codeHash: string) { return `po:code:${pkgKey(pl)}:${codeHash}` }
  private consent(pl: Placement, codeHash: string) {
    try { return localStorage.getItem(this.consentKey(pl, codeHash)) } catch { return null }
  }
  setConsent(pl: Placement, codeHash: string, v: 'always' | 'never') {
    try { localStorage.setItem(this.consentKey(pl, codeHash), v) } catch { /* no storage: ask again next time */ }
  }

  /** The office I'm in (active, with code), if any. */
  private currentOffice() {
    const t = this.scene.meTile()
    const slot = buildingPlan().slots.find((s) => t.x >= s.x && t.x < s.x + s.w && t.y >= s.y && t.y < s.y + s.h)
    if (!slot) return null
    const pl = this.rooms.placementAt(slot.id, this.scene.floor)
    const pkg = pl && !pl.pending ? this.rooms.pkgFor(pl) : null
    if (!pl || !pkg?.code?.src) return null
    return { pl, pkg, slot, code: pkg.code as RoomCode, codeHash: hashHex(JSON.stringify(pkg.code)).slice(0, 12) }
  }

  private tick() {
    const cur = this.currentOffice()
    const key = cur ? `${pkgKey(cur.pl)}#${cur.codeHash}` : null
    if ((this.running ? `${pkgKey(this.running.pl)}#${this.running.codeHash}` : null) !== key) {
      this.stop()
      if (cur) this.maybeStart(cur)
    }
    if (this.running && this.host && !this.host.dead) this.syncPlayers()
  }

  private maybeStart(cur: NonNullable<ReturnType<CodeRunner['currentOffice']>>) {
    const mine = cur.pl.owner === this.world.me.pub
    const c = this.consent(cur.pl, cur.codeHash)
    const id = `${pkgKey(cur.pl)}#${cur.codeHash}`
    if (mine || c === 'always') return this.start(cur)
    if (c === 'never' || this.declined.has(id) || this.asking === id) return
    this.ask(cur)
  }

  private ask(cur: NonNullable<ReturnType<CodeRunner['currentOffice']>>) {
    const id = `${pkgKey(cur.pl)}#${cur.codeHash}`
    this.asking = id
    const m = this.promptEl
    m.innerHTML = ''
    m.classList.remove('hidden')
    const box = el('div', 'card')
    const perms = cur.code.perms ?? []
    const list = ALL_PERMS.filter((p) => perms.includes(p.id)).map((p) => `<li${p.risky ? ' class="risky"' : ''}>${esc(p.label)}</li>`).join('')
    const domains = safeDomains(cur.code.domains)
    box.append(
      el('div', 'ptitle', `${esc(cur.pkg.name)} has office code`),
      el('div', 'sub', `By ${esc(cur.pkg.ownerName)} <code>${shortKey(cur.pl.owner)}</code>. It runs in a sandbox and can't see your files, keys or other offices. It asks to:`),
      el('ul', 'perms', list || '<li>Nothing (it can only log)</li>'),
      ...(domains.length ? [el('div', 'hint', `Websites: ${domains.map(esc).join(', ')}`)] : []),
    )
    const row = el('div', 'row')
    const done = () => { m.classList.add('hidden'); this.asking = null }
    const once = el('button', 'btn', 'Run it'), always = el('button', 'btn', 'Always for this office'), no = el('button', 'btn', "Don't run")
    once.onclick = () => { done(); this.start(cur) }
    always.onclick = () => { done(); this.setConsent(cur.pl, cur.codeHash, 'always'); this.start(cur) }
    no.onclick = () => { done(); this.declined.add(id) }
    row.append(once, always, no)
    box.append(row)
    m.append(box)
  }

  private start(cur: NonNullable<ReturnType<CodeRunner['currentOffice']>>) {
    const granted = new Set<Perm>((cur.code.perms ?? []).filter((p) => ALL_PERMS.some((x) => x.id === p)))
    const key = pkgKey(cur.pl)
    this.running = { key, pl: cur.pl, codeHash: cur.codeHash, granted }
    this.state = this.doc.getMap<any>('rc:' + key)
    this.lastPlayers = ''
    this.log('log', `running ${cur.pkg.name} code`)
    this.host = new CodeHost(cur.code, granted, (fn, args) => this.onCall(fn, args, cur), (kind, text) => this.log(kind, text), () => {
      const players = granted.has('players') ? this.players(cur.slot) : []
      this.host?.send({ t: 'init', mirror: {
        me: { id: this.net.selfId, name: this.scene.deps.me.name },
        players, state: granted.has('state') ? this.state!.toJSON() : {},
        host: this.isHost(cur.slot), info: { name: cur.pkg.name, w: cur.slot.w, h: cur.slot.h },
      } })
      this.lastPlayers = JSON.stringify(players.map((p) => p.id))
      // your own arrival
      this.host?.send({ t: 'event', ev: 'enter', args: [{ id: this.net.selfId, name: this.scene.deps.me.name }] })
    })
    this.stateObs = (e) => {
      if (!granted.has('state')) return
      for (const k of e.keysChanged) this.host?.send({ t: 'state', k, v: this.state!.get(k) })
    }
    this.state.observe(this.stateObs)
  }

  stop() {
    if (this.stateObs) this.state?.unobserve(this.stateObs)
    this.host?.stop()
    this.host = null
    this.running = null
    this.scene.clearCodeSprites()
    this.closePanel()
  }

  private players(slot: { x: number; y: number; w: number; h: number }) {
    return this.scene.peopleIn(slot).map((p) => ({ ...p, x: p.x - slot.x, y: p.y - slot.y }))
  }
  private isHost(slot: { x: number; y: number; w: number; h: number }) {
    const ids = this.scene.peopleIn(slot).map((p) => p.id).sort()
    return ids[0] === this.net.selfId
  }

  private syncPlayers() {
    const cur = this.currentOffice()
    if (!cur || !this.running) return
    const players = this.players(cur.slot)
    const sig = JSON.stringify(players.map((p) => p.id))
    if (sig !== this.lastPlayers) {
      const before = new Set(JSON.parse(this.lastPlayers || '[]') as string[])
      const now = new Set(players.map((p) => p.id))
      for (const p of players) if (!before.has(p.id)) this.host?.send({ t: 'event', ev: 'enter', args: [{ id: p.id, name: p.name }] })
      for (const id of before) if (!now.has(id)) this.host?.send({ t: 'event', ev: 'leave', args: [{ id }] })
      this.lastPlayers = sig
    }
    if (this.running.granted.has('players')) this.host?.send({ t: 'players', players })
    this.host?.send({ t: 'host', host: this.isHost(cur.slot) })
  }

  /** E pressed next to (non-object) furniture inside the running office. */
  interact(t: Thing) {
    if (!this.running || t.source !== 'room' || !t.id.startsWith(this.running.pl.key + '/')) return false
    this.host?.send({ t: 'event', ev: 'interact', args: [t.id.slice(t.id.lastIndexOf('/') + 1)] })
    return true
  }
  get active() { return !!this.running && !this.host?.dead }

  private onCall(fn: string, args: any[], cur: NonNullable<ReturnType<CodeRunner['currentOffice']>>) {
    const s = cur.slot
    switch (fn) {
      case 'state.set': {
        const [k, v] = args
        if (typeof k !== 'string' || k.length > 64) return
        const size = JSON.stringify({ ...this.state!.toJSON(), [k]: v }).length
        if (size > STATE_LIMIT) return this.log('error', 'state is full (256 KB)')
        this.state!.set(k, v)
        return
      }
      case 'state.delete': return void this.state!.delete(String(args[0]))
      case 'broadcast': {
        const ev = String(args[0]).slice(0, 40)
        this.ch.send({ k: this.running!.key, ev, data: args[1] })
        this.host?.send({ t: 'event', ev: 'message', args: [this.net.selfId, ev, args[1]] })
        return
      }
      case 'sprites.spawn': {
        const [id, item, x, y, f] = args
        if (!this.scene.defs.has(String(item))) return this.log('error', `unknown item ${item}`)
        const cx = Math.max(0, Math.min(s.w - 1, Math.floor(x))), cy = Math.max(0, Math.min(s.h - 1, Math.floor(y)))
        return this.scene.setCodeSprite(String(id).slice(0, 32), String(item), s.x + cx, s.y + cy, (['S', 'E', 'N', 'W'].includes(f) ? f : 'S'))
      }
      case 'sprites.move': {
        const [id, x, y, f] = args
        const cx = Math.max(0, Math.min(s.w - 1, Math.floor(x))), cy = Math.max(0, Math.min(s.h - 1, Math.floor(y)))
        return this.scene.moveCodeSprite(String(id), s.x + cx, s.y + cy, f)
      }
      case 'sprites.remove': return this.scene.removeCodeSprite(String(args[0]))
      case 'ui.toast': return this.toast(String(args[0]).slice(0, 200))
      case 'ui.panel': return this.openPanel(cur.pkg.name, String(args[0]).slice(0, 100_000))
      case 'ui.post': return this.panelFrame?.contentWindow?.postMessage({ __rc: 1, data: args[0] }, '*')
      case 'ui.close': return this.closePanel()
      case 'embed': {
        let u: URL
        try { u = new URL(String(args[0])) } catch { return this.log('error', 'bad url') }
        const ok = u.protocol === 'https:' && safeDomains(cur.code.domains).some((d) => u.hostname === d || u.hostname.endsWith('.' + d))
        if (!ok) return this.log('error', `embed: ${u.hostname} isn't in this office's website list`)
        return this.openPanel(cur.pkg.name, null, u.href)
      }
    }
  }

  private toast(text: string) {
    this.toastEl.textContent = text
    this.toastEl.classList.remove('hidden')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), 4000)
  }

  private openPanel(title: string, html: string | null, url?: string) {
    const p = this.panelEl
    const reuse = html !== null && this.panelFrame && !this.panelFrame.src
    if (!reuse) {
      p.innerHTML = ''
      const head = el('div', 'objhead')
      const x = el('button', 'btn small', 'Close')
      x.onclick = () => this.closePanel()
      head.append(el('div', 'ptitle', esc(title)), x)
      const f = document.createElement('iframe')
      if (url) {
        f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-presentation')
        f.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture'
        f.src = url
      } else {
        f.setAttribute('sandbox', 'allow-scripts')
      }
      p.append(head, f)
      this.panelFrame = f
    }
    if (html !== null) this.panelFrame!.srcdoc = panelDoc(html)
    p.classList.remove('hidden')
  }

  closePanel() {
    this.panelEl.classList.add('hidden')
    this.panelEl.innerHTML = ''
    this.panelFrame = undefined
  }

  private log(kind: string, text: string) {
    this.logs.push({ kind, text })
    if (this.logs.length > 200) this.logs.shift()
    if (kind === 'killed') this.toast(`Office code stopped: ${text}`)
    this.onLog()
  }
}
