import type { WorldScene } from '../scenes/WorldScene'
import type { WorldState } from '../world/state'
import { FLOOR, planFor, regionAt, tileAt, type LayoutId } from '../world/building'
import { LAYOUTS, layoutDef, layoutOps } from '../world/layouts'
import { el, esc, type Hud } from './hud'

const TILE = 16

/** "Floor layout" chooser: owner and mods pick what a floor is (building, starship, submarine, apartment, tabletop hall). */
export class LayoutPicker {
  private modal = el('div', 'modal hidden layouts-modal')
  private floor = 0

  constructor(private hud: Hud, private scene: WorldScene, private state: WorldState) {
    hud.root.append(this.modal)
    this.modal.onclick = (e) => { if (e.target === this.modal) this.close() }
  }

  /** Layout of a floor. */
  layoutOf(floor: number) { return (this.state.view.layouts.get(floor) ?? 'building') as LayoutId }

  close() { this.modal.classList.add('hidden'); this.scene.typing = false }

  open(floor = this.scene.floor) {
    this.floor = floor
    this.scene.typing = true // keep WASD from walking while the chooser is up
    this.render()
    this.modal.classList.remove('hidden')
  }

  private render(confirm: LayoutId | null = null) {
    const m = this.modal
    m.innerHTML = ''
    const box = el('div', 'card')
    const cur = this.layoutOf(this.floor)
    box.append(el('div', 'ptitle', `Floor ${this.floor + 1} layout`))
    if (confirm) {
      const def = layoutDef(confirm)
      const onFloor = [...this.state.view.decor.values()].filter((d) => d.floor === this.floor).length
      box.append(this.map(confirm, 3))
      box.append(el('div', 'sub', `Turn floor ${this.floor + 1} into <b>${esc(def.label)}</b>?`))
      box.append(el('div', 'hint', `Its ${onFloor} pieces of common-area furniture and its call zones are replaced with the ${esc(def.label.toLowerCase())} set.
        Offices that don't fit the new floor leave it; their owners can put them back from Offices &gt; Your other offices.
        Everyone on this floor is moved to its entrance.`))
      const row = el('div', 'row')
      const yes = el('button', 'btn on', `Make it a ${esc(def.label.toLowerCase())}`) as HTMLButtonElement
      yes.onclick = async () => {
        yes.disabled = true
        await this.state.authorMany(layoutOps(confirm, this.floor))
        if (this.scene.floor !== this.floor) this.scene.goFloor(this.floor)
        this.close()
        this.hud.refresh()
      }
      const back = el('button', 'btn', 'Back')
      back.onclick = () => this.render()
      row.append(yes, back)
      box.append(row)
      m.append(box)
      return
    }
    box.append(el('div', 'hint', 'Each floor can be its own place. Picking a layout reshapes this floor and furnishes it; offices on it become cabins, bunks or bedrooms where the layout has them.'))
    const grid = el('div', 'layout-grid')
    for (const def of LAYOUTS) {
      const b = el('button', 'layout-card' + (def.id === cur ? ' on' : '')) as HTMLButtonElement
      b.dataset.layout = def.id
      b.append(this.map(def.id, 2), el('b', '', esc(def.label)), el('span', 'hint', esc(def.blurb)), el('span', 'tag', esc(def.offices)))
      if (def.id === cur) b.append(el('span', 'hint', '(this floor now; pick again to reset its furniture)'))
      b.onclick = () => this.render(def.id)
      grid.append(b)
    }
    box.append(grid)
    const floors = el('div', 'row')
    if (this.state.view.floors > 1) {
      for (let f = 0; f < this.state.view.floors; f++) {
        const fb = el('button', 'btn small' + (f === this.floor ? ' on' : ''), `Floor ${f + 1} · ${esc(layoutDef(this.layoutOf(f)).label)}`)
        fb.onclick = () => { this.floor = f; this.render() }
        floors.append(fb)
      }
    }
    const close = el('button', 'btn small', 'Close')
    close.onclick = () => this.close()
    floors.append(close)
    box.append(floors)
    m.append(box)
  }

  /** A little map of a layout, drawn with its real floor tiles. */
  private map(id: LayoutId, px: number) {
    const plan = planFor(id)
    const c = document.createElement('canvas')
    c.width = plan.w * px; c.height = plan.h * px
    c.className = 'layout-map'
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.fillStyle = '#141319'; g.fillRect(0, 0, c.width, c.height)
    const tex = this.scene.textures
    const floorOf = (style?: string): [string, string] => {
      const m = style?.match(/^([a-z]+):(\d)$/)
      if (m) return [m[1], `floor${m[2]}_0`]
      return ({ lounge: ['cabin', 'floor0_0'], lobby: ['zen', 'floor0_0'], cafe: ['office', 'floor0_0'], library: ['cabin', 'floor1_0'], empty: ['zen', 'floor1_0'] } as Record<string, [string, string]>)[style ?? ''] ?? ['office', 'floor1_0']
    }
    for (let y = 0; y < plan.h; y++) {
      for (let x = 0; x < plan.w; x++) {
        if (tileAt(plan, x, y) !== FLOOR) {
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileAt(plan, x + dx, y + dy) === FLOOR)
          if (near) { g.fillStyle = '#3a3646'; g.fillRect(x * px, y * px, px, px) }
          continue
        }
        const [atlas, frame] = floorOf(regionAt(plan, x, y)?.style ?? plan.floorStyle)
        const f = tex.exists(atlas) ? tex.getFrame(atlas, frame) : null
        if (f) g.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, TILE, TILE, x * px, y * px, px, px)
      }
    }
    g.strokeStyle = '#5fd38d'; g.lineWidth = 1
    for (const s of plan.slots) g.strokeRect(s.x * px + .5, s.y * px + .5, s.w * px - 1, s.h * px - 1)
    g.fillStyle = '#f2c14e'
    g.fillRect(plan.elevator.x * px, plan.elevator.y * px, plan.elevator.w * px, plan.elevator.h * px)
    return c
  }
}
