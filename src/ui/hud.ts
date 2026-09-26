import type { Transport } from '../net/transport'
import type { WorldScene } from '../scenes/WorldScene'
import type { Call } from '../media/call'
import { Tiles } from './tiles'
import type { Manifest } from '../world/types'

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}

/** DOM overlay: world card, identity, decorate palette, chat. */
export class Hud {
  private root = document.getElementById('hud')!
  private scene!: WorldScene
  private peersEl = el('div', 'peers')
  private palette = el('div', 'palette hidden')
  private grid = el('div', 'grid')
  private tabs = el('div', 'tabs')
  private status = el('div', 'status')
  private decoBtn = el('button', 'btn', 'Decorate <kbd>B</kbd>')
  private chatIn = el('input', 'chat') as HTMLInputElement
  private micBtn = el('button', 'btn media', 'Mic off <kbd>M</kbd>')
  private camBtn = el('button', 'btn media', 'Cam off <kbd>V</kbd>')
  private zoneEl = el('div', 'zone hidden')
  private errEl = el('div', 'err hidden')
  private tiles?: Tiles
  private themeTab = 'office'
  private thumbs = new Map<string, string>()

  constructor(private manifest: Manifest, private net: Transport, private world: { id: string }, private call: Call) {}

  attach(scene: WorldScene, onMe: (name: string, avatar: string) => void) {
    this.scene = scene
    this.themeTab = scene.theme

    // ---- world card
    const card = el('div', 'card world')
    card.append(el('div', 'title', `Pixel Office <span class="tag">${this.net.kind === 'p2p' ? 'P2P' : 'LOCAL'}</span>`))
    card.append(el('div', 'sub', `World <code>${this.world.id}</code>`))
    const invite = el('button', 'btn small', 'Copy invite link')
    invite.onclick = async () => {
      try { await navigator.clipboard.writeText(location.href); invite.textContent = 'Copied!' } catch { prompt('Invite link:', location.href) }
      setTimeout(() => (invite.textContent = 'Copy invite link'), 1500)
    }
    card.append(this.peersEl, invite)
    this.root.append(card)

    // ---- identity card
    const idc = el('div', 'card me')
    const nameIn = el('input', 'name') as HTMLInputElement
    nameIn.value = scene.deps.me.name
    nameIn.maxLength = 24
    const presets = this.manifest.avatars.presets
    let ai = Math.max(0, presets.findIndex((p) => p.id === scene.deps.me.avatar))
    const face = el('img', 'face') as HTMLImageElement
    const prev = el('button', 'btn small', '&lsaquo;'), next = el('button', 'btn small', '&rsaquo;')
    const apply = () => {
      face.src = this.thumb('avatars', `${presets[ai].id}_S_0`)
      onMe(nameIn.value.trim() || 'Guest', presets[ai].id)
    }
    prev.onclick = () => { ai = (ai + presets.length - 1) % presets.length; apply() }
    next.onclick = () => { ai = (ai + 1) % presets.length; apply() }
    nameIn.onchange = apply
    this.guardTyping(nameIn)
    idc.append(prev, face, next, nameIn)
    this.root.append(idc)
    face.src = this.thumb('avatars', `${presets[ai].id}_S_0`)

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
    const avatarUrl = (preset: string) => this.thumb('avatars', `${preset}_S_0`)
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

  private refreshMedia() {
    const d = this.call.devices
    this.micBtn.innerHTML = `${d.micOn ? 'Mic on' : 'Mic off'} <kbd>M</kbd>`
    this.camBtn.innerHTML = `${d.camOn ? 'Cam on' : 'Cam off'} <kbd>V</kbd>`
    this.micBtn.classList.toggle('live', d.micOn)
    this.camBtn.classList.toggle('live', d.camOn)
    this.errEl.textContent = d.error
    this.errEl.classList.toggle('hidden', !d.error)
  }

  private guardTyping(inp: HTMLInputElement) {
    inp.addEventListener('focus', () => (this.scene.typing = true))
    inp.addEventListener('blur', () => (this.scene.typing = false))
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur() })
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
  private thumb(key: string, frame: string) {
    const k = key + ':' + frame
    if (!this.thumbs.has(k)) this.thumbs.set(k, this.scene.textures.getBase64(key, frame) as string)
    return this.thumbs.get(k)!
  }

