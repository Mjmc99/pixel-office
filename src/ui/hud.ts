import type { Transport } from '../net/transport'
import { layoutDef } from '../world/layouts'
import type { WorldScene } from '../scenes/WorldScene'
import type { Call } from '../media/call'
import type { WorldState } from '../world/state'
import { exportIdentity, importIdentity, shortKey } from '../world/crypto'
import type { Manifest } from '../world/types'
import { Tiles } from './tiles'
import { Creator } from './creator'
import { avatarThumb } from '../avatars/avatars'
import { toRecipe } from '../avatars/parts'

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
export function esc(s: string) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/** DOM overlay: world card, people, settings, identity, decorate palette, chat, call controls, elevator. */
export class Hud {
  root = document.getElementById('hud')!
  scene!: WorldScene
  private peersEl = el('div', 'peers')
  private titleEl = el('div', 'title')
  private palette = el('div', 'palette hidden')
  private snapBtn = el('button', 'btn small snap', '')
  private grid = el('div', 'grid')
  private tabs = el('div', 'tabs')
  private status = el('div', 'status')
  private decoBtn = el('button', 'btn', 'Decorate <kbd>B</kbd>')
  private chatIn = el('input', 'chat') as HTMLInputElement
  /** Opens the character creator (set once attached). */
  openCreator = () => {}
  private micBtn = el('button', 'btn media', 'Mic off <kbd>M</kbd>')
  private camBtn = el('button', 'btn media', 'Cam off <kbd>V</kbd>')
  private zoneEl = el('div', 'zone hidden')
  private errEl = el('div', 'err hidden')
  private elevEl = el('div', 'card elevator hidden')
  private panel = el('div', 'card panel hidden')
  private bannedEl = el('div', 'banned hidden', 'You have been banned from this world by its moderators.')
  private useEl = el('div', 'use hidden')
  private tiles?: Tiles
  private themeTab = 'office'
  private thumbs = new Map<string, string>()
  private zoneSig = ''
  private tabSig = ''
  private panelKind: 'people' | 'settings' | null = null
  onOffices: () => void = () => {}
  /** Opens the floor layout chooser (owner + mods). */
  onLayouts: (floor: number) => void = () => {}
  /** Later phases add tabs to the decorate palette: [id, label, render(grid)]. */
  extraTabs: { id: string; label: string; visible: () => boolean; render: (grid: HTMLElement) => void; onOpen?: () => void; onClose?: () => void }[] = []

  constructor(private manifest: Manifest, private net: Transport, private world: { id: string }, private call: Call, private state: WorldState) {}

