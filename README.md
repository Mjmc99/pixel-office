# Pixel Office

A peer-to-peer, pixel-art virtual office in the spirit of Gather. People walk around a
3/4-view world, chat, and decorate rooms together. There is **no game server**: peers find
each other through public Nostr relays and then talk directly over WebRTC.

This is **phase 0** of the build plan: one room, movement, presence, chat, and
multiplayer decorating with 60+ furniture pieces across 5 themes, each in 4 facings.

## Run it

**Windows:** double-click `play.cmd`. It installs Node.js if you don't have it, then opens
the game at <http://localhost:5173>. Open the same URL (including the `#w=…` part) in a
second tab and you'll see two players.

**Any OS:**

```sh
npm install
npm run dev          # http://localhost:5173
```

Add `?net=local` to the URL to use the offline, same-browser transport (no network at all).

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk |
| Enter | Chat (bubble over your head) |
| B | Toggle decorate mode |
| R / Shift+R | Rotate the item you're placing, or the furniture under the cursor |
| Click | Place, or pick up furniture to move it |
| Right-click / Delete | Remove furniture under the cursor, or cancel placing |
| Esc | Cancel / leave decorate mode |

*Copy invite link* shares the world. The part after `#` holds the world id and a secret
that encrypts signaling, and it never reaches any web server.

## How it works

```
src/
  net/transport.ts    Transport interface (peers + named channels)
  net/trystero.ts     P2P transport: Trystero over Nostr relays, WebRTC data channels
  net/local.ts        BroadcastChannel transport for offline dev and tests
  net/sync.ts         Yjs document sync over any transport + IndexedDB cache
  world/room.ts       Room geometry, footprints, placement rules, starter layout
  scenes/WorldScene.ts  Phaser scene: rendering, depth sorting, movement, decorate mode
  ui/hud.ts           DOM overlay: world card, identity, palette, chat
tools/assets/         Voxel -> pixel-art generator for all furniture, floors, walls, avatars
tests/                Playwright tests (two peers in one browser)
```

- **Presence** (position, facing, walking, avatar, name) is broadcast about 10 times a second
  while you move, with a 1 Hz heartbeat. Remote avatars are smoothed on arrival.
- **Furniture and room style** live in a Yjs CRDT (`decor`, `room` maps). Edits merge on
  every peer; a newcomer receives the full document when they connect, and each visitor
  caches the world in IndexedDB.

## Art pipeline

Every piece is a small voxel model (`tools/assets/models.py`) rendered in oblique 3/4 view
by `tools/assets/voxel.py`, which gives shading, outlines, contour lines and material
textures. Rotating the model about its vertical axis gives the S/E/N/W views, so
footprints rotate correctly (a 2×1 desk becomes 1×2).

```sh
pip install pillow numpy
npm run assets       # rebuilds public/assets/* and preview sheets in tools/assets/preview/
```

![All assets in 4 facings](docs/asset-catalog.png)

Themes: Modern Office, Cozy Cabin, Sci-Fi Lab, Zen Garden, Retro Arcade (`themes.py`
palettes). To add a piece, write a builder in `models.py` and register it in `SHARED` or
`SPECIALS`. Output PNGs open fine in Aseprite for hand touch-ups.

## Test

```sh
npx playwright install chromium
npm test
```

## Put it online (free)

1. Create a GitHub repo and push this folder to `main`.
2. In the repo: **Settings > Pages > Source: GitHub Actions**.
3. Every push runs the tests and deploys to `https://<you>.github.io/<repo>/`. Send friends
   that URL with your `#w=…` invite.

The game has to be served over HTTPS (or localhost) because browser crypto and WebRTC
require it. That's why friends on other networks need the Pages URL, not your PC's IP.

## Next (phase 1)

Proximity voice and video: room-wide calls, distance falloff in common areas, and
mute and camera controls.
