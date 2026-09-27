import { b64u, canonical, fromB64u, hashHex, sign, verify, type Identity } from '../world/crypto'
import type { SlotSize } from '../world/building'
import type { CustomAsset, Facing } from '../world/types'

/**
 * An office ("room") is a self-contained, signed package. It travels inside
 * share links and between peers; anyone can verify it came from its owner.
 * Coordinates are local to the room (0,0 = top-left tile inside the office).
 * Newer versions (higher `ver`) from the same owner + roomId replace older ones.
 */
export interface RoomThing { id: string; item: string; x: number; y: number; f: Facing; cfg?: any; ox?: number; oy?: number }
export interface RoomZone { id: string; name: string; x: number; y: number; w: number; h: number }
export interface RoomContent {
  v: 1
  owner: string        // owner's public key
  ownerName: string
  roomId: string
  ver: number
  name: string
  size: SlotSize
  floorStyle: string   // theme id for the office floor
  things: RoomThing[]
  zones: RoomZone[]
  objects: any[]       // phase 4: interactables (portals, whiteboards, TVs…)
  code: any | null     // phase 5: sandboxed room code
  assets?: CustomAsset[] // imported sprites used in this office
}
export interface RoomPackage extends RoomContent { sig: string }

export const pkgKey = (p: { owner: string; roomId: string }) => `${p.owner}:${p.roomId}`

export async function signPackage(me: Identity, c: RoomContent): Promise<RoomPackage> {
  return { ...c, sig: await sign(me, canonical(c)) }
}

export async function verifyPackage(p: RoomPackage): Promise<boolean> {
  if (!p || p.v !== 1 || typeof p.sig !== 'string' || typeof p.owner !== 'string') return false
  if (!Array.isArray(p.things) || !Array.isArray(p.zones) || !['M', 'S'].includes(p.size)) return false
  const { sig, ...content } = p
  return verify(p.owner, canonical(content), sig)
}

export const packageHash = (p: RoomPackage) => hashHex(canonical(p)).slice(0, 16)

// ---------------------------------------------------------------- links
async function deflate(s: string) {
  const cs = new Blob([s]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(cs).arrayBuffer())
}
async function inflate(b: Uint8Array) {
  const ds = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(ds).text()
}

/** The share-link token: the whole signed package, compressed, in the URL fragment. */
export async function packageToToken(p: RoomPackage) { return b64u(await deflate(JSON.stringify(p))) }
export async function tokenToPackage(t: string): Promise<RoomPackage | null> {
  try {
    const p = JSON.parse(await inflate(fromB64u(t))) as RoomPackage
    return (await verifyPackage(p)) ? p : null
  } catch { return null }
}

// ---------------------------------------------------------------- local store (IndexedDB)
const DB = 'pixel-office-rooms'
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('pkgs')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
export async function storePut(p: RoomPackage) {
  try {
    const d = await db()
    await new Promise<void>((res, rej) => {
      const tx = d.transaction('pkgs', 'readwrite')
      tx.objectStore('pkgs').put(p, pkgKey(p))
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error)
    })
  } catch { /* private mode: memory only */ }
}
export async function storeAll(): Promise<RoomPackage[]> {
  try {
    const d = await db()
    return await new Promise((res, rej) => {
      const r = d.transaction('pkgs').objectStore('pkgs').getAll()
      r.onsuccess = () => res(r.result as RoomPackage[]); r.onerror = () => rej(r.error)
    })
  } catch { return [] }
}
