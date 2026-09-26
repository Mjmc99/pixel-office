/**
 * Plays remote voices through Web Audio so each one gets its own volume
 * (distance falloff) and stereo pan, plus a level meter for "is speaking".
 */
interface Voice { el: HTMLAudioElement; gain: GainNode; pan: StereoPannerNode; an: AnalyserNode; src?: MediaStreamAudioSourceNode }

export class VoiceMixer {
  private ctx?: AudioContext
  private voices = new Map<string, Voice>()
  private buf = new Uint8Array(512)

  constructor() {
    // browsers only start audio after a user gesture
    const resume = () => { void this.context().resume() }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
  }

  context() {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  attach(peer: string, stream: MediaStream) {
    const ctx = this.context()
    let v = this.voices.get(peer)
    if (!v) {
      // Chrome only feeds a remote WebRTC stream into Web Audio if it is also
      // attached to a (muted) media element.
      const el = new Audio()
      el.muted = true
      const gain = ctx.createGain(), pan = ctx.createStereoPanner(), an = ctx.createAnalyser()
      an.fftSize = 512
      gain.gain.value = 0
      gain.connect(pan).connect(ctx.destination)
      gain.connect(an)
      v = { el, gain, pan, an }
      this.voices.set(peer, v)
    }
    if (!stream.getAudioTracks().length) return
    v.el.srcObject = stream
    void v.el.play().catch(() => {})
    v.src?.disconnect()
    v.src = ctx.createMediaStreamSource(stream)
    v.src.connect(v.gain)
  }

  set(peer: string, gain: number, pan: number) {
    const v = this.voices.get(peer)
    if (!v || !this.ctx) return
    v.gain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.08)
    v.pan.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.08)
  }

  level(peer: string) {
    const v = this.voices.get(peer)
    if (!v) return 0
    v.an.getByteTimeDomainData(this.buf)
    let sum = 0
    for (const x of this.buf) sum += (x - 128) * (x - 128)
    return Math.sqrt(sum / this.buf.length) / 128
  }

  detach(peer: string) {
    const v = this.voices.get(peer)
    if (!v) return
    v.src?.disconnect(); v.gain.disconnect(); v.el.srcObject = null
    this.voices.delete(peer)
  }
}
