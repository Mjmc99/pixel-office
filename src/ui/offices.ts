import type { Rooms, Placement } from '../rooms/rooms'
import type { RoomPackage } from '../rooms/package'
import type { WorldScene } from '../scenes/WorldScene'
import type { WorldState } from '../world/state'
import { buildingPlan, slotAt, type Slot, type SlotSize } from '../world/building'
import { shortKey } from '../world/crypto'
import { el, esc, type Hud } from './hud'

/** "Offices" panel: claim an office, edit/share yours, approve others (mods), and the room-link prompt. */
export class OfficePanel {
  private panel = el('div', 'card panel offices hidden')
  private modal = el('div', 'modal hidden')
  private pickBar = el('div', 'card pickbar hidden')
  open = false
  onEditCode: (pl: Placement) => void = () => {}

  constructor(private hud: Hud, private scene: WorldScene, private rooms: Rooms, private state: WorldState, private worldLink: () => string) {
    hud.root.append(this.panel, this.modal, this.pickBar)
    rooms.onChange.on(() => this.render())
    state.onChange.on(() => this.render())
    // Decorate > "My office": walls and floor for your own office, one click each
    hud.extraTabs.push({
      id: 'myoffice', label: 'My office',
      visible: () => this.myOfficesHere().length > 0,
      render: (grid) => this.renderStyleTab(grid),
    })
    rooms.onChange.on(() => { if (this.hud.root.querySelector('.palette:not(.hidden) .swatches')) this.hud.renderGrid() })
  }

  /** My active offices on the floor I'm on. */
  private myOfficesHere() {
    return this.rooms.onFloor(this.scene.floor).filter((pl) => pl.owner === this.state.me.pub && !pl.pending && this.rooms.pkgFor(pl))
  }

  /** The office whose style the "My office" tab edits: the one I'm standing in, else my first one on this floor. */
  private styleTarget() {
    const t = this.scene.meTile()
    return this.rooms.myPlacementAt(t.x, t.y, this.scene.floor)?.pl ?? this.myOfficesHere()[0] ?? null
  }

  private renderStyleTab(grid: HTMLElement) {
    const pl = this.styleTarget()
    const pkg = pl && this.rooms.pkgFor(pl)
    if (!pl || !pkg) { grid.append(el('div', 'zone-help', 'You have no office on this floor.')); return }
    const themes = Object.entries(this.scene.deps.manifest.themes)
    const box = el('div', 'swatches')
    box.append(el('div', 'swatch-label', `Walls of <b>${esc(pkg.name)}</b> — only your office changes; everyone picks their own.`))
    const wallSw = (id: string | null, label: string) => {
      const b = el('button', 'swatch' + ((pkg.wallStyle ?? null) === id ? ' on' : ''))
      b.dataset.wall = id ?? 'building'
      const img = el('div', 'wallprev')
      img.style.backgroundImage = `url(${this.hud.thumb(id ?? this.scene.theme, 'wall_tall')})`
      b.append(img, el('span', '', label))
      b.onclick = () => void this.rooms.edit(pl, (c) => { if (id) c.wallStyle = id; else delete c.wallStyle })
      box.append(b)
    }
    wallSw(null, 'Building')
    for (const [id, th] of themes) wallSw(id, th.label)
    box.append(el('div', 'swatch-label', 'Floor'))
    for (const [id, th] of themes) {
      const b = el('button', 'swatch' + (pkg.floorStyle === id ? ' on' : ''))
      b.dataset.floor = id
      const img = el('div', 'floorprev')
      img.style.backgroundImage = `url(${this.hud.thumb(id, 'floor0_0')})`
      b.append(img, el('span', '', th.label))
      b.onclick = () => void this.rooms.edit(pl, (c) => { c.floorStyle = id })
      box.append(b)
    }
    grid.append(box)
  }

  toggle() { this.open = !this.open; this.render() }

  /** Door tile just inside an office, for "go there". */
  private doorOf(pl: Placement) {
    const s = buildingPlan().slots.find((x) => x.id === pl.slot)!
    return { x: s.door.x, y: s.doorSide === 'S' ? s.y + s.h - 1 : s.y }
  }

