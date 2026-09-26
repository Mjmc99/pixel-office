/**
 * Transport = "a set of peers I can message". Two implementations:
 *  - TrysteroTransport: real peer-to-peer over WebRTC, found via public Nostr relays.
 *  - LocalTransport: BroadcastChannel between tabs of one browser (offline dev + tests).
 * Everything above this layer (presence, Yjs sync, later A/V) is transport-agnostic.
 */
export type Payload = unknown

export interface Channel<T = Payload> {
  /** Send to everyone, or to one peer. */
  send(data: T, target?: string): void
  onMessage(cb: (data: T, peerId: string) => void): void
}

export interface Transport {
  readonly kind: 'p2p' | 'local'
  readonly selfId: string
  channel<T = Payload>(name: string): Channel<T>
  onPeerJoin(cb: (peerId: string) => void): void
  onPeerLeave(cb: (peerId: string) => void): void
  peers(): string[]
  leave(): void
}

/** Small helper so several listeners can share one event. */
export class Emitter<A extends unknown[]> {
  private fns: ((...a: A) => void)[] = []
  on(fn: (...a: A) => void) { this.fns.push(fn) }
  emit(...a: A) { for (const f of this.fns) f(...a) }
}
