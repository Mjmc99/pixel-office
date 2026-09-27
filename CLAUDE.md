# Pixel Office: notes for Claude

Peer-to-peer, pixel-art virtual office (Phaser 4 + TypeScript + Vite). See README.md for the
architecture. Live at https://mjmc99.github.io/pixel-office/ and deployed by GitHub Actions on
every push to `main` once the tests pass.

## Commands
- `npm run dev`: dev server
- `npm run typecheck`: TypeScript check
- `npm test`: Playwright suite (set `PW_CHROMIUM` to use a preinstalled Chromium)
- `npm run assets`: rebuild furniture/floor/wall atlases (Python: pillow, numpy)

## Deploying updates
- Pushing to `main` is the deploy. `.github/workflows/pages.yml` runs typecheck + the
  Playwright suite, then publishes `dist/` to GitHub Pages. Takes about 8-10 min; the deploy
  job only runs if the tests pass. Visitors get the new version when they refresh.
- Before pushing: `npm run typecheck` and `npm test` locally, commit, `git push origin main`.
- Redeploy without new code: GitHub > Actions > "Test and deploy to GitHub Pages" >
  **Run workflow** (branch `main`), or via the API:
    POST /repos/Mjmc99/pixel-office/actions/workflows/pages.yml/dispatches  {"ref":"main"}
  (needs `Content-Type: application/json`).
- Don't use "Re-run jobs" on a run whose deploy step already uploaded: it fails with
  "Multiple artifacts named github-pages". Start a fresh run instead.
- If CI fails, the failing tests and their errors show as annotations on the run page
  (also readable via GET /repos/Mjmc99/pixel-office/check-runs/{job_id}/annotations).
- Pages must stay enabled with Source = "GitHub Actions" (Settings > Pages), and the repo
  must stay public for free Pages hosting.

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