  private zoneSig = ''

  private renderTabs() {
    this.tabs.innerHTML = ''
    for (const [tid, th] of Object.entries(this.manifest.themes)) {
      const b = el('button', 'tab' + (tid === this.themeTab ? ' on' : ''), th.label)
      b.onclick = () => { this.themeTab = tid; this.scene.setZoneMode(false); this.renderTabs(); this.renderGrid() }
      this.tabs.append(b)
    }
    if (this.scene.isOwner) {
      const z = el('button', 'tab zones-tab' + (this.themeTab === 'zones' ? ' on' : ''), 'Call zones')
      z.onclick = () => { this.themeTab = 'zones'; this.scene.setZoneMode(true); this.renderTabs(); this.renderGrid() }
      this.tabs.append(z)
    }
    if (this.themeTab !== 'zones') {
      const use = el('button', 'btn small', 'Use this style for walls + floor')
      use.onclick = () => this.scene.setTheme(this.themeTab)
      this.tabs.append(use)
    }
  }

  private renderZones() {
    this.grid.innerHTML = ''
    this.zoneSig = JSON.stringify(this.scene.zones)
    const help = el('div', 'zone-help', 'Drag on the floor to draw a call zone. Everyone inside a zone is in one call; walking out leaves it. Right-click a zone to delete it.')
    this.grid.append(help)
    for (const z of this.scene.zones) {
      const row = el('div', 'zone-row')
      const inp = el('input') as HTMLInputElement
      inp.value = z.name
      inp.maxLength = 32
      this.guardTyping(inp)
      inp.onchange = () => this.scene.renameZone(z.id, inp.value.trim())
      const del = el('button', 'btn small', 'Delete')
      del.onclick = () => this.scene.deleteZone(z.id)
      row.append(inp, el('span', 'zsize', `${z.w}×${z.h}`), del)
      this.grid.append(row)
    }
  }

  private renderGrid() {
    if (this.themeTab === 'zones') return this.renderZones()
    this.grid.innerHTML = ''
    for (const it of this.manifest.themes[this.themeTab].items) {
      const b = el('button', 'item' + (this.scene.selectedItem === it.id ? ' on' : ''))
      b.title = it.label
      const img = el('img') as HTMLImageElement
      img.src = this.thumb(this.themeTab, it.views.S.frame)
      b.append(img, el('span', '', it.label))
      b.onclick = () => this.scene.setBuildItem(this.scene.selectedItem === it.id ? null : it.id)
      this.grid.append(b)
    }
  }

  private refresh() {
    const s = this.scene
    const names = s.peerNames()
    this.peersEl.innerHTML = names.length
      ? `<b>${names.length + 1}</b> here: you, ${names.map(esc).join(', ')}`
      : `Just you here. ${this.net.kind === 'p2p' ? 'Send the invite link to a friend.' : 'Open this link in another tab.'}`
    this.decoBtn.classList.toggle('on', s.decorating)
    this.palette.classList.toggle('hidden', !s.decorating)
    if (this.themeTab === 'zones' && s.decorating && !s.zoneMode && s.isOwner) s.setZoneMode(true)
    if (this.themeTab === 'zones' && s.decorating && JSON.stringify(s.zones) !== this.zoneSig && !this.grid.contains(document.activeElement)) this.renderZones()
    this.status.innerHTML = s.zoneMode
      ? 'Drag to draw a call zone · right-click a zone to delete'
      : s.decorating
      ? s.selectedItem
        ? `Placing <b>${esc(s.defs.get(s.selectedItem)?.label ?? '')}</b> facing <b>${s.facing}</b> · <kbd>R</kbd> rotate · click place · right-click cancel`
        : 'Pick an item below · hover furniture: <kbd>R</kbd> rotate, click move, right-click delete'
      : '<kbd>WASD</kbd> move · walk up to people or into a zone to talk'
    for (const b of this.grid.querySelectorAll<HTMLButtonElement>('.item')) {
      b.classList.toggle('on', b.title === s.defs.get(s.selectedItem ?? '')?.label && s.selectedItem?.startsWith(this.themeTab + '/') === true)
    }
  }
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
