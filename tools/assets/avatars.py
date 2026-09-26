"""Voxel avatars: 4 facings x 3 walk frames per preset."""
from __future__ import annotations

import colorsys

from PIL import Image

from voxel import FACINGS, Material, Model


def ramp(hexcol: str) -> list[str]:
    r, g, b = (int(hexcol[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    out = []
    for dl, ds, dh in ((-.28, .05, .03), (-.13, .03, .015), (0, 0, 0), (.12, -.05, -.02)):
        rr, gg, bb = colorsys.hls_to_rgb((h + dh) % 1, max(0, min(1, l + dl)), max(0, min(1, s + ds)))
        out.append("#%02x%02x%02x" % (int(rr * 255), int(gg * 255), int(bb * 255)))
    return out


PRESETS = [
    # name, skin, hair, shirt, pants, hair style
    ("Ada", "#e8b890", "#3a2418", "#3a78c8", "#2e3440", "short"),
    ("Bo", "#8a5a3a", "#16100c", "#d84a3a", "#3a3a48", "buzz"),
    ("Cy", "#f0cca8", "#e8c060", "#44a060", "#4a3a2e", "long"),
    ("Dee", "#b07850", "#6a2a18", "#e8b030", "#24324a", "bun"),
    ("Eli", "#5a3a26", "#0c0a08", "#8a4ac8", "#2a2a30", "short"),
    ("Fox", "#f4d4b8", "#c84a1e", "#2a2a34", "#6a5a48", "long"),
    ("Gus", "#d8a47a", "#8a8a90", "#4ab0b0", "#34343e", "buzz"),
    ("Hana", "#e8c4a0", "#1a1420", "#e86a9a", "#3a3448", "bun"),
]


def avatar_model(style: str, frame: int) -> Model:
    """Chibi proportions: big head, short legs. Front faces +y."""
    m = Model(16, 16, 26)
    lo, ro = {0: (0, 0), 1: (1, -1), 2: (-1, 1)}[frame]
    for x0, off in ((5, lo), (9, ro)):
        m.box(x0, 7 + off, 1, x0 + 2, 9 + off, 6, "pants")
        m.box(x0, 7 + off, 0, x0 + 2, 10 + off, 1, "shoes")
    m.box(4, 6, 6, 12, 10, 13, "shirt")
    for x0, off in ((3, -lo), (12, -ro)):
        m.box(x0, 7 + off, 8, x0 + 1, 9 + off, 13, "shirt")
        m.box(x0, 7 + off, 7, x0 + 1, 9 + off, 8, "skin")
    # head
    m.box(3, 4, 13, 13, 12, 23, "skin")
    for x in (5, 10):
        m.box(x, 11, 16, x + 1, 12, 19, "eyes")
    # hair
    if style == "buzz":
        m.box(3, 4, 22, 13, 12, 24, "hair"); m.box(3, 4, 17, 13, 5, 22, "hair")
        m.box(3, 5, 20, 4, 11, 22, "hair"); m.box(12, 5, 20, 13, 11, 22, "hair")
    else:
        m.box(3, 4, 21, 13, 12, 25, "hair")
        m.box(3, 4, 14, 13, 5, 21, "hair")
        m.box(2, 5, 17, 3, 11, 24, "hair"); m.box(13, 5, 17, 14, 11, 24, "hair")
        m.box(4, 11, 20, 12, 12, 22, "hair")
        m.box(3, 11, 17, 4, 12, 21, "hair"); m.box(12, 11, 17, 13, 12, 21, "hair")
    if style == "long":
        m.box(3, 4, 9, 13, 6, 15, "hair"); m.box(2, 5, 12, 3, 9, 17, "hair"); m.box(13, 5, 12, 14, 9, 17, "hair")
    if style == "bun":
        m.box(6, 5, 24, 10, 9, 26, "hair")
    return m


def build_avatars():
    frames: dict[str, Image.Image] = {}
    presets = []
    for name, skin, hair, shirt, pants, style in PRESETS:
        pal = {"skin": Material(ramp(skin)), "hair": Material(ramp(hair), "dither"),
               "shirt": Material(ramp(shirt)), "pants": Material(ramp(pants)),
               "shoes": Material(["#0c0a0c", "#1a161a", "#2a242a", "#3c343c"]),
               "eyes": Material(["#0c0a10", "#141018", "#1c1822", "#2a2432"])}
        key = name.lower()
        for fr in range(3):
            m = avatar_model(style, fr)
            m.texture(pal, seed=7)
            for f in FACINGS:
                frames[f"{key}_{f}_{fr}"] = m.render(f, pal)
        presets.append({"id": key, "name": name})
    # pack in a grid: rows = presets, cols = 4 facings x 3 frames
    w, h = 16, 42
    sheet = Image.new("RGBA", (w * 12, 1 << ((h * len(PRESETS)) - 1).bit_length()))
    js = {}
    for r, p in enumerate(presets):
        c = 0
        for f in FACINGS:
            for fr in range(3):
                n = f"{p['id']}_{f}_{fr}"
                im = frames[n]
                sheet.alpha_composite(im, (c * w, r * h))
                js[n] = {"frame": {"x": c * w, "y": r * h, "w": im.width, "h": im.height}, "rotated": False,
                         "trimmed": False, "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height},
                         "sourceSize": {"w": im.width, "h": im.height}}
                c += 1
    # feet sit at model y~8.5 -> screen row 8.5 + 26 = 34.5 of 42
    meta = {"presets": presets, "frameSize": [w, h], "origin": [0.5, 34.5 / 42], "walkFrames": 3}
    return sheet, js, meta
