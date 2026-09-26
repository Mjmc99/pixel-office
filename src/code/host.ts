import { SDK_SOURCE } from './sdk'

export type Perm = 'state' | 'events' | 'sprites' | 'ui' | 'players' | 'embed' | 'network'
export const ALL_PERMS: { id: Perm; label: string; risky?: boolean }[] = [
  { id: 'state', label: 'Keep shared state for this office' },
  { id: 'events', label: 'Send messages to people in this office' },
  { id: 'sprites', label: 'Draw things in this office' },
  { id: 'ui', label: 'Show pop-ups and panels' },
  { id: 'players', label: 'See names and positions of people in this office' },
  { id: 'embed', label: 'Open websites from its list in a panel', risky: true },
  { id: 'network', label: 'Connect to websites from its list', risky: true },
]

export interface RoomCode { src: string; perms: Perm[]; domains?: string[] }

/** Sandbox bootstrap: an opaque-origin page whose only job is to host the worker. */
function bootstrap(connect: string) {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src ${connect}">
<script>onmessage=(e)=>{if(!e.data||e.data.t!=='init'||!e.ports[0])return;const port=e.ports[0];
const w=new Worker(URL.createObjectURL(new Blob([e.data.src],{type:'text/javascript'})));
w.onmessage=(m)=>port.postMessage(m.data);w.onerror=(er)=>{er.preventDefault();port.postMessage({t:'error',message:String(er.message)})};
port.onmessage=(m)=>w.postMessage(m.data);onmessage=null}<\/script>`
}

export const safeDomains = (d: string[] = []) =>
  d.map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(x)).slice(0, 8)

/**
 * Runs one office's code. Everything it can do arrives here as a 'call'
 * message and is checked against the granted permissions. A watchdog kills
 * it (by removing the iframe, which ends the worker) if it stops answering
 * pings or floods messages.
 */
export class CodeHost {
  private frame: HTMLIFrameElement
  private port?: MessagePort
  private pingN = 0
  private lastPong = Date.now()
  private timer: number
  private budget = { t: Date.now(), n: 0 }
  dead: string | null = null

  constructor(
    code: RoomCode,
    private granted: Set<Perm>,
    private onCall: (fn: string, args: any[]) => void,
    private onLog: (kind: 'log' | 'error' | 'killed', text: string) => void,
    ready: () => void,
  ) {
    const domains = granted.has('network') ? safeDomains(code.domains) : []
    const connect = domains.length ? domains.map((d) => `https://${d}`).join(' ') : "'none'"
    this.frame = document.createElement('iframe')
    this.frame.setAttribute('sandbox', 'allow-scripts')
    this.frame.style.display = 'none'
    this.frame.srcdoc = bootstrap(connect)
    this.frame.onload = () => {
      const ch = new MessageChannel()
      this.port = ch.port1
      this.port.onmessage = (e) => this.onMessage(e.data)
      this.frame.contentWindow?.postMessage({ t: 'init', src: SDK_SOURCE + '\n;\n' + code.src }, '*', [ch.port2])
      this.lastPong = Date.now()
      ready()
    }
    document.body.append(this.frame)
    this.timer = window.setInterval(() => this.watchdog(), 1000)
  }

  send(m: unknown) { if (!this.dead) this.port?.postMessage(m) }

  private watchdog() {
    if (this.dead) return
    if (Date.now() - this.lastPong > 3000) return this.kill('stopped responding (possible infinite loop)')
    this.send({ t: 'ping', n: ++this.pingN })
  }

  private onMessage(m: any) {
    if (this.dead || !m) return
    const now = Date.now()
    if (now - this.budget.t > 1000) this.budget = { t: now, n: 0 }
    if (++this.budget.n > 300) return this.kill('sent too many messages')
    if (m.t === 'pong') { this.lastPong = now; return }
    if (m.t === 'log') return this.onLog('log', (m.args ?? []).join(' ').slice(0, 500))
    if (m.t === 'error') return this.onLog('error', String(m.message).slice(0, 500))
    if (m.t === 'call' && typeof m.fn === 'string' && Array.isArray(m.args)) {
      const perm = PERM_OF[m.fn]
      if (!perm) return this.onLog('error', `unknown call ${m.fn}`)
      if (!this.granted.has(perm)) return this.onLog('error', `${m.fn} needs the "${perm}" permission`)
      this.onCall(m.fn, m.args)
    }
  }

  kill(reason: string) {
    if (this.dead) return
    this.dead = reason
    clearInterval(this.timer)
    this.frame.remove()
    this.onLog('killed', reason)
  }

  stop() {
    clearInterval(this.timer)
    this.dead = this.dead ?? 'stopped'
    this.frame.remove()
  }
}

const PERM_OF: Record<string, Perm> = {
  'state.set': 'state', 'state.delete': 'state', broadcast: 'events',
  'sprites.spawn': 'sprites', 'sprites.move': 'sprites', 'sprites.remove': 'sprites',
  'ui.toast': 'ui', 'ui.panel': 'ui', 'ui.post': 'ui', 'ui.close': 'ui', embed: 'embed',
}

/** HTML panels opened by office code: their own sandboxed iframe with a tiny bridge. */
export function panelDoc(html: string) {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<style>body{margin:0;padding:10px;font:13px/1.4 ui-monospace,monospace;color:#efeae0;background:#1f1d27}button{font:inherit}</style>
<script>window.room={post:(d)=>parent.postMessage({__rc:1,data:d},'*'),on:(f)=>addEventListener('message',(e)=>{if(e.data&&e.data.__rc)f(e.data.data)})}<\/script>
${html}`
}
