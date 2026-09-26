import { joinRoom as joinNostr, selfId, type Room } from 'trystero'
import { joinRoom as joinRelay } from '@trystero-p2p/ws-relay'
import { Emitter, type Channel, type Transport } from './transport'

export const APP_ID = 'pixel-office-v0'

/**
 * Peer-to-peer transport. Peers find each other through public Nostr relays;
 * after that every byte goes browser-to-browser over WebRTC data channels.
 * `secret` (from the invite link) encrypts the signaling, so only people with
 * the link can even discover the room.
 */
export class TrysteroTransport implements Transport {
  readonly kind = 'p2p' as const
  readonly selfId = selfId
  private room: Room
  private joined = new Emitter<[string]>()
  private left = new Emitter<[string]>()
  private known = new Set<string>()

  /**
   * @param relay  optional self-hosted relay (wss://…); default is public Nostr relays
   * @param relayOnly route all traffic through TURN (hides your IP from peers)
   */
  constructor(roomId: string, secret: string, opts: { turn?: RTCIceServer[]; relay?: string | null; relayOnly?: boolean } = {}) {
    const config = {
      appId: APP_ID, password: secret,
      ...(opts.turn?.length ? { turnConfig: opts.turn as any } : {}),
      ...(opts.relayOnly ? { rtcConfig: { iceTransportPolicy: 'relay' as const } } : {}),
    }
    this.room = opts.relay
      ? joinRelay({ ...config, relayConfig: { urls: [opts.relay] } }, roomId)
      : joinNostr(config, roomId)
    this.room.onPeerJoin = (id) => { this.known.add(id); this.joined.emit(id) }
    this.room.onPeerLeave = (id) => { this.known.delete(id); this.left.emit(id) }
  }

  channel<T>(name: string): Channel<T> {
    // Trystero action names are limited to 12 bytes
    const action = this.room.makeAction<any>(name.slice(0, 12))
    const subs: ((d: T, p: string) => void)[] = []
    action.onMessage = (data, ctx) => { for (const s of subs) s(data as T, ctx.peerId) }
    return {
      send: (data, target) => { void action.send(data as any, target ? { target } : undefined).catch(() => {}) },
      onMessage: (cb) => { subs.push(cb) },
    }
  }

  onPeerJoin(cb: (id: string) => void) { this.joined.on(cb) }
  onPeerLeave(cb: (id: string) => void) { this.left.on(cb) }
  peers() { return [...this.known] }
  leave() { void this.room.leave() }
  /** The underlying room, for media later (phase 1). */
  get raw() { return this.room }
}
