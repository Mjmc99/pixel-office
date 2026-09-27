# Pixel Office: notes for Claude

Peer-to-peer, pixel-art virtual office (Phaser 4 + TypeScript + Vite). See README.md for the
architecture. Live at https://mjmc99.github.io/pixel-office/ and deployed by GitHub Actions on
every push to `main` once the tests pass.

## Commands
- `npm run dev`: dev server
- `npm run typecheck`: TypeScript check
- `npm test`: Playwright suite (set `PW_CHROMIUM` to use a preinstalled Chromium)
- `npm run assets`: rebuild furniture/floor/wall atlases (Python: pillow, numpy)

## Pixel art / Aseprite
- Aseprite is installed at C:\aseprite\build\bin\aseprite.exe (built from source).
- Claude does not operate the Aseprite window. It writes Lua scripts using the
  Aseprite scripting API (app, Sprite, Image, Color, etc.), which I run via
  File > Scripts, or headless:
    aseprite.exe -b --script my_script.lua --script-param key=value
- Export sheets headless with:
    aseprite.exe -b input.aseprite --sheet out.png --data out.json --format json-array
- Lua scripts should be self-contained, save their output file explicitly,
  and print a short summary so batch runs show what happened.
- Game assets for pixel-office are NOT made in Aseprite: furniture/floors/walls
  come from tools/assets (Python voxel renderer, `npm run assets`), avatars are
  rendered in-browser from src/avatars/. Style: oblique 3/4 view (screen_y = y - z),
  16 px tiles, every placeable asset in 4 facings (S/E/N/W), 1 px dark outline.
- Hand-made sprites go in through the in-game Custom tab: PNG, 1 frame or
  4 frames laid out S/E/N/W, 30 KB max.
