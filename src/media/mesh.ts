import { Emitter, type Transport } from '../net/transport'

/**
 * Direct audio/video between pairs of peers.
 *
 * - One RTCPeerConnection per remote peer, created only while the proximity
 *   rules say we should hear each other (see proximity.ts).
 * - Signaling rides on the transport's 'sig' channel, so the same code works
 *   over Trystero (P2P) and the local BroadcastChannel transport (tests).
 * - Every connection has exactly one audio + one video transceiver. Turning the
 *   mic/camera on or off is `sender.replaceTrack()`, so no renegotiation.
 * - To avoid offer glare, the peer with the smaller id always makes the offer;
 *   the other side sends 'want' to ask for one.
 */
type Sig =
  | { t: 'want' }
  | { t: 'offer' | 'answer'; sdp: string }
  | { t: 'ice'; c: RTCIceCandidateInit }
  | { t: 'bye' }

interface Conn {
  pc: RTCPeerConnection
  stream: MediaStream
  pendingIce: RTCIceCandidateInit[]
  remoteSet: boolean
}

export const DEFAULT_ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
]

const VIDEO_MAX_BITRATE = 350_000 // keeps a 6-way mesh inside a home upload link

export class MediaMesh {
  readonly onRemote = new Emitter<[string, MediaStream]>()
  readonly onRemoteGone = new Emitter<[string]>()
  readonly onChange = new Emitter<[]>()
  private conns = new Map<string, Conn>()
  private wanted = new Set<string>()
  private local: Record<'audio' | 'video', MediaStreamTrack | null> = { audio: null, video: null }
  /** per-peer: may we send our mic / camera to them? (stages, crowd limits) */
  private sendTo = new Map<string, { audio: boolean; video: boolean }>()
  private lastWant = new Map<string, number>()
  private backoff = new Map<string, number>()
  private sig

  constructor(private net: Transport, private iceServers: RTCIceServer[] = DEFAULT_ICE, private relayOnly = false, channel = 'sig') {
    this.sig = net.channel<Sig>(channel)
    this.sig.onMessage((m, from) => void this.onSignal(m as Sig, from))
    net.onPeerLeave((p) => this.close(p, false))
  }

  /** Peers we should currently be in a call with. Called a few times a second. */
  setWanted(peers: Set<string>) {
    this.wanted = peers
    const now = Date.now()
    for (const p of peers) {
      if (this.conns.has(p) || (this.backoff.get(p) ?? 0) > now) continue
      if (this.net.selfId < p) this.open(p)
      else if (now - (this.lastWant.get(p) ?? 0) > 1000) { this.lastWant.set(p, now); this.sig.send({ t: 'want' }, p) }
    }
    for (const p of [...this.conns.keys()]) if (!peers.has(p)) this.close(p, true)
  }

  connected() { return [...this.conns.keys()] }
  isConnected(p: string) { return this.conns.get(p)?.pc.connectionState === 'connected' }
  stats() {
    return [...this.conns.entries()].map(([id, c]) => ({
      id, state: c.pc.connectionState,
      tracks: c.stream.getTracks().map((t) => ({ kind: t.kind, muted: t.muted, live: t.readyState === 'live' })),
      sending: { audio: !!this.sender(c.pc, 'audio')?.track, video: !!this.sender(c.pc, 'video')?.track },
    }))
  }

  /** Swap the local mic or camera track on every open call (null = stop sending). */
  setTrack(kind: 'audio' | 'video', track: MediaStreamTrack | null) {
    this.local[kind] = track
    for (const peer of this.conns.keys()) this.apply(peer, kind)
  }

  /** Control what we send to one peer without renegotiating. */
  setPeerSend(peer: string, send: { audio: boolean; video: boolean }) {
    const cur = this.sendTo.get(peer)
    if (cur && cur.audio === send.audio && cur.video === send.video) return
    this.sendTo.set(peer, send)
    if (this.conns.has(peer)) { this.apply(peer, 'audio'); this.apply(peer, 'video') }
  }

  private trackFor(peer: string, kind: 'audio' | 'video') {
    return this.sendTo.get(peer)?.[kind] === false ? null : this.local[kind]
  }

