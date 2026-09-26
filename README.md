# Pixel Office

A peer-to-peer, pixel-art virtual office in the spirit of Gather. People walk around a
3/4-view world, chat, and decorate rooms together. There is **no game server**: peers find
each other through public Nostr relays and then talk directly over WebRTC.

![Three people in a meeting-room call](docs/phase1-call.png)

Built so far:

- **Phase 0**: one room, movement, presence, chat, and multiplayer decorating with 64
  furniture pieces across 5 themes, each in 4 facings.
- **Phase 1**: voice and video. Walk into a **call zone** and you're in a call with everyone
  inside it; walk out and you leave. Outside zones, a **proximity bubble** connects you to
  anyone within about 5 tiles, with volume fading by distance. The world owner draws zones
  (around a couch, a meeting table, a stage) with the zone tool.

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
| M / V | Mic / camera on or off |
| B | Toggle decorate mode |
| R / Shift+R | Rotate the item you're placing, or the furniture under the cursor |
| Click | Place, or pick up furniture to move it |
| Right-click / Delete | Remove furniture under the cursor, or cancel placing |
| Esc | Cancel / leave decorate mode |
| Decorate > **Call zones** (owner) | Drag on the floor to draw a zone; rename or delete it in the list, or right-click it |

*Copy invite link* shares the world. The part after `#` holds the world id and a secret
that encrypts signaling, and it never reaches any web server.

## How it works

```
src/
  net/transport.ts    Transport interface (peers + named channels)
  net/trystero.ts     P2P transport: Trystero over Nostr relays, WebRTC data channels
  net/local.ts        BroadcastChannel transport for offline dev and tests
  net/sync.ts         Yjs document sync over any transport + IndexedDB cache
  media/mesh.ts       One RTCPeerConnection per nearby peer, signaled over the transport
  media/proximity.ts  Zone + distance rules: who hears whom, and how loud
  media/devices.ts    Mic/camera capture, speaking detection
  media/audio.ts      Web Audio mixer: per-voice volume and stereo pan
  media/call.ts       Glue: positions + zones -> calls
  ui/tiles.ts         Video / avatar tiles for everyone you're talking to
  world/identity.ts   Stable per-browser user id (world owner check)
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

**Calls.** Each pair of people who should hear each other gets a direct WebRTC connection
with one audio and one video track. Toggling your mic or camera swaps the track in place, so
nothing renegotiates. The peer with the smaller id always makes the offer (no glare), and
calls connect at 5 tiles and drop at 6.5, so standing on the edge doesn't flicker. Video is
capped at 320×240, 15 fps, ~350 kbps so a 6-person mesh fits a home connection. Calls,
presence and heartbeats run on a timer, not the render loop, so they keep working when
the tab is in the background.

**Zones** live in the shared world doc (`zones` map). Today the world's creator is its
owner, checked by a persistent per-browser id; phase 2 replaces that with signed ownership,
and phase 3 lets room owners draw zones inside their own rooms.

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
npm test             # includes a 4-person video call with fake cameras
```

## Put it online (free)

1. Create a GitHub repo and push this folder to `main`.
2. In the repo: **Settings > Pages > Source: GitHub Actions**.
3. Every push runs the tests and deploys to `https://<you>.github.io/<repo>/`. Send friends
   that URL with your `#w=…` invite.

The game has to be served over HTTPS (or localhost) because browser crypto and WebRTC
require it. That's why friends on other networks need the Pages URL, not your PC's IP.

## Next (phase 2)

The building: keypair identities, a signed governance log (owners, bans, placements),
a floor template with room slots, zones per area, and world invite links that scale past
one room.