  attach(scene: WorldScene, onMe: (name: string, avatar: string) => void) {
    this.scene = scene
    this.themeTab = scene.theme

    // ---- world card
    const card = el('div', 'card world')
    card.append(this.titleEl)
    card.append(el('div', 'sub', `World <code>${this.world.id}</code> · <span class="tag">${this.net.kind === 'p2p' ? 'P2P' : 'LOCAL'}</span>`))
    const row = el('div', 'row')
    const invite = el('button', 'btn small', 'Copy invite link')
    invite.onclick = async () => {
      try { await navigator.clipboard.writeText(location.href); invite.textContent = 'Copied!' } catch { this.showPanelText('Invite link', location.href) }
      setTimeout(() => (invite.textContent = 'Copy invite link'), 1500)
    }
    const people = el('button', 'btn small', 'People')
    people.onclick = () => this.togglePanel('people')
    const settings = el('button', 'btn small', 'Settings')
    settings.onclick = () => this.togglePanel('settings')
    const offices = el('button', 'btn small', 'Offices')
    offices.onclick = () => this.onOffices()
    row.append(invite, offices, people, settings)
    card.append(this.peersEl, row)
    this.root.append(card, this.panel, this.elevEl, this.bannedEl, this.useEl)

    // ---- identity card
    const idc = el('div', 'card me')
    const nameIn = el('input', 'name') as HTMLInputElement
    nameIn.value = scene.deps.me.name
    nameIn.maxLength = 24
    let recipe = toRecipe(scene.deps.me.avatar)
    const face = el('img', 'face') as HTMLImageElement
    face.title = 'Customize your character'
    const custom = el('button', 'btn small customize', 'Customize')
    const apply = () => {
      face.src = avatarThumb(recipe)
      onMe(nameIn.value.trim() || 'Guest', recipe)
    }
    const creator = new Creator(this.root, (b) => (this.scene.typing = b), () => this.scene.recipesInUse())
    const openCreator = () => creator.show(recipe, (r) => { recipe = r; apply() })
    custom.onclick = openCreator
    face.onclick = openCreator
    this.openCreator = openCreator
    nameIn.onchange = apply
    this.guardTyping(nameIn)
    idc.append(face, nameIn, custom)
    this.root.append(idc)
    face.src = avatarThumb(recipe)

    // ---- toolbar
    const bar = el('div', 'toolbar')
    this.decoBtn.onclick = () => {
      scene.setDecorating(!scene.decorating)
      if (scene.decorating && this.themeTab === 'zones') scene.setZoneMode(true)
    }
    const chatBtn = el('button', 'btn', 'Chat <kbd>Enter</kbd>')
    chatBtn.onclick = () => this.openChat()
    this.micBtn.onclick = () => void this.call.devices.setMic(!this.call.devices.micOn)
    this.camBtn.onclick = () => void this.call.devices.setCam(!this.call.devices.camOn)
    bar.append(this.micBtn, this.camBtn, this.decoBtn, chatBtn, this.status)
    this.root.append(bar, this.zoneEl, this.errEl)
    this.call.devices.onChange.on(() => this.refreshMedia())
    window.addEventListener('keydown', (e) => {
      if (this.scene.typing || e.repeat || e.ctrlKey || e.metaKey) return
      if (e.key === 'm' || e.key === 'M') this.micBtn.click()
      if (e.key === 'v' || e.key === 'V') this.camBtn.click()
    })

    // ---- call tiles
    this.tiles = new Tiles(this.call)
    const avatarUrl = (recipe: string) => avatarThumb(recipe)
    setInterval(() => {
      const info = scene.callInfo()
      const d = this.call.devices
      this.tiles!.update(
        { id: 'me', name: 'You', cam: d.camOn, mic: d.micOn, avatarUrl: avatarUrl(info.me.preset), speaking: d.level > 0.04 },
        info.peers.map((p) => ({ ...p, avatarUrl: avatarUrl(p.preset) })),
      )
      const n = info.peers.length
      this.zoneEl.classList.toggle('hidden', !info.zone && n === 0)
      this.zoneEl.innerHTML = info.zone
        ? `In <b>${esc(info.zone)}</b> · ${n ? `talking with ${n}` : 'nobody else here'}`
        : n ? `Nearby: talking with <b>${n}</b>` : ''
      if (this.call.videoHeld) this.zoneEl.innerHTML += ' · camera paused in this big call until you speak'
    }, 200)
    this.refreshMedia()

    // ---- chat
    this.chatIn.placeholder = 'Say something… (Enter to send, Esc to cancel)'
    this.chatIn.maxLength = 200
    this.chatIn.classList.add('hidden')
    this.chatIn.onkeydown = (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') { const t = this.chatIn.value.trim(); if (t) scene.say('me', t); this.closeChat() }
      if (e.key === 'Escape') this.closeChat()
    }
    this.root.append(this.chatIn)
    window.addEventListener('keydown', (e) => {
      const t = document.activeElement
      const inField = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t as HTMLElement | null)?.isContentEditable
      if (e.key === 'Enter' && !inField) { e.preventDefault(); this.openChat() }
    })

    // ---- decorate palette
    this.palette.append(this.tabs, this.grid)
    this.root.append(this.palette)
    this.renderTabs()
    this.renderGrid()

