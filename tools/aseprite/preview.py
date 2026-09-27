"""Preview sheet for a drawn theme: every piece in S E N W on its own floor tiles.

    python tools/aseprite/preview.py starship [out.png]
"""
import json
import sys
from pathlib import Path

from PIL import Image

ART = Path(__file__).parent / "art"


def sheet(tid: str, scale=3) -> Image.Image:
    d = ART / tid
    meta = json.loads((d / "meta.json").read_text())
    floor = [Image.open(d / f"{f}.png").convert("RGBA") for f in meta["floors"]]
    wall = Image.open(d / "wall_tall.png").convert("RGBA")
    rows = [[Image.open(d / f"{it['views'][f]['frame']}.png").convert("RGBA") for f in "SENW"] for it in meta["items"]]
    cw = max(im.width for r in rows for im in r) + 16
    cols = 2
    lines = [rows[i:i + cols] for i in range(0, len(rows), cols)]
    lh = [max(im.height for r in l for im in r) + 20 for l in lines]
    W, H = cols * (cw * 4 + 16), sum(lh) + 64
    img = Image.new("RGBA", (W, H), (30, 28, 38, 255))
    for y in range(0, H, 16):          # floor
        for x in range(0, W, 16):
            img.alpha_composite(floor[((x // 16) * 7 + (y // 16) * 13) % 11 == 0], (x, y))
    for x in range(0, W, 16):          # a strip of wall on top
        img.alpha_composite(wall, (x, 0))
    y = 48
    for li, l in enumerate(lines):
        for j, r in enumerate(l):
            for k, im in enumerate(r):
                img.alpha_composite(im, (j * (cw * 4 + 16) + k * cw + 8, y + lh[li] - im.height - 8))
        y += lh[li]
    return img.resize((W * scale, H * scale), Image.NEAREST)


if __name__ == "__main__":
    tid = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else f"/tmp/{tid}-preview.png"
    sheet(tid).save(out)
    print(out)
