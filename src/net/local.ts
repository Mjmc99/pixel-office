import { Emitter, type Channel, type Transport } from './transport'

type Frame =
  | { k: 'hello' | 'here' | 'bye'; from: string; to?: string }
  | { k: 'msg'; from: string; to?: string; ch: string; data: unknown }

/**
 * Same-browser transport over BroadcastChannel. Used with `?net=local`:
 * open two tabs and they see each other with no network at all. Also what the
 * automated tests use. Peers announce themselves, answer announcements, and
 * are dropped after missing heartbeats.
 */
export class LocalTransport implements Transport {
  readonly kind = 'local' as const
  readonly selfId = Math.random().toString(36).slice(2, 12)
  private bc: BroadcastChannel
  private joined = new Emitter<[string]>()
  private left = new Emitter<[string]>()
  private lastSeen = new Map<string, number>()
  private subs = new Map<string, ((d: any, p: string) => void)[]>()
  private timer: number

  constructor(roomId: string) {
    this.bc = new BroadcastChannel('pixel-office:' + roomId)
    this.bc.onmessage = (e) => this.onFrame(e.data as Frame)
    this.post({ k: 'hello', from: this.selfId })
    this.timer = window.setInterval(() => {
      this.post({ k: 'here', from: this.selfId })
      const now = Date.now()
      for (const [id, t] of this.lastSeen) if (now - t > 5000) this.drop(id)
    }, 1000)
    window.addEventListener('pagehide', () => this.leave())
  }

  private post(f: Frame) { this.bc.postMessage(f) }

  private see(id: string) {
    const isNew = !this.lastSeen.has(id)
    this.lastSeen.set(id, Date.now())
    if (isNew) this.joined.emit(id)
    return isNew
  }

  private drop(id: string) {
    if (this.lastSeen.delete(id)) this.left.emit(id)
  }

  private onFrame(f: Frame) {
    if (f.from === this.selfId || (f.to && f.to !== this.selfId)) return
    if (f.k === 'bye') return this.drop(f.from)
    const isNew = this.see(f.from)
    if (f.k === 'hello' && isNew) this.post({ k: 'here', from: this.selfId, to: f.from })
    if (f.k === 'msg') for (const s of this.subs.get(f.ch) ?? []) s(f.data, f.from)
  }

  channel<T>(name: string): Channel<T> {
    return {
      send: (data, to) => this.post({ k: 'msg', from: this.selfId, to, ch: name, data }),
      onMessage: (cb) => { this.subs.set(name, [...(this.subs.get(name) ?? []), cb]) },
    }
  }

  onPeerJoin(cb: (id: string) => void) { this.joined.on(cb) }
  onPeerLeave(cb: (id: string) => void) { this.left.on(cb) }
  peers() { return [...this.lastSeen.keys()] }
  leave() {
    clearInterval(this.timer)
    this.post({ k: 'bye', from: this.selfId })
    this.bc.close()
  }
}
