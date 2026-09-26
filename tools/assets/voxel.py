"""Tiny voxel -> 3/4-view pixel-art renderer.

Model space: x = right, y = toward the camera (south), z = up. 1 voxel = 1 px,
16 voxels = 1 tile. A model's "front" faces +y (south). Each model is rendered
four times (S, E, N, W) by rotating the voxel grid about the vertical axis.

Projection (oblique 3/4, like Stardew/Gather): screen_x = x,
screen_y = y - z. Each voxel shows a 1 px top face and a 1 px front face;
painter's order (y asc, z asc) resolves occlusion exactly.
"""
from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

FACINGS = ["S", "E", "N", "W"]
# np.rot90 k per facing (axes x->y). S = as authored; E = front turned to +x.
_ROT_K = {"S": 0, "E": -1, "N": 2, "W": 1}


def hexrgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore


def h01(*vals: int) -> float:
    """Deterministic hash of ints -> [0, 1)."""
    s = ",".join(map(str, vals)).encode()
    return int.from_bytes(hashlib.blake2s(s, digest_size=4).digest(), "big") / 2**32


@dataclass
class Material:
    """A 4-step ramp (dark -> light). `tex` adds per-voxel detail in model space."""
    ramp: list[str]
    tex: str = "flat"          # flat | planks_x | planks_y | noise | dither | stripes_z | books | leaf | grain_z
    emissive: bool = False     # ignores lighting, never outlined darker than ramp[1]
    multi: list[list[str]] | None = None  # for 'books'/'multi': alternative ramps

    def rgb(self, i: int, alt: int = 0) -> tuple[int, int, int]:
        ramp = self.multi[alt % len(self.multi)] if self.multi else self.ramp
        return hexrgb(ramp[max(0, min(3, i))])


