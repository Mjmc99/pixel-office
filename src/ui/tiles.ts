import type { Call } from '../media/call'

export interface TileInfo { id: string; name: string; cam: boolean; mic: boolean; avatarUrl: string }

/**
 * Strip of call tiles along the top: your own camera (mirrored) plus everyone
 * you're currently connected to. A tile shows video when that person's camera
 * is on, otherwise their avatar. Green ring = speaking.
 */
export class Tiles {
  private root = document.createElement('div')
  private tiles = new Map<string, { el: HTMLDivElement; video: HTMLVideoElement; img: HTMLImageElement; name: HTMLSpanElement; mic: HTMLSpanElement }>()

  constructor(private call: Call) {
    this.root.className = 'tiles'
    document.getElementById('hud')!.append(this.root)
  }

  private tile(id: string) {
    let t = this.tiles.get(id)
    if (t) return t
    const el = document.createElement('div')
    el.className = 'tile'
    el.dataset.peer = id
    const video = document.createElement('video')
    video.autoplay = true; video.playsInline = true; video.muted = true
    const img = document.createElement('img')
    const name = document.createElement('span'); name.className = 'tname'
    const mic = document.createElement('span'); mic.className = 'tmic'; mic.textContent = 'muted'
    el.append(img, video, name, mic)
    this.root.append(el)
    t = { el, video, img, name, mic }
    this.tiles.set(id, t)
    return t
  }

  /** Called ~5x/second with everyone who should have a tile. */
  update(me: TileInfo & { speaking: boolean }, peers: TileInfo[]) {
    const keep = new Set<string>(['me'])
    const mt = this.tile('me')
    mt.el.classList.add('self')
    this.fill(mt, me, me.cam ? this.call.devices.camStream : null, me.speaking)
    for (const p of peers) {
      keep.add(p.id)
      const t = this.tile(p.id)
      const stream = this.call.remoteStreams.get(p.id) ?? null
      const v = stream?.getVideoTracks()[0]
      const hasVideo = p.cam && !!v && !v.muted
      this.fill(t, p, hasVideo ? stream : null, this.call.speaking(p.id))
      t.el.classList.toggle('connecting', !this.call.mesh.isConnected(p.id))
    }
    for (const [id, t] of this.tiles) if (!keep.has(id)) { t.el.remove(); this.tiles.delete(id) }
    this.root.classList.toggle('hidden', peers.length === 0 && !me.cam)
  }

  private fill(t: ReturnType<Tiles['tile']>, info: TileInfo, stream: MediaStream | null, speaking: boolean) {
    if (t.name.textContent !== info.name) t.name.textContent = info.name
    if (t.img.src !== info.avatarUrl) t.img.src = info.avatarUrl
    if (stream) {
      if (t.video.srcObject !== stream) { t.video.srcObject = stream; void t.video.play().catch(() => {}) }
    } else if (t.video.srcObject) t.video.srcObject = null
    t.el.classList.toggle('video', !!stream)
    t.el.classList.toggle('speaking', speaking)
    t.mic.classList.toggle('hidden', info.mic)
  }
}
