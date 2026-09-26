import type { Transport } from '../net/transport'
import { VoiceMixer } from './audio'
import { LocalDevices } from './devices'
import { DEFAULT_ICE, MediaMesh } from './mesh'
import { hearing, sendVideo, zoneAt, type Pos, type Zone } from './proximity'

/** Glue: positions + zones -> who we're in a call with, and how loud they are. */
export class Call {
  readonly mesh: MediaMesh
  readonly mixer = new VoiceMixer()
  readonly devices: LocalDevices
  readonly remoteStreams = new Map<string, MediaStream>()
  gains = new Map<string, number>()
  myZone: Zone | null = null
  lastSpoke = 0
  /** true when the crowd limit is currently holding back your camera */
  videoHeld = false

  constructor(net: Transport, turn?: RTCIceServer[], relayOnly = false) {
    this.mesh = new MediaMesh(net, turn?.length ? [...DEFAULT_ICE, ...turn] : DEFAULT_ICE, relayOnly)
    this.devices = new LocalDevices(this.mesh, () => this.mixer.context())
    this.mesh.onRemote.on((peer, stream) => { this.remoteStreams.set(peer, stream); this.mixer.attach(peer, stream) })
    this.mesh.onRemoteGone.on((peer) => { this.remoteStreams.delete(peer); this.mixer.detach(peer); this.gains.delete(peer) })
  }

  tick(me: Pos, others: Map<string, Pos>, zones: Zone[]) {
    this.myZone = zoneAt(zones, me)
    if (this.devices.speaking()) this.lastSpoke = Date.now()
    const want = new Set<string>()
    const hear = new Map<string, ReturnType<typeof hearing>>()
    for (const [peer, pos] of others) {
      const h = hearing(zones, me, pos, this.mesh.connected().includes(peer))
      hear.set(peer, h)
      if (h.want) want.add(peer)
      this.gains.set(peer, h.gain)
      this.mixer.set(peer, h.gain, h.pan)
    }
    const video = sendVideo(want.size, Date.now() - this.lastSpoke)
    this.videoHeld = !video && this.devices.camOn
    for (const [peer, h] of hear) this.mesh.setPeerSend(peer, { audio: h.send, video: h.send && video })
    this.mesh.setWanted(want)
  }

  /** Peers currently in a call with us (connection may still be negotiating). */
  inCall() { return this.mesh.connected() }
  speaking(peer: string) { return this.mixer.level(peer) * (this.gains.get(peer) ?? 0) > 0.03 }
}
