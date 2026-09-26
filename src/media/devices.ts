import { Emitter } from '../net/transport'
import type { MediaMesh } from './mesh'

/**
 * Local mic + camera. The mic is acquired once and muted by disabling the
 * track (instant, no re-prompt). The camera is fully stopped when off so the
 * webcam light goes out.
 */
export class LocalDevices {
  readonly onChange = new Emitter<[]>()
  mic: MediaStreamTrack | null = null
  cam: MediaStreamTrack | null = null
  micOn = false
  camOn = false
  error = ''
  level = 0 // 0..1 mic level, for the speaking indicator
  private analyser?: AnalyserNode
  private buf = new Uint8Array(512)

  constructor(private mesh: MediaMesh, private ctx: () => AudioContext) {}

  get camStream() { return this.cam ? new MediaStream([this.cam]) : null }

  async setMic(on: boolean) {
    this.error = ''
    try {
      if (on && !this.mic) {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        this.mic = s.getAudioTracks()[0]
        const src = this.ctx().createMediaStreamSource(new MediaStream([this.mic]))
        this.analyser = this.ctx().createAnalyser()
        this.analyser.fftSize = 512
        src.connect(this.analyser)
      }
      if (this.mic) this.mic.enabled = on
      this.micOn = on && !!this.mic
      this.mesh.setTrack('audio', this.micOn ? this.mic : null)
    } catch (e) {
      this.error = 'Microphone blocked: ' + (e as Error).message
      this.micOn = false
    }
    this.onChange.emit()
  }

  async setCam(on: boolean) {
    this.error = ''
    try {
      if (on && !this.cam) {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, frameRate: 15 } })
        this.cam = s.getVideoTracks()[0]
      }
      if (!on && this.cam) { this.cam.stop(); this.cam = null }
      this.camOn = on && !!this.cam
      this.mesh.setTrack('video', this.cam)
    } catch (e) {
      this.error = 'Camera blocked: ' + (e as Error).message
      this.camOn = false
    }
    this.onChange.emit()
  }

  /** Call every frame or so; returns true while talking. */
  speaking() {
    if (!this.analyser || !this.micOn) return (this.level = 0), false
    this.analyser.getByteTimeDomainData(this.buf)
    let sum = 0
    for (const v of this.buf) sum += (v - 128) * (v - 128)
    this.level = Math.sqrt(sum / this.buf.length) / 128
    return this.level > 0.04
  }
}
