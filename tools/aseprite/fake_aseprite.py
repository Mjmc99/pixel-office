"""Run the Aseprite Lua scripts without Aseprite (for CI and quick previews).

    pip install lupa pillow
    python tools/aseprite/fake_aseprite.py tools/aseprite/draw_layouts.lua [only=starship]

Implements just the slice of Aseprite's scripting API that kit.lua uses
(Image, Sprite, Point, ColorMode, app.pixelColor, app.fs, app.params).
PNGs come out pixel-identical to a real Aseprite run; .aseprite files are
not written (open Aseprite for those: see tools/aseprite/README.md).
"""
from __future__ import annotations

import os
import sys

import lupa
from PIL import Image as PImage

L = lupa.LuaRuntime(unpack_returned_tuples=True)


class Img:
    def __init__(self, w, h, *_):
        self.width, self.height = int(w), int(h)
        self.im = PImage.new("RGBA", (self.width, self.height))

    def drawPixel(self, x, y, c):
        c = int(c)
        self.im.putpixel((int(x), int(y)), (c & 255, (c >> 8) & 255, (c >> 16) & 255, (c >> 24) & 255))

    def getPixel(self, x, y):
        r, g, b, a = self.im.getpixel((int(x), int(y)))
        return r | (g << 8) | (b << 16) | (a << 24)

    def saveAs(self, path):
        self.im.save(str(path))


class Obj:
    pass


class Spr:
    def __init__(self, w, h, *_):
        self.layer = Obj(); self.layer.name = ""
        self.layers = L.table_from({1: self.layer})

    def newEmptyFrame(self, i): pass
    def newCel(self, *a): pass
    def newTag(self, a, b):
        t = Obj(); t.name = ""; return t
    def saveAs(self, path): pass  # no .aseprite writer here
    def close(self): pass


def main():
    script = os.path.abspath(sys.argv[1])
    params = dict(a.split("=", 1) for a in sys.argv[2:] if "=" in a)
    g = L.globals()
    g.Image = lambda w, h, *a: Img(w, h)
    g.Sprite = lambda w, h, *a: Spr(w, h)
    g.Point = lambda x, y: (x, y)
    g.ColorMode = L.table_from({"RGB": 0})
    g._params = L.table_from(params)
    g._mkdirs = lambda p: os.makedirs(str(p), exist_ok=True)
    L.execute("""
      app = { pixelColor = {}, fs = {}, params = _params, isUIAvailable = false }
      function app.pixelColor.rgba(r, g, b, a) return r | (g << 8) | (b << 16) | ((a or 255) << 24) end
      function app.fs.joinPath(a, b) return a .. "/" .. b end
      function app.fs.makeAllDirectories(p) _mkdirs(p) end
    """)
    L.execute(f"dofile({script!r})")


if __name__ == "__main__":
    main()
