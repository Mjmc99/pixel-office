/**
 * A stable user id that survives reloads (the transport's peer id changes
 * every session). Phase 2 replaces this with an Ed25519 keypair whose public
 * key is the id, and world ownership becomes a signed entry peers verify.
 */
export function userId(): string {
  const fresh = () => 'u' + Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
  try {
    let id = localStorage.getItem('po:uid')
    if (!id) { id = fresh(); localStorage.setItem('po:uid', id) }
    return id
  } catch {
    return fresh()
  }
}
