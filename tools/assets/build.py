"""Build all pixel-art assets.

    python tools/assets/build.py            # -> public/assets/
    python tools/assets/build.py --preview  # also writes preview sheets to tools/assets/preview/

Output per theme: <theme>.png + <theme>.json (Phaser JSON-hash atlas).
Plus manifest.json describing every item: label, footprint per facing, frame names.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from voxel import FACINGS, Model, footprint_tiles  # noqa: E402
from themes import THEMES  # noqa: E402
from models import SHARED, SPECIALS, LABELS, LABEL_OVERRIDES  # noqa: E402
from avatars import build_avatars  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "assets"
PREVIEW = Path(__file__).parent / "preview"
TILE = 16


def pack(frames: dict[str, Image.Image], width=512) -> tuple[Image.Image, dict]:
    """Shelf packer with 1px padding. Returns sheet + Phaser JSON-hash frames."""
    items = sorted(frames.items(), key=lambda kv: -kv[1].height)
    x = y = shelf_h = 0
    pos = {}
    for name, im in items:
        if x + im.width > width:
            x, y, shelf_h = 0, y + shelf_h + 1, 0
        pos[name] = (x, y)
        x += im.width + 1
        shelf_h = max(shelf_h, im.height)
    H = y + shelf_h
    H = 1 << (H - 1).bit_length()
    sheet = Image.new("RGBA", (width, H))
    out = {}
    for name, im in items:
        px, py = pos[name]
        sheet.alpha_composite(im, (px, py))
        out[name] = {"frame": {"x": px, "y": py, "w": im.width, "h": im.height}, "rotated": False, "trimmed": False,
                     "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
                     "sourceSize": {"w": im.width, "h": im.height}}
    return sheet, out


def floor_tiles(theme: dict) -> dict[str, Image.Image]:
    pal = theme["palette"]
    tiles = {}
    for i, mat in enumerate(theme["floor"]):
        for v in range(2):
            m = Model(TILE, TILE, 1)
            m.box(0, 0, 0, TILE, TILE, 1, mat)
            m.texture(pal, seed=100 + v)
            g, det, alt = m.grid, m.detail, m.alt
            img = Image.new("RGBA", (TILE, TILE))
            mt = pal[mat]
            for x in range(TILE):
                for y in range(TILE):
                    shade = 2 + int(det[x, y, 0])
                    img.putpixel((x, y), mt.rgb(shade, int(alt[x, y, 0])) + (255,))
            tiles[f"floor{i}_{v}"] = img
    return tiles


def wall_tiles(theme: dict) -> dict[str, Image.Image]:
    """wall_tall: 16x(16+32) block for back/side walls; wall_low: south wall cap."""
    pal = dict(theme["palette"])
    pal["__wall"] = theme["wall"]
    from voxel import Material
    pal["__cap"] = Material(["#121118", "#1c1a24", "#26232f", "#302c3a"])
    trim = theme["wall_trim"]
    out = {}
    for name, hgt in (("wall_tall", 32), ("wall_low", 6)):
        m = Model(TILE, TILE, hgt)
        m.box(0, 0, 0, TILE, TILE, hgt, "__wall")
        if hgt > 8:
            m.box(0, 0, 0, TILE, TILE, 3, trim)
            m.box(0, 0, hgt - 2, TILE, TILE, hgt, "__cap")
        else:
            m.box(0, 0, hgt - 2, TILE, TILE, hgt, "__cap")
        m.texture(pal)
        img = m.render("S", pal)
        out[name] = img
    return out


def build(preview: bool):
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"tile": TILE, "facings": FACINGS, "themes": {}}
    for tid, theme in THEMES.items():
        pal = theme["palette"]
        frames: dict[str, Image.Image] = {}
        items = []
        builders = {**SHARED, **SPECIALS.get(tid, {})}
        for iid, fn in builders.items():
            m: Model = fn(tid)
            assert m.w % TILE == 0 and m.d % TILE == 0, (tid, iid)
            m.texture(pal, seed=hash(iid) & 0xffff)
            views = {}
            for f in FACINGS:
                im = m.render(f, pal)
                name = f"{iid}_{f}"
                frames[name] = im
                fw, fd = footprint_tiles(m.w, m.d, f)
                views[f] = {"frame": name, "w": fw, "d": fd, "px": [im.width, im.height]}
            items.append({"id": f"{tid}/{iid}", "item": iid,
                          "label": LABEL_OVERRIDES.get((tid, iid), LABELS[iid]),
                          "height": m.h, "flat": m.h <= 3, "views": views})
        frames.update(floor_tiles(theme))
        frames.update(wall_tiles(theme))
        sheet, fr = pack(frames)
        sheet.save(OUT / f"{tid}.png")
        (OUT / f"{tid}.json").write_text(json.dumps({"frames": fr, "meta": {
            "image": f"{tid}.png", "size": {"w": sheet.width, "h": sheet.height}, "scale": "1",
            "app": "pixel-office voxel builder"}}, indent=1))
        manifest["themes"][tid] = {"label": theme["label"], "atlas": tid, "items": items,
                                   "floors": sorted(k for k in frames if k.startswith("floor")),
                                   "walls": ["wall_tall", "wall_low"]}
        print(f"{tid:8s} {len(items):2d} items, atlas {sheet.width}x{sheet.height}")
        if preview:
            PREVIEW.mkdir(exist_ok=True)
            preview_sheet(tid, items, frames).save(PREVIEW / f"{tid}.png")

    # themes drawn in Aseprite (tools/aseprite/draw_layouts.lua)
    from pack_aseprite import themes as aseprite_themes
    manifest["themes"].update(aseprite_themes())

    av_sheet, av_json, av_meta = build_avatars()
    av_sheet.save(OUT / "avatars.png")
    (OUT / "avatars.json").write_text(json.dumps({"frames": av_json, "meta": {
        "image": "avatars.png", "size": {"w": av_sheet.width, "h": av_sheet.height}, "scale": "1"}}, indent=1))
    manifest["avatars"] = av_meta
    if preview:
        av_sheet.resize((av_sheet.width * 3, av_sheet.height * 3), Image.NEAREST).save(PREVIEW / "avatars.png")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print("avatars", len(av_meta["presets"]), "presets")


def preview_sheet(tid, items, frames, scale=3) -> Image.Image:
    """Rows of items, S E N W across, on a checker floor."""
    rows = []
    for it in items:
        ims = [frames[it["views"][f]["frame"]] for f in FACINGS]
        rows.append(ims)
    cell_w = max(im.width for r in rows for im in r) + 12
    row_h = [max(im.height for im in r) + 10 for r in rows]
    cols = 2  # two items per line
    lines = [rows[i:i + cols] for i in range(0, len(rows), cols)]
    W = cols * (cell_w * 4 + 20)
    H = sum(max(row_h[i * cols + j] for j in range(len(l))) for i, l in enumerate(lines))
    img = Image.new("RGBA", (W, H), (38, 36, 46, 255))
    y = 0
    for li, line in enumerate(lines):
        lh = max(row_h[li * cols + j] for j in range(len(line)))
        for j, r in enumerate(line):
            for k, im in enumerate(r):
                x = j * (cell_w * 4 + 20) + k * cell_w + 6
                img.alpha_composite(im, (x, y + lh - im.height - 4))
        y += lh
    return img.resize((W * scale, H * scale), Image.NEAREST)


if __name__ == "__main__":
    build("--preview" in sys.argv)
