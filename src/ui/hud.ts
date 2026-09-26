import type { Transport } from '../net/transport'
import type { WorldScene } from '../scenes/WorldScene'
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
  private themeTab = 'office'
  private thumbs = new Map<string, string>()

  constructor(private manifest: Manifest, private net: Transport, private world: { id: string }) {}

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
    this.decoBtn.onclick = () => scene.setDecorating(!scene.decorating)
    const chatBtn = el('button', 'btn', 'Chat <kbd>Enter</kbd>')
    chatBtn.onclick = () => this.openChat()
    bar.append(this.decoBtn, chatBtn, this.status)
    this.root.append(bar)

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

  private renderTabs() {
    this.tabs.innerHTML = ''
    for (const [tid, th] of Object.entries(this.manifest.themes)) {
      const b = el('button', 'tab' + (tid === this.themeTab ? ' on' : ''), th.label)
      b.onclick = () => { this.themeTab = tid; this.renderTabs(); this.renderGrid() }
      this.tabs.append(b)
    }
    const use = el('button', 'btn small', 'Use this style for walls + floor')
    use.onclick = () => this.scene.setTheme(this.themeTab)
    this.tabs.append(use)
  }

  private renderGrid() {
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
    this.status.innerHTML = s.decorating
      ? s.selectedItem
        ? `Placing <b>${esc(s.defs.get(s.selectedItem)?.label ?? '')}</b> facing <b>${s.facing}</b> · <kbd>R</kbd> rotate · click place · right-click cancel`
        : 'Pick an item below · hover furniture: <kbd>R</kbd> rotate, click move, right-click delete'
      : '<kbd>WASD</kbd> move'
    for (const b of this.grid.querySelectorAll<HTMLButtonElement>('.item')) {
      b.classList.toggle('on', b.title === s.defs.get(s.selectedItem ?? '')?.label && s.selectedItem?.startsWith(this.themeTab + '/') === true)
    }
  }
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
