import type { Transport } from '../net/transport'
import { VoiceMixer } from './audio'
import { LocalDevices } from './devices'
import { MediaMesh } from './mesh'
import { hearing, zoneAt, type Pos, type Zone } from './proximity'

/** Glue: positions + zones -> who we're in a call with, and how loud they are. */
export class Call {
  readonly mesh: MediaMesh
  readonly mixer = new VoiceMixer()
  readonly devices: LocalDevices
  readonly remoteStreams = new Map<string, MediaStream>()
  gains = new Map<string, number>()
  myZone: Zone | null = null

  constructor(net: Transport, turn?: RTCIceServer[]) {
    this.mesh = new MediaMesh(net, turn)
    this.devices = new LocalDevices(this.mesh, () => this.mixer.context())
    this.mesh.onRemote.on((peer, stream) => { this.remoteStreams.set(peer, stream); this.mixer.attach(peer, stream) })
    this.mesh.onRemoteGone.on((peer) => { this.remoteStreams.delete(peer); this.mixer.detach(peer); this.gains.delete(peer) })
  }

  tick(me: Pos, others: Map<string, Pos>, zones: Zone[]) {
    this.myZone = zoneAt(zones, me)
    const want = new Set<string>()
    for (const [peer, pos] of others) {
      const h = hearing(zones, me, pos, this.mesh.connected().includes(peer))
      if (h.want) want.add(peer)
      this.gains.set(peer, h.gain)
      this.mixer.set(peer, h.gain, h.pan)
    }
    this.mesh.setWanted(want)
  }

  /** Peers currently in a call with us (connection may still be negotiating). */
  inCall() { return this.mesh.connected() }
  speaking(peer: string) { return this.mixer.level(peer) * (this.gains.get(peer) ?? 0) > 0.03 }
}
