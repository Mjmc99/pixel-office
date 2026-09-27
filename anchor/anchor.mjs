#!/usr/bin/env node
/**
 * Pixel Office anchor peer: keeps worlds online when nobody's in them.
 *
 *   node anchor/anchor.mjs --invite "https://you.github.io/pixel-office/#w=abc123.SECRET" [--invite …]
 *                          [--relay wss://your-relay:8787] [--data ./anchor-data] [--stun off] [--verbose]
 *
 * --stun off skips public STUN lookups (only local addresses are offered): use it when the
 * anchor and everyone who connects are on the same machine or LAN. It also makes startup
 * much faster, since the anchor prepares a pool of 20 connections up front.
 *
 * It joins each world as a silent peer (no avatar), keeps a copy of the
 * world's shared document (the signed op log, whiteboards, notes, …) and every
 * office package, saves them to disk, and hands them to anyone who connects.
 * It never signs anything, so it can't change a world; peers still verify
 * every op and package themselves. Runs happily on a Raspberry Pi.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as Y from 'yjs'
import { joinRoom as joinNostr } from 'trystero'
import { joinRoom as joinRelay } from '@trystero-p2p/ws-relay'
import { RTCPeerConnection } from 'werift'

const APP_ID = 'pixel-office-v0'
const args = process.argv.slice(2)
const opt = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []))
const invites = opt('invite')
const relay = opt('relay')[0] ?? null
const dataDir = opt('data')[0] ?? './anchor-data'
if (!invites.length) {
  console.error('usage: node anchor/anchor.mjs --invite "<world invite link or #w=id.secret>" [--relay wss://…] [--data dir]')
  process.exit(1)
}
mkdirSync(dataDir, { recursive: true })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const verbose = args.includes('--verbose')
const noStun = opt('stun')[0] === 'off'

/** --verbose: log relay sockets and WebRTC connection progress (for "why doesn't it connect?"). */
class LoggedPC extends RTCPeerConnection {
  constructor(...a) {
    super(...a)
    const id = Math.random().toString(36).slice(2, 6)
    log(`[pc ${id}] created`)
    this.iceConnectionStateChange?.subscribe?.((s) => log(`[pc ${id}] ice ${s}`))
    this.connectionStateChange?.subscribe?.((s) => log(`[pc ${id}] ${s}`))
    this.onIceCandidate?.subscribe?.((c) => c && log(`[pc ${id}] local candidate ${String(c.candidate ?? '').split(' ').slice(4, 8).join(' ')}`))
  }
}
if (verbose && globalThis.WebSocket) {
  const WS = globalThis.WebSocket
  globalThis.WebSocket = class extends WS {
    constructor(url, ...rest) {
      super(url, ...rest)
      log(`[ws] connecting ${url}`)
      this.addEventListener('open', () => log(`[ws] open ${url}`))
      this.addEventListener('close', (e) => log(`[ws] closed ${url} ${e.code}`))
      this.addEventListener('error', () => log(`[ws] error ${url}`))
    }
  }
}

for (const invite of invites) {
  const m = invite.match(/w=([a-z0-9]+)\.([A-Za-z0-9_-]+)/)
  if (!m) { console.error('not an invite link:', invite); continue }
  serveWorld(m[1], m[2])
}

function serveWorld(worldId, secret) {
  const docFile = join(dataDir, `${worldId}.yjs`)
  const pkgFile = join(dataDir, `${worldId}.packages.json`)
  const doc = new Y.Doc()
  if (existsSync(docFile)) Y.applyUpdate(doc, readFileSync(docFile))
  const pkgs = new Map(existsSync(pkgFile) ? Object.entries(JSON.parse(readFileSync(pkgFile, 'utf8'))) : [])

  // debounced save: 0.5 s after things go quiet, but never more than 3 s after the first change
  let saveTimer = null, firstDirty = 0
  const flush = () => {
    clearTimeout(saveTimer); saveTimer = null; firstDirty = 0
    writeFileSync(docFile, Y.encodeStateAsUpdate(doc))
    writeFileSync(pkgFile, JSON.stringify(Object.fromEntries(pkgs)))
  }
  const save = () => {
    const now = Date.now()
    if (!firstDirty) firstDirty = now
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, Math.max(0, Math.min(500, firstDirty + 3000 - now)))
  }

  const config = {
    appId: APP_ID, password: secret, rtcPolyfill: verbose ? LoggedPC : RTCPeerConnection, passive: true,
    ...(noStun ? { rtcConfig: { iceServers: [] } } : {}),
  }
  const room = relay ? joinRelay({ ...config, relayConfig: { urls: [relay] } }, worldId) : joinNostr(config, worldId)

  const y = room.makeAction('y')
  const pkg = room.makeAction('pkg')
  doc.on('update', (u, origin) => { if (origin !== 'remote') y.send(u).catch(() => {}); save() })
  y.onMessage = (data) => {
    try { Y.applyUpdate(doc, data instanceof Uint8Array ? data : new Uint8Array(data), 'remote') } catch (e) { log('bad update', e.message) }
  }
  pkg.onMessage = (p) => {
    // keep the newest version per office; browsers verify signatures themselves
    if (!p || typeof p.owner !== 'string' || typeof p.roomId !== 'string' || typeof p.sig !== 'string') return
    const key = `${p.owner}:${p.roomId}`
    if ((pkgs.get(key)?.ver ?? -1) >= p.ver) return
    pkgs.set(key, p)
    save()
  }
  room.onPeerJoin = (peer) => {
    log(`[${worldId}] peer joined ${peer}`)
    y.send(Y.encodeStateAsUpdate(doc), { target: peer }).catch(() => {})
    for (const p of pkgs.values()) pkg.send(p, { target: peer }).catch(() => {})
  }
  room.onPeerLeave = (peer) => log(`[${worldId}] peer left ${peer}`)
  log(`[${worldId}] anchoring (ops: ${doc.getArray('ops').length}, offices: ${pkgs.size}) via ${relay ?? 'nostr'}${noStun ? ', no STUN' : ''}`)
}