  goTo(pl: Placement) {
    if (this.scene.floor !== pl.floor) this.scene.goFloor(pl.floor)
    const d = this.doorOf(pl)
    this.scene.teleport(d.x * 16 + 8, d.y * 16 + 10)
  }

  /**
   * Zoom out to the floor map and let the player click where the office goes.
   * `size` null = any free slot (a brand-new office takes the size of the slot).
   */
  pick(title: string, size: SlotSize | null, onPick: (slot: Slot, floor: number) => void | Promise<void>, current: Placement | null = null) {
    const wasOpen = this.open
    this.open = false
    this.render()
    const bar = this.pickBar
    const done = () => { bar.classList.add('hidden'); this.scene.onChange() }
    const draw = () => {
      bar.innerHTML = ''
      bar.append(el('div', 'ptitle', esc(title)))
      const free = this.rooms.freeSlots(this.scene.floor, size ?? undefined).length
      bar.append(el('div', 'hint', free
        ? `Click a <b style="color:#5fd38d">green</b> office to put it there.${size ? ` Only ${size === 'M' ? 'large' : 'small'} offices fit.` : ''}`
        : `No free ${size ? (size === 'M' ? 'large ' : 'small ') : ''}offices on this floor${this.state.view.floors > 1 ? ' — try another floor.' : '. A moderator can add a floor.'}`))
      const row = el('div', 'row')
      const floors = this.state.view.floors
      if (floors > 1) {
        for (let f = 0; f < floors; f++) {
          const n = this.rooms.freeSlots(f, size ?? undefined).length
          const b = el('button', 'btn small' + (f === this.scene.floor ? ' on' : ''), `Floor ${f + 1}${n ? ` · ${n} free` : ''}`)
          b.onclick = () => { this.scene.pickFloor(f); draw() }
          row.append(b)
        }
      }
      const cancel = el('button', 'btn small', 'Cancel <kbd>Esc</kbd>')
      cancel.onclick = () => this.scene.cancelPicking()
      row.append(cancel)
      bar.append(row)
    }
    bar.classList.remove('hidden')
    draw()
    this.scene.startPicking({
      size,
      current: current ? { slot: current.slot, floor: current.floor } : null,
      onPick: async (slot, floor) => { done(); await onPick(slot, floor) },
      onCancel: () => { done(); if (wasOpen) this.toggle() },
    })
  }

  /** Pick a spot for a brand-new office. */
  pickNew() {
    this.pick('Where should your new office go?', null, async (slot, floor) => {
      await this.rooms.claim(slot, floor, this.scene.deps.me.name)
      const pl = this.rooms.placementAt(slot.id, floor)
      if (pl) this.goTo(pl)
    })
  }

  /** Pick a new spot for one of my placed offices. */
  pickMove(pl: Placement) {
    const pkg = this.rooms.pkgFor(pl)
    this.pick(`Move “${pkg?.name ?? pl.name}”`, pl.size, async (slot, floor) => {
      await this.rooms.move(pl, slot, floor)
      const moved = this.rooms.placementAt(slot.id, floor)
      if (moved) this.goTo(moved)
    }, pl)
  }

  /** Pick a spot for an office package (from a link, or one of mine not placed here yet). */
  pickPackage(pkg: RoomPackage) {
    this.pick(`Place “${pkg.name}”`, pkg.size, async (slot, floor) => {
      await this.rooms.place(pkg, slot, floor)
      const pl = this.rooms.findPlaced(pkg)
      if (pl) this.goTo(pl)
    })
  }

  private async copy(btn: HTMLButtonElement, text: string | null, label: string) {
    if (!text) return
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied!' } catch { prompt(label, text) }
    setTimeout(() => (btn.textContent = label), 1500)
  }

