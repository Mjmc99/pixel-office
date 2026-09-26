import type { Rooms, Placement } from '../rooms/rooms'
import type { RoomPackage } from '../rooms/package'
import type { WorldScene } from '../scenes/WorldScene'
import type { WorldState } from '../world/state'
import { buildingPlan, slotAt } from '../world/building'
import { shortKey } from '../world/crypto'
import { el, esc, type Hud } from './hud'

/** "Offices" panel: claim an office, edit/share yours, approve others (mods), and the room-link prompt. */
export class OfficePanel {
  private panel = el('div', 'card panel offices hidden')
  private modal = el('div', 'modal hidden')
  open = false

  constructor(private hud: Hud, private scene: WorldScene, private rooms: Rooms, private state: WorldState, private worldLink: () => string) {
    hud.root.append(this.panel, this.modal)
    rooms.onChange.on(() => this.render())
    state.onChange.on(() => this.render())
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
    } else if (here && !taken) {
      const b = el('button', 'btn', `Claim office ${here.id} (${here.size === 'M' ? 'large' : 'small'})`)
      b.onclick = async () => { b.disabled = true; await this.rooms.claim(here, this.scene.floor, this.scene.deps.me.name) }
      p.append(b)
      if (this.state.view.policy.rooms === 'approval' && !this.state.isMod) p.append(el('div', 'hint', 'A moderator will need to approve it.'))
    } else {
      p.append(el('div', 'hint', 'Walk into an empty office to claim it, or open someone\'s office link to add their office here.'))
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
      const row = el('div', 'row')
      const share = el('button', 'btn small', 'Copy office link') as HTMLButtonElement
      share.title = 'Anyone who opens this link can add your office to their own world'
      share.onclick = async () => this.copy(share, await this.rooms.shareLink(pl, null), 'Copy office link')
      const invite = el('button', 'btn small', 'Invite to my office') as HTMLButtonElement
      invite.title = 'Link to this world that drops people at your office door'
      invite.onclick = async () => this.copy(invite, await this.rooms.shareLink(pl, this.worldLink()), 'Invite to my office')
      const go = el('button', 'btn small', 'Go there')
      go.onclick = () => this.goTo(pl)
      const rm = el('button', 'btn small danger', 'Remove')
      rm.onclick = () => void this.rooms.remove(pl)
      row.append(share, invite, go, rm)
      box.append(el('div', 'sub', `Your office ${pl.slot}${pl.floor ? ` · floor ${pl.floor + 1}` : ''}${pl.pending ? ' · <b>awaiting approval</b>' : ''} · v${pkg?.ver ?? '?'}`), name, style, row)
      box.append(el('div', 'hint', 'Only you can decorate inside it (press B inside your office). Draw call zones in it from Decorate > Call zones.'))
      p.append(box)
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
        row.append(add)
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