@dataclass
class Model:
    w: int
    d: int
    h: int
    grid: np.ndarray = field(init=False)      # material index, 0 = empty
    detail: np.ndarray = field(init=False)    # per-voxel shade offset -1/0/+1
    alt: np.ndarray = field(init=False)       # per-voxel alt ramp index
    mats: list[str] = field(default_factory=lambda: [""])

    def __post_init__(self):
        self.grid = np.zeros((self.w, self.d, self.h), np.int16)
        self.detail = np.zeros((self.w, self.d, self.h), np.int8)
        self.alt = np.zeros((self.w, self.d, self.h), np.int16)

    # --- building ---------------------------------------------------------
    def _mid(self, mat: str) -> int:
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def box(self, x0, y0, z0, x1, y1, z1, mat: str):
        """Fill [x0,x1) x [y0,y1) x [z0,z1)."""
        x0, y0, z0 = max(0, x0), max(0, y0), max(0, z0)
        x1, y1, z1 = min(self.w, x1), min(self.d, y1), min(self.h, z1)
        if x1 <= x0 or y1 <= y0 or z1 <= z0:
            return
        self.grid[x0:x1, y0:y1, z0:z1] = self._mid(mat)

    def clear(self, x0, y0, z0, x1, y1, z1):
        self.grid[max(0, x0):x1, max(0, y0):y1, max(0, z0):z1] = 0

    def cyl(self, cx, cy, r, z0, z1, mat: str, r_top: float | None = None):
        """Vertical cylinder/cone centred on (cx, cy) (floats ok)."""
        mid = self._mid(mat)
        for z in range(max(0, z0), min(self.h, z1)):
            t = 0 if z1 - z0 <= 1 else (z - z0) / (z1 - z0 - 1)
            rr = r if r_top is None else r + (r_top - r) * t
            for x in range(self.w):
                for y in range(self.d):
                    if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rr * rr:
                        self.grid[x, y, z] = mid

    def blob(self, cx, cy, cz, rx, ry, rz, mat: str, seed=0, rough=0.25):
        """Lumpy ellipsoid (foliage, cushions)."""
        mid = self._mid(mat)
        for x in range(self.w):
            for y in range(self.d):
                for z in range(self.h):
                    v = ((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 + ((z + .5 - cz) / rz) ** 2
                    if v <= 1 + rough * (h01(seed, x // 2, y // 2, z // 2) - .5):
                        self.grid[x, y, z] = mid

    def set(self, x, y, z, mat: str):
        if 0 <= x < self.w and 0 <= y < self.d and 0 <= z < self.h:
            self.grid[x, y, z] = self._mid(mat)

    # --- texturing (model space, so detail rotates with the object) --------
    def texture(self, palette: dict[str, Material], seed: int = 0):
        xs, ys, zs = np.nonzero(self.grid)
        for x, y, z in zip(xs, ys, zs):
            m = palette[self.mats[self.grid[x, y, z]]]
            d = 0
            if m.tex == "planks_x":      # boards run along x, seams every 4 in y
                d = -1 if y % 4 == 3 else (1 if h01(seed, x // 7, y // 4) > .8 else 0)
            elif m.tex == "planks_y":
                d = -1 if x % 4 == 3 else (1 if h01(seed, x // 4, y // 7) > .8 else 0)
            elif m.tex == "grain_z":     # vertical wood grain on fronts
                d = -1 if (x + y) % 5 == 0 and h01(seed, x, y, z // 3) > .4 else 0
            elif m.tex == "noise":
                r = h01(seed, x, y, z)
                d = -1 if r < .15 else (1 if r > .88 else 0)
            elif m.tex == "dither":
                d = -1 if (x + y + z) % 2 == 0 and h01(seed, x // 2, y // 2, z // 2) > .5 else 0
            elif m.tex == "stripes_z":
                d = -1 if z % 3 == 0 else 0
            elif m.tex == "leaf":
                r = h01(seed, x, y, z)
                d = -1 if r < .3 else (1 if r > .75 else 0)
            elif m.tex == "books":       # each book = 1-2 px wide column, own colour and height
                bx = x + y  # works for shelves facing either way
                self.alt[x, y, z] = int(h01(seed, bx // 2) * 97)
                d = 1 if bx % 2 == 0 else 0
            elif m.tex == "multi":
                self.alt[x, y, z] = int(h01(seed, x // 3, y // 3, z // 3) * 97)
            self.detail[x, y, z] = d

    # --- rendering ---------------------------------------------------------
    def rotated(self, facing: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        k = _ROT_K[facing]
        return (np.rot90(self.grid, k, axes=(0, 1)),
                np.rot90(self.detail, k, axes=(0, 1)),
                np.rot90(self.alt, k, axes=(0, 1)))

    def render(self, facing: str, palette: dict[str, Material]) -> Image.Image:
        g, det, alt = self.rotated(facing)
        W, D, H = g.shape
        img = np.zeros((D + H, W, 4), np.uint8)
        src = np.full((D + H, W, 3), -99, np.int32)   # voxel coords per pixel
        face = np.zeros((D + H, W), np.int8)          # 1 top, 2 front
        matbuf = np.zeros((D + H, W), np.int16)
        altbuf = np.zeros((D + H, W), np.int16)
        xs, ys, zs = np.nonzero(g)
        order = np.lexsort((zs, ys))  # y asc, then z asc
        for i in order:
            x, y, z = int(xs[i]), int(ys[i]), int(zs[i])
            mi = int(g[x, y, z]); m = palette[self.mats[mi]]; dd = int(det[x, y, z]); a = int(alt[x, y, z])
            top_open = z + 1 >= H or g[x, y, z + 1] == 0
            front_open = y + 1 >= D or g[x, y + 1, z] == 0
            # top face
            ty = y - z + H - 1
            if m.emissive:
                tshade, fshade = 3, 2
            else:
                tshade, fshade = 3, 2
                # soft light from the left: right-side edge columns a touch darker
                if x + 1 < W and g[x + 1, y, z] == 0 and not (x - 1 >= 0 and g[x - 1, y, z] == 0):
                    fshade = 1
            if top_open:
                img[ty, x, :3] = m.rgb(tshade + min(0, dd) + (1 if dd > 0 and tshade < 3 else 0), a)
                img[ty, x, 3] = 255
                src[ty, x] = (x, y, z); face[ty, x] = 1; matbuf[ty, x] = mi; altbuf[ty, x] = a
            fy = y - z + H
            if front_open:
                # ambient occlusion: front faces near the floor / under overhangs darker
                ao = 0
                if not m.emissive and (z == 0 or (z + 1 < H and g[x, min(D - 1, y + 1), z + 1] != 0 and y + 1 < D)):
                    ao = -1
                img[fy, x, :3] = m.rgb(fshade + dd + ao, a)
                img[fy, x, 3] = 255
                src[fy, x] = (x, y, z); face[fy, x] = 2; matbuf[fy, x] = mi; altbuf[fy, x] = a

        # contour lines where neighbouring pixels come from non-adjacent voxels
        out = img.copy()
        Hh, Ww = face.shape
        for py in range(Hh):
            for px in range(Ww):
                if img[py, px, 3] == 0:
                    continue
                m = palette[self.mats[matbuf[py, px]]]
                a = int(altbuf[py, px])
                # silhouette outline (inside edge)
                edge = False
                for qy, qx in ((py - 1, px), (py + 1, px), (py, px - 1), (py, px + 1)):
                    if not (0 <= qy < Hh and 0 <= qx < Ww) or img[qy, qx, 3] == 0:
                        edge = True
                        break
                if edge:
                    out[py, px, :3] = m.rgb(1 if m.emissive else 0, a)
                    continue
                # depth discontinuity against the pixel above / to the left
                p = src[py, px]
                for qy, qx in ((py - 1, px), (py, px - 1)):
                    q = src[qy, qx]
                    dist = abs(int(p[0]) - int(q[0])) + abs(int(p[1]) - int(q[1])) + abs(int(p[2]) - int(q[2]))
                    nearer = (p[1] - p[2]) >= (q[1] - q[2])
                    if dist > 2 and nearer and matbuf[qy, qx] != matbuf[py, px] or dist > 3 and nearer:
                        if not m.emissive:
                            out[py, px, :3] = m.rgb(max(0, (1 if face[py, px] == 1 else 0)), a)
                        break
        return Image.fromarray(out, "RGBA")


def footprint_tiles(w: int, d: int, facing: str) -> tuple[int, int]:
    tw, td = math.ceil(w / 16), math.ceil(d / 16)
    return (td, tw) if facing in ("E", "W") else (tw, td)
