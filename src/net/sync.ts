import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import type { Transport } from './transport'

/**
 * Keeps a Yjs document in sync across peers with no server:
 *  - local edits are broadcast as incremental updates,
 *  - a newly joined peer gets our full state (and sends us theirs),
 *  - the doc is cached in IndexedDB so a world survives closing every tab.
 * CRDT merging means order and duplicates don't matter.
 */
export class DocSync {
  readonly doc = new Y.Doc()
  private persistence?: IndexeddbPersistence

  constructor(net: Transport, worldId: string) {
    const ch = net.channel<Uint8Array>('y')
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'remote') ch.send(update)
    })
    ch.onMessage((data) => {
      Y.applyUpdate(this.doc, toBytes(data), 'remote')
    })
    net.onPeerJoin((peerId) => ch.send(Y.encodeStateAsUpdate(this.doc), peerId))
    try {
      this.persistence = new IndexeddbPersistence('pixel-office:' + worldId, this.doc)
    } catch {
      /* private mode etc. — the world still works, just isn't cached */
    }
  }

  whenLoaded(): Promise<void> {
    return this.persistence ? this.persistence.whenSynced.then(() => undefined).catch(() => undefined) : Promise.resolve()
  }
}

function toBytes(d: unknown): Uint8Array {
  if (d instanceof Uint8Array) return d
  if (d instanceof ArrayBuffer) return new Uint8Array(d)
  if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength)
  return new Uint8Array(Object.values(d as Record<string, number>))
}