  private apply(peer: string, kind: 'audio' | 'video') {
    const c = this.conns.get(peer)
    const s = c && this.sender(c.pc, kind)
    const t = this.trackFor(peer, kind)
    if (s && s.track !== t) void s.replaceTrack(t).catch(() => {})
  }

  private sender(pc: RTCPeerConnection, kind: 'audio' | 'video') {
    return pc.getTransceivers().find((t) => t.receiver.track.kind === kind)?.sender
  }

  private create(peer: string): Conn {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, ...(this.relayOnly ? { iceTransportPolicy: 'relay' as const } : {}) })
    const c: Conn = { pc, stream: new MediaStream(), pendingIce: [], remoteSet: false }
    this.conns.set(peer, c)
    pc.onicecandidate = (e) => { if (e.candidate) this.sig.send({ t: 'ice', c: e.candidate.toJSON() }, peer) }
    pc.ontrack = (e) => {
      if (!c.stream.getTracks().includes(e.track)) c.stream.addTrack(e.track)
      this.onRemote.emit(peer, c.stream)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') { this.close(peer, true); this.backoff.set(peer, Date.now() + 3000) }
      this.onChange.emit()
    }
    return c
  }

  private async open(peer: string) {
    const c = this.create(peer)
    for (const kind of ['audio', 'video'] as const) {
      const t = c.pc.addTransceiver(kind, { direction: 'sendrecv' })
      void t.sender.replaceTrack(this.trackFor(peer, kind))
      if (kind === 'video') this.capBitrate(t.sender)
    }
    try {
      await c.pc.setLocalDescription(await c.pc.createOffer())
      this.sig.send({ t: 'offer', sdp: c.pc.localDescription!.sdp }, peer)
    } catch { this.close(peer, true) }
  }

  private capBitrate(sender: RTCRtpSender) {
    try {
      const p = sender.getParameters()
      if (!p.encodings?.length) p.encodings = [{}]
      p.encodings[0].maxBitrate = VIDEO_MAX_BITRATE
      void sender.setParameters(p).catch(() => {})
    } catch { /* not negotiated yet; defaults are fine */ }
  }

  private async onSignal(m: Sig, from: string) {
    if (m.t === 'want') {
      if (this.wanted.has(from) && !this.conns.has(from) && this.net.selfId < from) void this.open(from)
      return
    }
    if (m.t === 'bye') { this.close(from, false); this.backoff.set(from, Date.now() + 1500); return }
    if (m.t === 'offer') {
      if (!this.wanted.has(from)) { this.sig.send({ t: 'bye' }, from); return }
      const c = this.conns.get(from) ?? this.create(from)
      await c.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp })
      c.remoteSet = true
      for (const t of c.pc.getTransceivers()) {
        const kind = t.receiver.track.kind as 'audio' | 'video'
        t.direction = 'sendrecv'
        await t.sender.replaceTrack(this.trackFor(from, kind)).catch(() => {})
      }
      await c.pc.setLocalDescription(await c.pc.createAnswer())
      this.sig.send({ t: 'answer', sdp: c.pc.localDescription!.sdp }, from)
      const vs = this.sender(c.pc, 'video'); if (vs) this.capBitrate(vs)
      await this.flushIce(c)
      return
    }
    const c = this.conns.get(from)
    if (!c) return
    if (m.t === 'answer') {
      if (c.pc.signalingState !== 'have-local-offer') return
      await c.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp })
      c.remoteSet = true
      await this.flushIce(c)
    } else if (m.t === 'ice') {
      if (c.remoteSet) await c.pc.addIceCandidate(m.c).catch(() => {})
      else c.pendingIce.push(m.c)
    }
  }

  private async flushIce(c: Conn) {
    for (const ice of c.pendingIce.splice(0)) await c.pc.addIceCandidate(ice).catch(() => {})
  }

  private close(peer: string, sayBye: boolean) {
    const c = this.conns.get(peer)
    if (!c) return
    this.conns.delete(peer)
    this.sendTo.delete(peer)
    c.pc.close()
    if (sayBye) this.sig.send({ t: 'bye' }, peer)
    this.onRemoteGone.emit(peer)
    this.onChange.emit()
  }
}