  render() {
    const p = this.panel
    p.classList.toggle('hidden', !this.open)
    if (!this.open) return
    // don't wipe an input the user is typing in
    if (p.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) return
    p.innerHTML = ''
    p.append(el('div', 'ptitle', 'Offices'))
    const me = this.state.me.pub
    const t = this.scene.meTile()
    const here = slotAt(buildingPlan(), t.x, t.y)
    const taken = here && this.rooms.placementAt(here.id, this.scene.floor)

    if (!this.rooms.canPlace()) {
      p.append(el('div', 'hint', 'This world is closed to new offices.'))
    } else {
      const row = el('div', 'row')
      const pickB = el('button', 'btn', '＋ New office: pick a spot')
      pickB.title = 'Shows the floor map; click any free office'
      pickB.onclick = () => this.pickNew()
      row.append(pickB)
      if (here && !taken) {
        const b = el('button', 'btn', `Claim ${here.id} (where I'm standing)`)
        b.onclick = async () => { b.disabled = true; await this.rooms.claim(here, this.scene.floor, this.scene.deps.me.name) }
        row.append(b)
      }
      p.append(row)
      if (this.state.view.policy.rooms === 'approval' && !this.state.isMod) p.append(el('div', 'hint', 'A moderator will need to approve new offices.'))
    }

    const mine = this.rooms.mine()
    for (const pl of mine) {
      const pkg = this.rooms.pkgFor(pl)
      const box = el('div', 'office')
      const name = el('input') as HTMLInputElement
      name.value = pkg?.name ?? pl.name
      name.maxLength = 40
      this.hud.guardTyping(name)
      name.onchange = () => void this.rooms.edit(pl, (c) => { c.name = name.value.trim() || c.name })
      const style = el('select') as HTMLSelectElement
      for (const [id, th] of Object.entries(this.scene.deps.manifest.themes)) style.append(new Option(`${th.label} floor`, id))
      style.value = pkg?.floorStyle ?? 'office'
      style.onchange = () => void this.rooms.edit(pl, (c) => { c.floorStyle = style.value })
      const walls = el('select') as HTMLSelectElement
      walls.append(new Option('Building walls', ''))
      for (const [id, th] of Object.entries(this.scene.deps.manifest.themes)) walls.append(new Option(`${th.label} walls`, id))
      walls.value = pkg?.wallStyle ?? ''
      walls.onchange = () => void this.rooms.edit(pl, (c) => { if (walls.value) c.wallStyle = walls.value; else delete c.wallStyle })
      const styles = el('div', 'row')
      styles.append(style, walls)
      const row = el('div', 'row')
      const share = el('button', 'btn small', 'Copy office link') as HTMLButtonElement
      share.title = 'Anyone who opens this link can add your office to their own world'
      share.onclick = async () => this.copy(share, await this.rooms.shareLink(pl, null), 'Copy office link')
      const invite = el('button', 'btn small', 'Invite to my office') as HTMLButtonElement
      invite.title = 'Link to this world that drops people at your office door'
      invite.onclick = async () => this.copy(invite, await this.rooms.shareLink(pl, this.worldLink()), 'Invite to my office')
      const go = el('button', 'btn small', 'Go there')
      go.onclick = () => this.goTo(pl)
      const mv = el('button', 'btn small', 'Move…')
      mv.title = 'Pick a different free office on the map; everything inside comes with it'
      mv.onclick = () => this.pickMove(pl)
      const rm = el('button', 'btn small danger', 'Remove')
      rm.onclick = () => void this.rooms.remove(pl)
      const code = el('button', 'btn small', pkg?.code ? 'Office code ✓' : 'Office code…')
      code.onclick = () => this.onEditCode(pl)
      row.append(go, mv, share, invite, code, rm)
      box.append(el('div', 'sub', `Your office ${pl.slot}${pl.floor ? ` · floor ${pl.floor + 1}` : ''}${pl.pending ? ' · <b>awaiting approval</b>' : ''} · v${pkg?.ver ?? '?'}`), name, styles, row)
      box.append(el('div', 'hint', 'Only you can decorate inside it (press B inside your office). Draw call zones in it from Decorate > Call zones.'))
      p.append(box)
    }

    // offices I own that aren't in this world (removed, or made in another world)
    const spare = this.rooms.myUnplaced()
    if (spare.length && this.rooms.canPlace()) {
      p.append(el('label', '', 'Your other offices'))
      for (const pkg of spare) {
        const r = el('div', 'prow')
        r.append(el('span', '', `${esc(pkg.name)} <i>${pkg.size === 'M' ? 'large' : 'small'} · not in this world</i>`))
        const put = el('button', 'btn small', 'Place here…')
        put.onclick = () => this.pickPackage(pkg)
        r.append(put)
        p.append(r)
      }
    }

    const others = this.rooms.list().filter((pl) => pl.owner !== me)
    if (others.length) {
      p.append(el('label', '', 'Other offices'))
      for (const pl of others) {
        const pkg = this.rooms.pkgFor(pl)
        const r = el('div', 'prow')
        r.append(el('span', '', `${esc(pkg?.name ?? pl.name)} <i>${pl.slot}${pl.floor ? ` · floor ${pl.floor + 1}` : ''} · ${esc(pkg?.ownerName ?? shortKey(pl.owner))}${pl.pending ? ' · pending' : ''}</i>`))
        const go = el('button', 'btn small', 'Go')
        go.onclick = () => this.goTo(pl)
        r.append(go)
        if (this.state.isMod && pl.pending) {
          const ok = el('button', 'btn small', 'Approve')
          ok.onclick = () => void this.rooms.approve(pl)
          r.append(ok)
        }
        if (this.state.isMod) {
          const rm = el('button', 'btn small danger', 'Remove')
          rm.onclick = () => void this.rooms.remove(pl)
          r.append(rm)
        }
        p.append(r)
      }
    }
  }

