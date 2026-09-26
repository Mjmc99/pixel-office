/**
 * Who hears whom. Pure functions so they're easy to test and reason about.
 *
 * - Private zone (meeting room, focus pod): everyone inside hears everyone
 *   inside at full volume, and nobody outside.
 * - Common area: a proximity bubble. Calls connect within CONNECT px and drop
 *   beyond DISCONNECT px (hysteresis, so standing on the edge doesn't flap).
 *   Volume fades from full at FULL px to silent at CONNECT px.
 */
export interface Zone { id: string; name: string; x: number; y: number; w: number; h: number }
export interface Pos { x: number; y: number }

const T = 16
export const FULL = 1.5 * T
export const CONNECT = 5 * T
export const DISCONNECT = 6.5 * T

/** The zone you're standing in. Zones may nest (a sofa corner inside an office): the smallest wins. */
export function zoneAt(zones: Zone[], p: Pos): Zone | null {
  const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T)
  let best: Zone | null = null
  for (const z of zones) {
    if (tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h && (!best || z.w * z.h < best.w * best.h)) best = z
  }
  return best
}

export interface Hearing { want: boolean; gain: number; pan: number }

export function hearing(zones: Zone[], me: Pos, other: Pos, connected: boolean): Hearing {
  const zm = zoneAt(zones, me), zo = zoneAt(zones, other)
  if (zm || zo) {
    const same = !!zm && zm.id === zo?.id
    return { want: same, gain: same ? 1 : 0, pan: 0 }
  }
  const dx = other.x - me.x
  const d = Math.hypot(dx, other.y - me.y)
  const want = d < CONNECT || (connected && d < DISCONNECT)
  const gain = d <= FULL ? 1 : Math.max(0, 1 - (d - FULL) / (CONNECT - FULL))
  return { want, gain, pan: Math.max(-0.6, Math.min(0.6, dx / CONNECT)) }
}

/** Starter zones for the phase-0/1 room (tile coords). */
export const DEFAULT_ZONES: Zone[] = [
  { id: 'meeting', name: 'Meeting room', x: 13, y: 6, w: 7, h: 6 },
  { id: 'pod', name: 'Focus pod', x: 1, y: 1, w: 6, h: 4 },
]