    scene.onChange = () => this.refresh()
    this.net.onPeerJoin(() => this.refresh())
    this.net.onPeerLeave(() => this.refresh())
    this.refresh()
  }

  // ------------------------------------------------------------------ helpers
  guardTyping(inp: HTMLInputElement | HTMLTextAreaElement) {
    inp.addEventListener('focus', () => (this.scene.typing = true))
    inp.addEventListener('blur', () => (this.scene.typing = false))
    inp.addEventListener('keydown', (e: Event) => { const ke = e as KeyboardEvent; ke.stopPropagation(); if (ke.key === 'Enter' && inp instanceof HTMLInputElement) inp.blur() })
  }

  private openChat() {
    this.chatIn.classList.remove('hidden')
    this.chatIn.value = ''
    this.scene.typing = true
    this.chatIn.focus()
  }
  private closeChat() {
    this.chatIn.classList.add('hidden')
    this.chatIn.blur()
    this.scene.typing = false
  }

  /** PNG data URL of one atlas frame (cached), for DOM thumbnails. */
  thumb(key: string, frame: string) {
    const k = key + ':' + frame
    if (!this.thumbs.has(k)) this.thumbs.set(k, this.scene.textures.getBase64(key, frame) as string)
    return this.thumbs.get(k)!
  }

  private refreshMedia() {
    const d = this.call.devices
    this.micBtn.innerHTML = `${d.micOn ? 'Mic on' : 'Mic off'} <kbd>M</kbd>`
    this.camBtn.innerHTML = `${d.camOn ? 'Cam on' : 'Cam off'} <kbd>V</kbd>`
    this.micBtn.classList.toggle('live', d.micOn)
    this.camBtn.classList.toggle('live', d.camOn)
    this.errEl.textContent = d.error
    this.errEl.classList.toggle('hidden', !d.error)
  }

  // ------------------------------------------------------------------ side panel (people / settings)
  private togglePanel(kind: 'people' | 'settings') {
    this.panelKind = this.panelKind === kind ? null : kind
    this.renderPanel()
  }

  private showPanelText(title: string, text: string) {
    this.panelKind = null
    this.panel.innerHTML = ''
    this.panel.classList.remove('hidden')
    const ta = el('textarea') as HTMLTextAreaElement
    ta.value = text; ta.readOnly = true; ta.rows = 3
    const close = el('button', 'btn small', 'Close')
    close.onclick = () => this.panel.classList.add('hidden')
    this.panel.append(el('div', 'ptitle', esc(title)), ta, close)
    ta.select()
  }

  renderPanel() {
    const p = this.panel
    p.innerHTML = ''
    p.classList.toggle('hidden', !this.panelKind)
    if (!this.panelKind) return
    const st = this.state
    if (this.panelKind === 'people') {
      p.append(el('div', 'ptitle', 'People in this world'))
      const meRow = el('div', 'prow', `<span>${esc(this.scene.deps.me.name)} (you)</span><span class="role">${st.roleOf(st.me.pub)}</span>`)
      p.append(meRow)
      for (const person of this.scene.people()) {
        const r = el('div', 'prow')
        r.append(el('span', '', `${esc(person.name)}${person.floor !== this.scene.floor ? ` <i>floor ${person.floor + 1}</i>` : ''}`))
        r.append(el('span', 'role', person.banned ? 'banned' : person.role))
        if (person.uid && st.isMod && person.role !== 'owner') {
          if (st.isOwner) {
            const mod = el('button', 'btn small', person.role === 'mod' ? 'Remove mod' : 'Make mod')
            mod.onclick = () => void st.author('role', { target: person.uid, role: person.role === 'mod' ? 'member' : 'mod' })
            r.append(mod)
          }
          if (person.role !== 'mod' || st.isOwner) {
            const ban = el('button', 'btn small danger', person.banned ? 'Unban' : 'Ban')
            ban.onclick = () => void st.author('ban', { target: person.uid, on: !person.banned })
            r.append(ban)
          }
        }
        p.append(r)
      }
      if (!this.scene.people().length) p.append(el('div', 'sub', 'Nobody else is here yet.'))
      return
    }
    // settings
    p.append(el('div', 'ptitle', 'Settings'))
    if (st.isOwner) {
      const name = el('input') as HTMLInputElement
      name.value = st.view.name; name.maxLength = 40
      this.guardTyping(name)
      name.onchange = () => void st.author('name', { name: name.value.trim() || st.view.name })
      p.append(el('label', '', 'World name'), name)
      const deco = el('select') as HTMLSelectElement
      deco.innerHTML = `<option value="mods">Only owner + mods can decorate common areas</option><option value="everyone">Everyone can decorate common areas</option>`
      deco.value = st.view.policy.decor
      deco.onchange = () => void st.author('policy', { decor: deco.value })
      const rooms = el('select') as HTMLSelectElement
      rooms.innerHTML = `<option value="open">Anyone with a room link can add their office</option><option value="approval">New offices need owner/mod approval</option><option value="closed">No new offices</option>`
      rooms.value = st.view.policy.rooms
      rooms.onchange = () => void st.author('policy', { rooms: rooms.value })
      p.append(el('label', '', 'Common areas'), deco, el('label', '', 'Offices'), rooms)
    }
    if (st.isMod) {
      const floors = el('button', 'btn small', `Add a floor (now ${st.view.floors})`)
      floors.onclick = () => void st.author('floors', { count: st.view.floors + 1 }).then(() => this.renderPanel())
      const f = this.scene.floor
      const lay = el('button', 'btn small', `Floor ${f + 1}: ${esc(layoutDef(st.view.layouts.get(f) ?? 'building').label)} · change layout…`)
      lay.title = 'Make this floor a starship, submarine, neon apartment, tabletop hall or office building'
      lay.onclick = () => this.onLayouts(f)
      p.append(el('label', '', 'Floors'), lay, floors)
    }
    // network
    this.renderNetwork(p)
    // identity
    p.append(el('label', '', `Your identity key: <code>${shortKey(st.me.pub)}</code>`))
    const exp = el('button', 'btn small', 'Copy key backup')
    exp.onclick = async () => {
      const txt = exportIdentity(st.me)
      try { await navigator.clipboard.writeText(txt); exp.textContent = 'Copied. Keep it private!' } catch { this.showPanelText('Key backup (keep private)', txt) }
    }
    const imp = el('button', 'btn small', 'Restore from backup…')
    const ta = el('textarea') as HTMLTextAreaElement
    ta.placeholder = 'pixel-office-key:…'; ta.rows = 2; ta.classList.add('hidden')
    this.guardTyping(ta)
    imp.onclick = async () => {
      if (ta.classList.contains('hidden')) { ta.classList.remove('hidden'); ta.focus(); return }
      try { await importIdentity(ta.value); location.reload() } catch (e) { imp.textContent = (e as Error).message }
    }
    p.append(el('div', 'hint', 'Your key proves who you are (ownership, mod rights, your offices). Back it up to use it on another browser.'), exp, imp, ta)
  }

  private renderNetwork(p: HTMLElement) {
    const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }
    const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* blocked */ } }
    p.append(el('label', '', 'Network'))
    const relay = el('input') as HTMLInputElement
    relay.placeholder = 'Own relay (wss://…) — empty = public Nostr relays'
    relay.value = read('po:relay', '')
    const turn = read<RTCIceServer[]>('po:turn', [])
    const turnUrl = el('input') as HTMLInputElement, turnUser = el('input') as HTMLInputElement, turnPass = el('input') as HTMLInputElement
    turnUrl.placeholder = 'TURN url (turn:host:3478 or turns:…)'
    turnUser.placeholder = 'TURN username'; turnPass.placeholder = 'TURN credential'; turnPass.type = 'password'
    turnUrl.value = String(turn[0]?.urls ?? ''); turnUser.value = turn[0]?.username ?? ''; turnPass.value = String(turn[0]?.credential ?? '')
    const only = el('label', 'hint')
    const cb = el('input') as HTMLInputElement
    cb.type = 'checkbox'; cb.checked = read('po:relayOnly', false)
    only.append(cb, document.createTextNode(' Relay-only: route everything through TURN so peers never see your IP (needs TURN)'))
    for (const i of [relay, turnUrl, turnUser, turnPass]) this.guardTyping(i)
    const apply = el('button', 'btn small', 'Save and reconnect')
    apply.onclick = () => {
      write('po:relay', relay.value.trim())
      write('po:turn', turnUrl.value.trim() ? [{ urls: turnUrl.value.trim(), username: turnUser.value.trim(), credential: turnPass.value }] : [])
      write('po:relayOnly', cb.checked && !!turnUrl.value.trim())
      location.reload()
    }
    const world = location.hash.match(/w=[a-z0-9]+\.[A-Za-z0-9_-]+/)?.[0] ?? ''
    const cmd = `node anchor/anchor.mjs --invite "#${world}"${relay.value ? ` --relay ${relay.value}` : ''}`
    const anchor = el('div', 'hint', `Keep this world online with an anchor peer (e.g. on a Raspberry Pi):<br><code class="cmd">${esc(cmd)}</code>`)
    p.append(relay, turnUrl, turnUser, turnPass, only, apply, anchor)
  }

  private renderElevator() {
    const s = this.scene
    const e = this.elevEl
    e.classList.toggle('hidden', !s.onElevator)
    if (!s.onElevator) return
    e.innerHTML = ''
    e.append(el('div', 'ptitle', 'Elevator'))
    const row = el('div', 'row')
    for (let i = 0; i < this.state.view.floors; i++) {
      const lay = this.state.view.layouts.get(i)
      const b = el('button', 'btn small' + (i === s.floor ? ' on' : ''), `Floor ${i + 1}${lay ? ` · ${esc(layoutDef(lay).label)}` : ''}`)
      b.onclick = () => s.goFloor(i)
      row.append(b)
    }
    e.append(row)
  }

  // ------------------------------------------------------------------ decorate palette
  private renderTabs() {
    this.tabs.innerHTML = ''
    const close = () => { this.scene.setZoneMode(false); for (const t of this.extraTabs) if (t.id !== this.themeTab) t.onClose?.() }
    for (const [tid, th] of Object.entries(this.manifest.themes)) {
      const b = el('button', 'tab' + (tid === this.themeTab ? ' on' : ''), th.label)
      b.onclick = () => { this.themeTab = tid; close(); this.renderTabs(); this.renderGrid() }
      this.tabs.append(b)
    }
    if (this.scene.canZoneHere) {
      const z = el('button', 'tab zones-tab' + (this.themeTab === 'zones' ? ' on' : ''), 'Call zones')
      z.onclick = () => { this.themeTab = 'zones'; close(); this.scene.setZoneMode(true); this.renderTabs(); this.renderGrid() }
      this.tabs.append(z)
    }
    for (const t of this.extraTabs) {
      if (!t.visible()) continue
      const b = el('button', 'tab zones-tab' + (this.themeTab === t.id ? ' on' : ''), t.label)
      b.onclick = () => { this.themeTab = t.id; close(); t.onOpen?.(); this.renderTabs(); this.renderGrid() }
      this.tabs.append(b)
    }
    this.snapBtn.title = 'Snap furniture to the tile grid (G). Hold Alt to flip it for one placement.'
    this.snapBtn.onclick = () => this.scene.setSnap(!this.scene.snap)
    if (this.themeTab !== 'zones') this.tabs.append(this.snapBtn)
    if (this.manifest.themes[this.themeTab] && this.state.isMod) {
      const use = el('button', 'btn small', 'Use this style for the whole floor')
      use.onclick = () => this.scene.setTheme(this.themeTab)
      this.tabs.append(use)
    }
  }

  private renderZones() {
    this.grid.innerHTML = ''
    this.zoneSig = JSON.stringify(this.scene.zones)
    this.grid.append(el('div', 'zone-help', 'Drag on the floor to draw a call zone. Everyone inside a zone is in one call; walking out leaves it. Office owners can zone their own office.'))
    for (const z of this.scene.zones) {
      const room = (z as any).room as string | undefined
      if (room ? !this.scene.canEditAt(z.x, z.y) : !this.scene.canEditZones) continue
      const row = el('div', 'zone-row')
      const inp = el('input') as HTMLInputElement
      inp.value = z.name
      inp.maxLength = 32
      this.guardTyping(inp)
      inp.onchange = () => this.scene.renameZone(z.id, inp.value.trim())
      const del = el('button', 'btn small', 'Delete')
      del.onclick = () => this.scene.deleteZone(z.id)
      row.append(inp, el('span', 'zsize', `${z.w}×${z.h}`))
      if (!room) {
        const stage = el('label', 'zsize')
        const cb = el('input') as HTMLInputElement
        cb.type = 'checkbox'; cb.checked = !!(z as any).stage
        cb.onchange = () => this.scene.toggleStage(z.id)
        stage.append(cb, document.createTextNode(' Stage'))
        stage.title = 'People on a stage are heard by everyone on this floor who is not in another zone'
        row.append(stage)
      }
      row.append(del)
      this.grid.append(row)
    }
  }

  renderGrid() {
    if (this.themeTab === 'zones') return this.renderZones()
    const extra = this.extraTabs.find((t) => t.id === this.themeTab)
    if (extra) { this.grid.innerHTML = ''; return extra.render(this.grid) }
    this.grid.innerHTML = ''
    for (const it of this.manifest.themes[this.themeTab].items) {
      const b = el('button', 'item' + (this.scene.selectedItem === it.id ? ' on' : ''))
      b.title = it.label
      b.dataset.item = it.id
      const img = el('img') as HTMLImageElement
      img.src = this.thumb(this.themeTab, it.views.S.frame)
      b.append(img, el('span', '', it.label))
      b.onclick = () => this.scene.setBuildItem(this.scene.selectedItem === it.id ? null : it.id)
      this.grid.append(b)
    }
  }

  refresh() {
    const s = this.scene
    const st = this.state
    const role = st.roleOf(st.me.pub)
    this.titleEl.innerHTML = `${esc(st.view.name)} ${role !== 'member' ? `<span class="tag">${role.toUpperCase()}</span>` : ''}`
    const names = s.peerNames()
    this.peersEl.innerHTML = names.length
      ? `<b>${names.length + 1}</b> here: you, ${names.map(esc).join(', ')}`
      : `Just you here. ${this.net.kind === 'p2p' ? 'Send the invite link to a friend.' : 'Open this link in another tab.'}`
    this.bannedEl.classList.toggle('hidden', !st.isBanned)
    const tabSig = [s.canZoneHere, st.isMod, ...this.extraTabs.map((t) => t.visible())].join()
    if (tabSig !== this.tabSig) { this.tabSig = tabSig; this.renderTabs() }
    this.decoBtn.classList.toggle('on', s.decorating)
    this.snapBtn.innerHTML = `${s.snap ? '▦ Snap: on' : '◇ Snap: off'} <kbd>G</kbd>`
    this.snapBtn.classList.toggle('on', s.snap)
    this.palette.classList.toggle('hidden', !s.decorating)
    if (this.themeTab === 'zones' && s.decorating && !s.zoneMode && s.canZoneHere) s.setZoneMode(true)
    if (this.themeTab === 'zones' && s.decorating && JSON.stringify(s.zones) !== this.zoneSig && !this.grid.contains(document.activeElement)) this.renderZones()
    const floorNote = st.view.floors > 1 ? ` · floor ${s.floor + 1}` : ''
    this.status.innerHTML = s.zoneMode
      ? 'Drag to draw a call zone · right-click a zone to delete'
      : s.decorating
        ? s.selectedItem
          ? `Placing <b>${esc(s.defs.get(s.selectedItem)?.label ?? '')}</b> facing <b>${s.facing}</b> · <kbd>R</kbd> rotate · <kbd>G</kbd> ${s.snap ? 'free placement' : 'snap to grid'} (or hold <kbd>Alt</kbd>) · click place · right-click cancel`
          : st.canDecorate() ? 'Pick an item · hover furniture: <kbd>R</kbd> rotate, click move, right-click delete' : 'Only moderators can decorate common areas here. You can decorate your own office.'
        : `<kbd>WASD</kbd> move · walk up to people or into a zone to talk${floorNote}`
    for (const b of this.grid.querySelectorAll<HTMLButtonElement>('.item')) b.classList.toggle('on', b.dataset.item === s.selectedItem)
    this.renderElevator()
    if (this.panelKind === 'people') this.renderPanel()
    const near = s.near
    this.useEl.classList.toggle('hidden', !near || s.decorating || !!document.querySelector('.objpanel:not(.hidden), .codepanel:not(.hidden)'))
    if (near) {
      const label = s.defs.get(near.item)?.label ?? 'object'
      const portal = near.item.endsWith('/portal')
      const coded = !near.item.match(/\/(portal|noteboard|whiteboard|tv)$/)
      this.useEl.innerHTML = coded ? `<kbd>E</kbd> interact` : portal ? (near.cfg?.to ? `Step on the portal to go to <b>${esc(near.cfg.label ?? '')}</b>${near.editable ? ' · <kbd>E</kbd> change' : ''}` : `<kbd>E</kbd> connect portal`) : `<kbd>E</kbd> use ${esc(label)}`
    }
  }
}