  /** Someone opened an office link: offer to add that office to this world. */
  async prompt(pkg: RoomPackage) {
    const m = this.modal
    m.innerHTML = ''
    m.classList.remove('hidden')
    const box = el('div', 'card')
    const close = () => { m.classList.add('hidden'); history.replaceState(null, '', location.href.replace(/&?r=[A-Za-z0-9_-]+/, '')) }
    const placed = this.rooms.findPlaced(pkg)
    box.append(el('div', 'ptitle', esc(pkg.name)), el('div', 'sub', `An office by ${esc(pkg.ownerName)} <code>${shortKey(pkg.owner)}</code> · ${pkg.size === 'M' ? 'large' : 'small'} · ${pkg.things.length} pieces`))
    const row = el('div', 'row')
    if (placed) {
      const go = el('button', 'btn', 'Go to this office')
      go.onclick = () => { this.goTo(placed); close() }
      row.append(go)
    } else {
      const slot = this.rooms.freeSlot(pkg.size, this.scene.floor) ?? [...Array(this.state.view.floors).keys()].map((f) => this.rooms.freeSlot(pkg.size, f)).find(Boolean) ?? null
      if (!this.rooms.canPlace()) row.append(el('div', 'hint', 'This world is closed to new offices.'))
      else if (!slot) row.append(el('div', 'hint', `No free ${pkg.size === 'M' ? 'large' : 'small'} office here. A moderator can add a floor.`))
      else {
        const floor = [...Array(this.state.view.floors).keys()].find((f) => this.rooms.freeSlot(pkg.size, f)?.id === slot.id && !this.rooms.placementAt(slot.id, f)) ?? 0
        const add = el('button', 'btn', `Add it as office ${slot.id}${floor ? ` on floor ${floor + 1}` : ''}`)
        add.onclick = async () => {
          add.setAttribute('disabled', '')
          await this.rooms.place(pkg, slot, floor)
          const pl = this.rooms.findPlaced(pkg)
          if (pl) this.goTo(pl)
          close()
        }
        const choose = el('button', 'btn', 'Choose a spot…')
        choose.onclick = () => { close(); this.pickPackage(pkg) }
        row.append(add, choose)
        if (this.state.view.policy.rooms === 'approval' && !this.state.isMod) row.append(el('div', 'hint', 'Needs approval from a moderator.'))
      }
    }
    const no = el('button', 'btn', 'Not now')
    no.onclick = close
    row.append(no)
    box.append(row)
    m.append(box)
  }
}
