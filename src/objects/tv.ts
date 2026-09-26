import type * as Y from 'yjs'

/**
 * Watch-party sync. Shared state (in the world doc) is
 *   { v: videoId, playing, pos: seconds at `at`, at: epoch ms }
 * so "where the video should be now" = pos + (now - at) if playing.
 * Every viewer runs their own YouTube player (no re-streaming) and nudges it
 * toward that point: seek if more than 0.8 s off.
 * Clocks: uses each browser's clock; OS clocks are usually NTP-synced to
 * well under the 0.8 s tolerance.
 */
export interface TvState { v: string; playing: boolean; pos: number; at: number }

export function parseVideoId(input: string): string | null {
  const s = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  try {
    const u = new URL(s)
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1, 12) || null
    if (u.hostname.includes('youtube')) {
      const v = u.searchParams.get('v') ?? u.pathname.match(/\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/)?.[1]
      return v && /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null
    }
  } catch { /* not a URL */ }
  return null
}

export const expectedPos = (s: TvState, now = Date.now()) => s.playing ? s.pos + (now - s.at) / 1000 : s.pos

let ytReady: Promise<any> | null = null
function loadYouTube(): Promise<any> {
  const w = window as any
  if (w.YT?.Player) return Promise.resolve(w.YT)
  ytReady ??= new Promise((res, rej) => {
    w.onYouTubeIframeAPIReady = () => res(w.YT)
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.onerror = () => { ytReady = null; rej(new Error('YouTube unavailable')) }
    document.head.append(s)
    setTimeout(() => rej(new Error('YouTube timed out')), 10_000)
  })
  return ytReady
}

export class TvSync {
  private player: any = null
  private timer: number
  private quietUntil = 0
  private observer = () => this.apply()

  constructor(private map: Y.Map<any>, screen: HTMLElement, private onStatus: (s: TvState | null, pos: number) => void) {
    map.observe(this.observer)
    this.timer = window.setInterval(() => this.apply(), 500)
    const holder = document.createElement('div')
    screen.append(holder)
    loadYouTube().then((YT) => {
      this.player = new YT.Player(holder, {
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => this.apply(),
          onStateChange: (e: any) => this.onPlayerState(e.data),
        },
      })
    }).catch(() => {
      screen.innerHTML = '<div class="tvoff">YouTube player unavailable here — the watch state still syncs.</div>'
    })
    this.apply()
  }

  get state(): TvState | null {
    const v = this.map.get('v')
    return v ? { v, playing: !!this.map.get('playing'), pos: Number(this.map.get('pos')) || 0, at: Number(this.map.get('at')) || Date.now() } : null
  }

  private write(s: Partial<TvState>) {
    this.quietUntil = Date.now() + 700
    const cur = this.state
    const pos = s.pos ?? (cur ? expectedPos(cur) : 0)
    this.map.doc!.transact(() => {
      for (const [k, v] of Object.entries({ ...s, pos, at: Date.now() })) this.map.set(k, v)
    })
  }

  load(v: string) { this.write({ v, playing: true, pos: 0 }) }
  play() { if (this.state) this.write({ playing: true }) }
  pause() { if (this.state) this.write({ playing: false }) }
  off() { this.map.doc!.transact(() => { for (const k of ['v', 'playing', 'pos', 'at']) this.map.delete(k) }) }

  /** The viewer used the player's own controls: share that with everyone. */
  private onPlayerState(code: number) {
    if (Date.now() < this.quietUntil || !this.state || !this.player) return
    const t = this.player.getCurrentTime?.() ?? 0
    if (code === 1 && !this.state.playing) this.write({ playing: true, pos: t })
    if (code === 2 && this.state.playing) this.write({ playing: false, pos: t })
  }

  private apply() {
    const s = this.state
    const pos = s ? expectedPos(s) : 0
    this.onStatus(s, pos)
    const p = this.player
    if (!p?.getPlayerState) return
    this.quietUntil = Math.max(this.quietUntil, Date.now() + 300)
    if (!s) { if (p.getPlayerState() === 1) p.stopVideo(); return }
    const loaded = p.getVideoData?.()?.video_id
    if (loaded !== s.v) { s.playing ? p.loadVideoById(s.v, pos) : p.cueVideoById(s.v, pos); return }
    const state = p.getPlayerState()
    if (s.playing && state !== 1 && state !== 3) p.playVideo()
    if (!s.playing && state === 1) p.pauseVideo()
    if (Math.abs((p.getCurrentTime?.() ?? 0) - pos) > 0.8) p.seekTo(pos, true)
  }

  destroy() {
    clearInterval(this.timer)
    this.map.unobserve(this.observer)
    try { this.player?.destroy?.() } catch { /* already gone */ }
  }
}
