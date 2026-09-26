import * as ed from '@noble/ed25519'
import { sha256 } from '@noble/hashes/sha2.js'

/**
 * Identity = an Ed25519 keypair kept in this browser. Your public key
 * (base64url) is your user id everywhere: world ownership, moderation,
 * room authorship. Back it up (Settings > Identity) to use it on another device.
 */
export const b64u = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const fromB64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
const utf8 = (s: string) => new TextEncoder().encode(s)

/** Deterministic JSON (sorted keys) so signatures verify identically everywhere. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  const o = v as Record<string, unknown>
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}'
}

export const hashHex = (s: string | Uint8Array) =>
  Array.from(sha256(typeof s === 'string' ? utf8(s) : s), (b) => b.toString(16).padStart(2, '0')).join('')

/** Short, link-friendly id derived from a public key (used for world ids). */
export const idFromKey = (pub: string) => hashHex(pub).slice(0, 12)

export interface Identity { pub: string; secret: Uint8Array }

/** `?profile=x` keeps a separate identity per profile (several people in one browser). */
export const profile = () => new URLSearchParams(location.search).get('profile') ?? ''
const KEY = () => 'po:identity' + (profile() ? ':' + profile() : '')

export async function loadIdentity(): Promise<Identity> {
  try {
    const raw = localStorage.getItem(KEY())
    if (raw) {
      const secret = fromB64u(JSON.parse(raw).secret)
      return { secret, pub: b64u(await ed.getPublicKeyAsync(secret)) }
    }
  } catch { /* fall through to a fresh key */ }
  const secret = ed.utils.randomSecretKey()
  const id = { secret, pub: b64u(await ed.getPublicKeyAsync(secret)) }
  saveIdentity(id)
  return id
}

export function saveIdentity(id: Identity) {
  try { localStorage.setItem(KEY(), JSON.stringify({ secret: b64u(id.secret), v: 1 })) } catch { /* storage blocked */ }
}

/** Text the user can copy somewhere safe and paste on another device. */
export const exportIdentity = (id: Identity) => 'pixel-office-key:' + b64u(id.secret)

export async function importIdentity(text: string): Promise<Identity> {
  const m = text.trim().match(/^pixel-office-key:([A-Za-z0-9_-]{43})$/)
  if (!m) throw new Error('That is not a Pixel Office key backup.')
  const secret = fromB64u(m[1])
  const id = { secret, pub: b64u(await ed.getPublicKeyAsync(secret)) }
  saveIdentity(id)
  return id
}

export async function sign(id: Identity, msg: string) {
  return b64u(await ed.signAsync(utf8(msg), id.secret))
}

export async function verify(pub: string, msg: string, sig: string) {
  try { return await ed.verifyAsync(fromB64u(sig), utf8(msg), fromB64u(pub)) } catch { return false }
}

/** Short human handle for a key, e.g. "k7Q2-x9aF". */
export const shortKey = (pub: string) => pub.slice(0, 4) + '-' + pub.slice(4, 8)
