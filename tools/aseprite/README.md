# Aseprite art: floor layouts

The four themed floor layouts (Starship, Submarine, Neon Apartment, Adventurer's Hall)
are drawn by Aseprite Lua scripts. The office/cabin/sci-fi/zen/arcade furniture still
comes from the Python voxel renderer in `tools/assets/`, and both share one look:
oblique 3/4 view, 16 px tiles, 4 facings (S, E, N, W), 1 px dark outline.

```
tools/aseprite/
  draw_layouts.lua     entry point: draws every theme
  lib/kit.lua          drawing kit: boxes/cylinders/blobs -> shaded pixel art in 4 facings
  themes/<theme>.lua   one file per theme: palette, floor tiles, walls, and each piece
  art/<theme>/         output: <piece>.aseprite (frames tagged S E N W), <piece>_<F>.png,
                       floor*.png, wall_*.png, tiles.aseprite, meta.json
  draw.cmd             Windows: run Aseprite headless, then pack into public/assets/
  fake_aseprite.py     runs the scripts without Aseprite (PNGs only), for CI/previews
  preview.py           preview sheet of a theme
```

## Redraw

Windows, with Aseprite at `C:\aseprite\build\bin\aseprite.exe`:

```
tools\aseprite\draw.cmd            (all themes)
tools\aseprite\draw.cmd tavern     (one theme)
```

That runs `aseprite.exe -b --script tools\aseprite\draw_layouts.lua`, then
`python tools/assets/pack_aseprite.py`, which writes `public/assets/<theme>.png/.json`
and adds the themes to `manifest.json`. You can also run the script from
Aseprite's File > Scripts menu.

## Add or change a piece

Pieces are authored facing south (front toward the camera): x = right, y = toward
the camera, z = up, 1 voxel = 1 px. Width and depth must be multiples of 16.

```lua
th:item("barrel", "Barrel", function()
  local m = K.model(16, 16, 20)            -- 1x1 tile, 20 px tall
  m:cyl(8, 8.5, 6, 0, 20, "oak_dark")     -- cx, cy, r, z0, z1, material
  m:cyl(8, 8.5, 6.2, 2, 3, "iron")        -- a hoop
  return m
end)
```

Shapes: `box`, `clear`, `cyl` (vertical, optional cone), `cylx`/`cyly` (horizontal),
`blob` (lumpy ellipsoid), `set` (one voxel). Materials are 4-step colour ramps with an
optional texture (`planks_x`, `noise`, `dither`, `rivets`, `bricks`, `panels`, `grate`,
`books`, ...) and `emissive = true` for screens, neon and flames.

Pieces named `tv`, `noteboard`, `portal` or `whiteboard` are interactive in the game
(watch party, sticky notes, teleport, drawing), whatever they look like.

Hand touch-ups: edit `art/<theme>/<piece>.aseprite`, export its tagged frames over the
PNGs, and run the packer (it crops the padded canvas back to each facing's size):

```
aseprite -b tools\aseprite\art\tavern\chest.aseprite --split-tags --save-as tools\aseprite\art\tavern\chest_{tag}.png
python tools\assets\pack_aseprite.py
```

Re-running `draw_layouts.lua` redraws from the script and overwrites touch-ups.

## Without Aseprite

```
pip install lupa pillow
python tools/aseprite/fake_aseprite.py tools/aseprite/draw_layouts.lua
python tools/assets/pack_aseprite.py
```

This stand-in implements just the part of Aseprite's API the kit uses, so the PNGs
match a real run; it doesn't write `.aseprite` files.
