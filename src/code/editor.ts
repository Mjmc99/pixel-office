import type { Rooms, Placement } from '../rooms/rooms'
import { el, esc, type Hud } from '../ui/hud'
import { ALL_PERMS, safeDomains, type Perm, type RoomCode } from './host'
import type { CodeRunner } from './runner'
import { SAMPLES } from './samples'

export const MAX_CODE = 64_000

/** Owner-only editor for an office's code (source, permissions, website list, live log). */
export class CodeEditor {
  private modal = el('div', 'modal hidden')

  constructor(private hud: Hud, private rooms: Rooms, private runner: CodeRunner) {
    hud.root.append(this.modal)
  }

  open(pl: Placement) {
    const pkg = this.rooms.pkgFor(pl)
    if (!pkg) return
    const code: RoomCode = pkg.code ?? { src: '', perms: [] }
    const m = this.modal
    m.innerHTML = ''
    m.classList.remove('hidden')
    const box = el('div', 'card codeeditor')
    const tpl = el('select') as HTMLSelectElement
    tpl.append(new Option('Start from a sample…', ''))
    for (const s of SAMPLES) tpl.append(new Option(s.label, s.id))
    const ta = el('textarea', 'code') as HTMLTextAreaElement
    ta.value = code.src
    ta.spellcheck = false
    ta.rows = 18
    this.hud.guardTyping(ta)
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end') }
    })
    const perms = el('div', 'permlist')
    const boxes = new Map<Perm, HTMLInputElement>()
    for (const p of ALL_PERMS) {
      const lab = el('label', p.risky ? 'risky' : '')
      const cb = el('input') as HTMLInputElement
      cb.type = 'checkbox'; cb.checked = code.perms.includes(p.id)
      boxes.set(p.id, cb)
      lab.append(cb, document.createTextNode(' ' + p.label))
      perms.append(lab)
    }
    const domains = el('input') as HTMLInputElement
    domains.placeholder = 'Websites for embed/network, comma separated (e.g. youtube.com)'
    domains.value = (code.domains ?? []).join(', ')
    this.hud.guardTyping(domains)
    tpl.onchange = () => {
      const s = SAMPLES.find((x) => x.id === tpl.value)
      if (!s) return
      ta.value = s.code.src
      for (const [id, cb] of boxes) cb.checked = s.code.perms.includes(id)
    }
    const log = el('pre', 'codelog')
    const renderLog = () => { log.textContent = this.runner.logs.slice(-12).map((l) => `${l.kind === 'log' ? '' : l.kind.toUpperCase() + ': '}${l.text}`).join('\n') || 'Output from console.log / room.log shows here.' }
    renderLog()
    this.runner.onLog = renderLog
    const err = el('div', 'hint')
    const save = el('button', 'btn', 'Save & sign'), clear = el('button', 'btn danger', 'Remove code'), close = el('button', 'btn', 'Close')
    save.onclick = async () => {
      if (ta.value.length > MAX_CODE) { err.textContent = `Code is too long (${ta.value.length} / ${MAX_CODE} characters).`; return }
      const next: RoomCode = { src: ta.value, perms: [...boxes].filter(([, cb]) => cb.checked).map(([id]) => id), domains: safeDomains(domains.value.split(',')) }
      await this.rooms.edit(pl, (c) => { c.code = next.src.trim() ? next : null })
      err.textContent = 'Saved. Walk into your office to run it (it restarts automatically).'
    }
    clear.onclick = async () => { await this.rooms.edit(pl, (c) => { c.code = null }); ta.value = '' }
    close.onclick = () => { m.classList.add('hidden'); this.runner.onLog = () => {} }
    const row = el('div', 'row'); row.append(save, clear, close)
    box.append(
      el('div', 'ptitle', `Office code · ${esc(pkg.name)}`),
      el('div', 'hint', 'Runs in each visitor\'s browser inside a sandbox, after they agree. Use the <code>room</code> API: room.on(\'enter\'|\'interact\'|\'message\'|\'state\'|\'panel\'), room.state, room.broadcast, room.sprites, room.ui, room.isHost().'),
      tpl, ta, el('label', '', 'Permissions visitors will be asked for'), perms, domains, row, err, log,
    )
    m.append(box)
  }
}
