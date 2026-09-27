"""Pack the Aseprite-drawn themes into game atlases.

    python tools/assets/pack_aseprite.py

Reads tools/aseprite/art/<theme>/ (PNG facings + meta.json written by
tools/aseprite/draw_layouts.lua) and writes public/assets/<theme>.png/.json,
then adds or updates those themes in public/assets/manifest.json. The voxel
themes in the manifest are left alone, so this is safe to run on its own.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from build import OUT, pack  # noqa: E402

ART = Path(__file__).resolve().parents[1] / "aseprite" / "art"


def pack_theme(d: Path) -> dict:
    meta = json.loads((d / "meta.json").read_text())
    tid = meta["id"]
    names = [it["views"][f]["frame"] for it in meta["items"] for f in "SENW"] + meta["floors"] + meta["walls"]
    frames = {n: Image.open(d / f"{n}.png").convert("RGBA") for n in names}
    # a facing exported from the .aseprite file is padded to the sprite's canvas
    # (anchored bottom-left); crop it back to the size the game expects
    for it in meta["items"]:
        for v in it["views"].values():
            im, (w, h) = frames[v["frame"]], v["px"]
            if im.size != (w, h):
                frames[v["frame"]] = im.crop((0, im.height - h, w, im.height))
    sheet, fr = pack(frames)
    sheet.save(OUT / f"{tid}.png")
    (OUT / f"{tid}.json").write_text(json.dumps({"frames": fr, "meta": {
        "image": f"{tid}.png", "size": {"w": sheet.width, "h": sheet.height}, "scale": "1",
        "app": "Aseprite (tools/aseprite/draw_layouts.lua)"}}, indent=1))
    print(f"{tid:10s} {len(meta['items']):2d} items, atlas {sheet.width}x{sheet.height}")
    return {"label": meta["label"], "atlas": tid, "items": meta["items"], "floors": meta["floors"], "walls": meta["walls"]}


def themes() -> dict[str, dict]:
    return {d.name: pack_theme(d) for d in sorted(ART.iterdir()) if (d / "meta.json").exists()} if ART.exists() else {}


if __name__ == "__main__":
    mf = OUT / "manifest.json"
    manifest = json.loads(mf.read_text())
    manifest["themes"].update(themes())
    mf.write_text(json.dumps(manifest, indent=1))
