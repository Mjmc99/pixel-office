import type { Rooms } from '../rooms/rooms'
import type { WorldScene } from '../scenes/WorldScene'
import type { WorldState } from '../world/state'
import type { CustomAsset } from '../world/types'
import { el, esc, type Hud } from '../ui/hud'

export const MAX_ASSET_BYTES = 30_000

/**
 * "Custom" palette tab: your imported sprites + an importer.
 * A sprite is a PNG with either 1 frame (used for every facing) or 4 frames
 * side by side in S, E, N, W order — the same layout the built-in assets use,
 * so an Aseprite export with 4 frames drops straight in.
 */
export class Importer {
  private modal = el('div', 'modal hidden')

  constructor(private hud: Hud, private scene: WorldScene, private state: WorldState, private rooms: Rooms) {
    hud.root.append(this.modal)
    hud.extraTabs.push({
      id: 'custom', label: 'Custom',
      visible: () => true,
      render: (grid) => this.render(grid),
    })
  }

  /** Where would an import go? My office if I'm standing in it, else the world (mods). */
  private target() {
    const t = this.scene.meTile()
    const mine = this.rooms.myPlacementAt(t.x, t.y, this.scene.floor)
    if (mine) return { kind: 'office' as const, label: `your office (${this.rooms.pkgFor(mine.pl)?.name})`, pl: mine.pl }
    if (this.state.isMod) return { kind: 'world' as const, label: 'this world (common areas)' }
    return null
  }

  private render(grid: HTMLElement) {
    const assets = this.scene.customAssets(this.scene.floor)
    const imp = el('button', 'item import')
    imp.innerHTML = '<span class="plus">+</span><span>Import PNG…</span>'
    imp.onclick = () => this.pick()
    grid.append(imp)
    for (const a of assets) {
      const def = this.scene.defs.get('custom/' + a.id)
      const b = el('button', 'item' + (this.scene.selectedItem === 'custom/' + a.id ? ' on' : ''))
      b.title = a.name
      b.dataset.item = 'custom/' + a.id
      const img = el('img') as HTMLImageElement
      img.src = a.png
      if (a.frames === 4) img.style.objectPosition = 'left bottom'
      b.append(img, el('span', '', esc(a.name)))
      b.onclick = () => def && this.scene.setBuildItem(this.scene.selectedItem === def.id ? null : def.id)
      grid.append(b)
    }
    if (!assets.length) grid.append(el('div', 'zone-help', 'Import your own pixel art: a PNG with 1 frame, or 4 frames side by side (south, east, north, west). Up to 30 KB each.'))
  }

  private pick() {
    const target = this.target()
    if (!target) { this.message('Stand inside your own office to import sprites for it. Moderators can also import sprites for the common areas.'); return }
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/png'
    input.onchange = () => { const f = input.files?.[0]; if (f) void this.configure(f, target) }
    input.click()
  }

  private message(text: string) {
    this.modal.innerHTML = ''
    this.modal.classList.remove('hidden')
    const box = el('div', 'card')
    const ok = el('button', 'btn', 'OK')
    ok.onclick = () => this.modal.classList.add('hidden')
    box.append(el('div', 'sub', esc(text)), ok)
    this.modal.append(box)
  }

  /** Validate + save an asset (also used by tests with a data URL). */
  async save(png: string, opts: { name: string; frames: 1 | 4; w: number; d: number }) {
    if (!png.startsWith('data:image/png') || png.length > MAX_ASSET_BYTES * 1.37) throw new Error('PNG too large (30 KB max).')
    const asset: CustomAsset = { id: Math.random().toString(36).slice(2, 10), name: opts.name.slice(0, 32) || 'Custom', frames: opts.frames, w: opts.w, d: opts.d, png }
    const target = this.target()
    if (!target) throw new Error('Nowhere to save this sprite.')
    if (target.kind === 'office') await this.rooms.addAsset(target.pl, asset)
    else await this.state.author('asset.set', asset)
    return asset
  }

  private async configure(file: File, target: NonNullable<ReturnType<Importer['target']>>) {
    const png = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file) })
    const img = new Image()
    await new Promise((res) => { img.onload = res; img.src = png })
    this.modal.innerHTML = ''
    this.modal.classList.remove('hidden')
    const box = el('div', 'card')
    const preview = el('img', 'import-preview') as HTMLImageElement
    preview.src = png
    const name = el('input') as HTMLInputElement
    name.value = file.name.replace(/\.png$/i, '').slice(0, 32)
    this.hud.guardTyping(name)
    const frames = el('select') as HTMLSelectElement
    frames.append(new Option('1 frame (same from every side)', '1'), new Option('4 frames: S, E, N, W side by side', '4'))
    frames.value = img.width >= img.height * 3 ? '4' : '1'
    const w = el('select') as HTMLSelectElement, d = el('select') as HTMLSelectElement
    for (const n of [1, 2, 3, 4]) { w.append(new Option(`${n} wide`, String(n))); d.append(new Option(`${n} deep`, String(n))) }
    const fw = frames.value === '4' ? img.width / 4 : img.width
    w.value = String(Math.max(1, Math.min(4, Math.round(fw / 16))))
    const err = el('div', 'hint')
    const save = el('button', 'btn', 'Save sprite'), cancel = el('button', 'btn', 'Cancel')
    cancel.onclick = () => this.modal.classList.add('hidden')
    save.onclick = async () => {
      try {
        await this.save(png, { name: name.value, frames: Number(frames.value) as 1 | 4, w: Number(w.value), d: Number(d.value) })
        this.modal.classList.add('hidden')
        this.hud.renderGrid()
      } catch (e) { err.textContent = (e as Error).message }
    }
    const row = el('div', 'row'); row.append(w, d)
    const row2 = el('div', 'row'); row2.append(save, cancel)
    box.append(el('div', 'ptitle', 'Import sprite'), el('div', 'sub', `${img.width}×${img.height}px · ${(png.length / 1370).toFixed(1)} KB · saving to ${esc(target.label)}`),
      preview, el('label', '', 'Name'), name, el('label', '', 'Frames'), frames, el('label', '', 'Footprint in tiles'), row, err, row2)
    this.modal.append(box)
  }
}
