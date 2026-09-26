import { Emitter, type Transport } from '../net/transport'
import { DEFAULT_ICE, MediaMesh } from '../media/mesh'
import { zoneAt, type Zone } from '../media/proximity'
import type * as Y from 'yjs'

const T = 16
export const SCREEN_RANGE = 8 * T

/**
 * Screen sharing onto TVs. Uses its own media mesh (separate from voice/video),
 * so a shared tab never replaces your camera. The sharer connects to everyone
 * "at" the TV: in the TV's call zone, or within ~8 tiles of it when it isn't in a zone.
 */
export class Screens {
  readonly mesh: MediaMesh
  readonly onChange = new Emitter<[]>()
  readonly streams = new Map<string, MediaStream>()
  sharing: { tvId: string; stream: MediaStream } | null = null

  constructor(private net: Transport, turn: RTCIceServer[] = [], relayOnly = false) {
    this.mesh = new MediaMesh(net, turn.length ? [...DEFAULT_ICE, ...turn] : DEFAULT_ICE, relayOnly, 'sig2')
    this.mesh.onRemote.on((peer, stream) => { this.streams.set(peer, stream); this.onChange.emit() })
    this.mesh.onRemoteGone.on((peer) => { this.streams.delete(peer); this.onChange.emit() })
  }

  /** Start sharing a tab/window onto a TV. Returns false if the user cancelled. */
  async share(tvId: string, tv: Y.Map<any>, name: string) {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: true })
    } catch { return false }
    this.stop()
    this.sharing = { tvId, stream }
    this.mesh.setTrack('video', stream.getVideoTracks()[0] ?? null)
    this.mesh.setTrack('audio', stream.getAudioTracks()[0] ?? null)
    stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (this.sharing?.stream === stream) this.stopFor(tv) })
    tv.doc!.transact(() => { tv.set('mode', 'screen'); tv.set('sharer', this.net.selfId); tv.set('sharerName', name) })
    this.onChange.emit()
    return true
  }

  stopFor(tv: Y.Map<any>) {
    if (tv.get('sharer') === this.net.selfId) tv.doc!.transact(() => { tv.delete('sharer'); tv.delete('sharerName'); tv.set('mode', 'off') })
    this.stop()
  }

  private stop() {
    this.sharing?.stream.getTracks().forEach((t) => t.stop())
    this.sharing = null
    this.mesh.setTrack('video', null)
    this.mesh.setTrack('audio', null)
    this.onChange.emit()
  }

  /**
   * Who should be connected, given every TV currently in screen mode.
   * tvs: [{ id, x, y (px, centre), sharer }]; people: peer -> position.
   */
  tick(me: { x: number; y: number }, people: Map<string, { x: number; y: number }>, tvs: { id: string; x: number; y: number; sharer?: string }[], zones: Zone[]) {
    const want = new Set<string>()
    const at = (p: { x: number; y: number }, tv: { x: number; y: number }) => {
      const zt = zoneAt(zones, tv), zp = zoneAt(zones, p)
      return zt ? zt.id === zp?.id : Math.hypot(p.x - tv.x, p.y - tv.y) < SCREEN_RANGE
    }
    for (const tv of tvs) {
      if (!tv.sharer) continue
      if (tv.sharer === this.net.selfId) {
        for (const [peer, pos] of people) if (at(pos, tv)) want.add(peer)
      } else if (people.has(tv.sharer) && at(me, tv)) want.add(tv.sharer)
    }
    this.mesh.setWanted(want)
  }
}
