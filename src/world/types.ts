export type Facing = 'S' | 'E' | 'N' | 'W'
export const FACINGS: Facing[] = ['S', 'E', 'N', 'W']

export interface ItemView { frame: string; w: number; d: number; px: [number, number] }
export interface ItemDef {
  id: string            // "office/desk"
  item: string          // "desk"
  label: string
  height: number
  flat: boolean         // rugs & ponds: walkable, drawn under everything
  views: Record<Facing, ItemView>
}
export interface ThemeDef { label: string; atlas: string; items: ItemDef[]; floors: string[]; walls: string[] }
export interface Manifest {
  tile: number
  facings: Facing[]
  themes: Record<string, ThemeDef>
  avatars: { presets: { id: string; name: string }[]; frameSize: [number, number]; origin: [number, number]; walkFrames: number }
}

/** A placed piece of furniture, as stored in the shared world doc. */
export interface Placed { item: string; x: number; y: number; f: Facing; by: string }

/** What each peer broadcasts about itself ~10x/second while moving. */
export interface Presence { x: number; y: number; f: Facing; m: boolean; a: string; n: string }
