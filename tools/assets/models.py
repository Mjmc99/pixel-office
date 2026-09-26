"""Furniture models. Authored facing SOUTH (front toward +y / the camera).
Model w/d must be multiples of 16 (one tile); content may be inset.
Each builder takes the theme id and returns a Model."""
from voxel import Model


# ---------------------------------------------------------------- shared forms
def desk(t):
    m = Model(32, 16, 16)
    if t == "office":
        m.box(1, 2, 11, 31, 14, 13, "wood")
        m.box(2, 3, 0, 4, 13, 11, "metal"); m.box(28, 3, 0, 30, 13, 11, "metal")
        m.box(4, 4, 5, 28, 5, 11, "metal")
        m.box(20, 9, 6, 27, 13, 11, "white"); m.box(22, 13, 8, 25, 14, 9, "metal")
        # monitor + keyboard
        m.box(11, 4, 13, 21, 5, 16, "metal"); m.box(15, 5, 13, 17, 6, 14, "metal")
        m.box(12, 5, 14, 20, 6, 16, "screen")
        m.box(12, 9, 13, 20, 11, 14, "white")
    elif t == "cabin":
        m.box(1, 2, 10, 31, 14, 13, "wood")
        for x in (2, 27):
            m.box(x, 3, 0, x + 3, 6, 10, "wood_dark"); m.box(x, 10, 0, x + 3, 13, 10, "wood_dark")
        m.box(5, 11, 7, 27, 13, 10, "wood_dark")
        # oil lamp + open book
        m.box(4, 5, 13, 7, 8, 14, "metal_light"); m.box(4, 5, 14, 7, 8, 17, "light")
        m.box(14, 6, 13, 22, 11, 14, "paper")
    elif t == "scifi":
        m.box(1, 3, 11, 31, 13, 13, "white"); m.box(1, 13, 11, 31, 14, 12, "neon")
        m.box(12, 5, 0, 20, 11, 11, "metal"); m.box(10, 4, 0, 22, 12, 1, "metal_light")
        m.box(4, 4, 13, 28, 5, 16, "metal"); m.box(5, 5, 13, 27, 6, 16, "screen")
        m.box(10, 8, 13, 22, 10, 14, "glass")
    elif t == "zen":  # low writing desk
        m.box(2, 3, 5, 30, 13, 7, "wood")
        for x, y in ((3, 4), (27, 4), (3, 10), (27, 10)):
            m.box(x, y, 0, x + 2, y + 2, 5, "wood_dark")
        m.box(8, 5, 7, 16, 11, 8, "paper"); m.box(19, 6, 7, 21, 8, 10, "metal")
    else:  # arcade: gamer desk with RGB strip + two monitors
        m.box(1, 2, 11, 31, 14, 13, "wood_dark"); m.box(1, 14, 11, 31, 15, 12, "neon2")
        m.box(2, 3, 0, 5, 13, 11, "metal"); m.box(27, 3, 0, 30, 13, 11, "metal")
        for x in (6, 17):
            m.box(x, 4, 13, x + 9, 5, 16, "metal"); m.box(x + 1, 5, 14, x + 8, 6, 16, "screen")
        m.box(10, 9, 13, 22, 11, 14, "metal_light")
    return m


def chair(t):
    m = Model(16, 16, 22)
    if t == "office":
        m.box(3, 4, 8, 13, 13, 10, "fabric"); m.box(3, 3, 10, 13, 5, 21, "fabric")
        m.box(2, 7, 10, 3, 12, 13, "metal"); m.box(13, 7, 10, 14, 12, 13, "metal")
        m.box(7, 7, 1, 9, 9, 8, "metal")
        m.box(2, 7, 0, 14, 9, 1, "metal"); m.box(7, 3, 0, 9, 13, 1, "metal")
    elif t == "cabin":
        m.box(3, 5, 7, 13, 13, 9, "wood")
        for x, y in ((3, 5), (11, 5), (3, 11), (11, 11)):
            m.box(x, y, 0, x + 2, y + 2, 7, "wood_dark")
        m.box(3, 5, 9, 5, 7, 20, "wood_dark"); m.box(11, 5, 9, 13, 7, 20, "wood_dark")
        for z in (12, 15, 18):
            m.box(5, 5, z, 11, 6, z + 2, "wood")
        m.box(4, 7, 9, 12, 12, 10, "fabric")
    elif t == "scifi":  # egg pod
        m.blob(8, 8.5, 12, 6, 5.5, 9, "white", seed=3, rough=0)
        m.clear(4, 8, 8, 12, 16, 20)
        m.box(4, 7, 8, 12, 14, 10, "fabric")
        m.box(7, 7, 0, 9, 9, 4, "metal"); m.box(5, 6, 0, 11, 11, 1, "metal")
    elif t == "zen":  # floor cushion (zabuton)
        m.box(2, 3, 0, 14, 14, 3, "fabric2"); m.box(7, 8, 3, 9, 10, 4, "accent")
    else:  # bean bag
        m.blob(8, 9, 4, 6.5, 5.5, 5, "fabric", seed=7, rough=.15)
        m.blob(8, 5, 9, 6, 3, 6, "fabric", seed=8, rough=.15)
    return m


def sofa(t):
    m = Model(32, 16, 18)
    frame, cush = ("wood_dark", "fabric") if t in ("cabin", "zen") else ("metal", "fabric")
    if t == "scifi":
        frame = "white"
    base = 3 if t != "zen" else 0
    m.box(1, 3, base, 31, 14, base + 5, cush)                          # seat base
    m.box(1, 3, base + 5, 31, 7, base + 14, cush)                      # backrest
    m.box(1, 3, base, 4, 14, base + 10, cush); m.box(28, 3, base, 31, 14, base + 10, cush)  # arms
    m.box(4, 7, base + 5, 16, 14, base + 7, cush); m.box(16, 7, base + 5, 28, 14, base + 7, cush)
    m.set(16, 13, base + 6, frame)
    if base:
        for x in (2, 28):
            m.box(x, 4, 0, x + 2, 6, base, frame); m.box(x, 11, 0, x + 2, 13, base, frame)
    if t == "scifi":
        m.box(1, 13, base, 31, 14, base + 1, "neon")
    if t == "arcade":
        m.box(6, 8, base + 7, 11, 12, base + 9, "neon")  # pillow
    if t == "cabin":
        m.box(22, 8, base + 7, 27, 12, base + 12, "fabric2")  # throw pillow
    return m


def bookshelf(t):
    m = Model(16, 16, 30)
    body = {"office": "white", "cabin": "wood", "scifi": "metal", "zen": "wood", "arcade": "wood_dark"}[t]
    m.box(1, 2, 0, 15, 9, 29, body)
    m.clear(2, 3, 2, 14, 9, 28)
    for z in (1, 9, 18, 28):
        m.box(1, 2, z, 15, 9, z + 1, body)
    for i, z0 in enumerate((2, 10, 19)):
        for x in range(2, 14):
            hgt = 5 + int((x * 7 + i * 3) % 3)
            if (x + i) % 9 == 8:
                continue
            m.box(x, 4, z0, x + 1, 9, z0 + hgt, "books")
    if t == "scifi":
        m.box(1, 9, 0, 2, 10, 29, "neon"); m.box(14, 9, 0, 15, 10, 29, "neon")
    return m


def plant(t):
    m = Model(16, 16, 30)
    if t == "office":   # fiddle-leaf fig in concrete pot
        m.cyl(8, 9, 4.2, 0, 8, "pot"); m.cyl(8, 9, 3.5, 7, 8, "soil")
        m.box(7, 8, 8, 9, 10, 16, "wood_dark")
        m.blob(8, 9, 20, 6, 5, 8, "plant", seed=11)
    elif t == "cabin":  # fern in woven basket
        m.cyl(8, 9, 5, 0, 7, "pot"); m.cyl(8, 9, 4.2, 6, 7, "soil")
        m.blob(8, 9, 11, 7, 6, 5, "plant", seed=12, rough=.5)
    elif t == "scifi":  # hydroponic tube
        m.box(3, 5, 0, 13, 13, 3, "metal"); m.box(3, 12, 1, 13, 13, 2, "neon")
        m.cyl(8, 9, 4, 3, 26, "glass"); m.cyl(8, 9, 3, 3, 25, "water")
        m.blob(8, 9, 15, 3, 3, 8, "plant", seed=13, rough=.3)
        m.box(3, 5, 26, 13, 13, 28, "metal")
    elif t == "zen":    # bonsai
        m.box(3, 6, 0, 13, 12, 4, "pot"); m.box(4, 7, 3, 12, 11, 4, "soil")
        m.box(7, 8, 4, 9, 10, 9, "wood_dark"); m.box(8, 8, 8, 11, 10, 10, "wood_dark")
        m.blob(5, 9, 11, 4, 3, 2.5, "plant", seed=14); m.blob(11, 9, 12, 3.5, 3, 2.5, "plant", seed=15)
        m.blob(8, 9, 15, 3, 3, 2.5, "plant", seed=16)
    else:               # cactus
        m.cyl(8, 9, 4, 0, 6, "pot"); m.cyl(8, 9, 3.2, 5, 6, "soil")
        m.cyl(8, 9, 2.4, 6, 22, "plant", r_top=1.8)
        m.box(3, 8, 11, 6, 10, 13, "plant"); m.box(3, 8, 13, 5, 10, 18, "plant")
        m.box(10, 8, 14, 13, 10, 16, "plant"); m.box(11, 8, 16, 13, 10, 20, "plant")
        m.set(8, 10, 21, "neon2")
    return m


def coffee_table(t):
    m = Model(32, 16, 10)
    top = {"office": "glass", "cabin": "wood", "scifi": "white", "zen": "wood_dark", "arcade": "metal"}[t]
    legs = {"office": "metal", "cabin": "wood_dark", "scifi": "metal", "zen": "wood_dark", "arcade": "neon2"}[t]
    m.box(3, 3, 5, 29, 13, 7, top)
    for x, y in ((4, 4), (26, 4), (4, 10), (26, 10)):
        m.box(x, y, 0, x + 2, y + 2, 5, legs)
    if t == "cabin":
        m.box(12, 6, 7, 16, 9, 10, "white"); m.box(17, 7, 7, 22, 10, 8, "paper")  # mug + book
    elif t == "zen":
        m.box(13, 6, 7, 17, 9, 10, "pot"); m.box(19, 7, 7, 21, 9, 9, "white"); m.box(22, 7, 7, 24, 9, 9, "white")
    elif t == "office":
        m.box(8, 6, 7, 16, 11, 8, "paper"); m.box(20, 7, 7, 23, 10, 10, "white")
    elif t == "arcade":
        m.box(9, 6, 7, 17, 10, 8, "metal_light"); m.box(20, 7, 7, 23, 9, 11, "accent")  # controller + soda
    else:
        m.box(10, 5, 7, 22, 11, 8, "neon")
    return m


def lamp(t):
    m = Model(16, 16, 34)
    if t == "zen":  # stone lantern (toro)
        m.box(4, 5, 0, 12, 13, 3, "stone"); m.box(6, 7, 3, 10, 11, 12, "stone")
        m.box(4, 5, 12, 12, 13, 14, "stone"); m.box(5, 6, 14, 11, 12, 20, "stone")
        m.box(6, 12, 15, 10, 13, 19, "light")
        m.box(3, 4, 20, 13, 14, 22, "stone"); m.box(5, 6, 22, 11, 12, 24, "stone"); m.box(7, 8, 24, 9, 10, 26, "stone")
        return m
    pole = {"office": "metal", "cabin": "wood_dark", "scifi": "metal_light", "arcade": "metal"}[t]
    m.cyl(8, 9, 3.5, 0, 2, pole); m.box(7, 8, 2, 9, 10, 24, pole)
    if t == "scifi":
        m.cyl(8, 9, 2, 24, 32, "neon"); m.cyl(8, 9, 3, 32, 33, "metal_light")
    elif t == "arcade":
        m.box(6, 8, 2, 10, 10, 30, "neon2"); m.box(7, 8, 2, 9, 10, 30, "neon")
    else:
        m.cyl(8, 9, 5.5, 22, 30, "light" if t == "cabin" else "white", r_top=3.5)
        m.cyl(8, 9, 3.5, 21, 22, "light")
    return m


def rug(t):
    m = Model(48, 32, 1)
    m.box(1, 2, 0, 47, 30, 1, "rug_border")
    m.box(3, 4, 0, 45, 28, 1, "rug")
    if t in ("cabin", "zen"):
        m.box(6, 7, 0, 42, 8, 1, "rug_border"); m.box(6, 24, 0, 42, 25, 1, "rug_border")
    if t == "arcade":
        for x in range(3, 45):
            for y in range(4, 28):
                if (x // 3 + y // 3) % 2 == 0:
                    m.set(x, y, 0, "wood_dark")
    return m


def tv(t):
    m = Model(32, 16, 26)
    stand = {"office": "wood", "cabin": "wood_dark", "scifi": "metal", "zen": "wood_dark", "arcade": "metal"}[t]
    m.box(2, 3, 0, 30, 11, 8, stand)
    if t != "cabin":
        m.box(4, 11, 2, 15, 11, 6, stand)
    m.box(14, 5, 8, 18, 7, 10, "metal")
    m.box(4, 5, 10, 28, 7, 25, "metal"); m.box(5, 7, 11, 27, 8, 24, "screen" if t != "cabin" else "stone")
    if t == "cabin":  # old radio instead of a TV
        m.clear(4, 5, 10, 28, 8, 25)
        m.box(9, 4, 8, 23, 10, 18, "wood"); m.box(11, 10, 11, 17, 11, 16, "fabric2"); m.box(19, 10, 13, 21, 11, 15, "metal_light")
    return m


def portal(t):
    """Glowing floor pad that teleports you. Flat, so people can stand on it."""
    m = Model(16, 16, 2)
    m.cyl(8, 8, 7, 0, 1, "stone" if t in ("zen", "cabin") else "metal")
    m.cyl(8, 8, 5.5, 0, 2, "neon" if t != "arcade" else "neon2")
    m.cyl(8, 8, 3.5, 1, 2, "light")
    return m


def noteboard(t):
    """Cork board on a stand, covered in sticky notes."""
    m = Model(16, 16, 30)
    frame = {"office": "metal", "cabin": "wood_dark", "scifi": "metal_light", "zen": "wood_dark", "arcade": "metal"}[t]
    m.box(3, 7, 0, 5, 9, 26, frame); m.box(11, 7, 0, 13, 9, 26, frame)
    m.box(2, 6, 0, 6, 10, 1, frame); m.box(10, 6, 0, 14, 10, 1, frame)
    m.box(1, 8, 12, 15, 9, 29, frame)
    m.box(2, 9, 13, 14, 10, 28, "wood")
    for (x, z, c) in ((3, 24, "accent"), (7, 25, "fire"), (10, 23, "neon"), (4, 17, "paper"), (8, 18, "accent"), (11, 16, "paper")):
        m.box(x, 10, z - 2, x + 3, 11, z + 1, c)
    return m


# ---------------------------------------------------------------- theme specials
def whiteboard(t):
    m = Model(32, 16, 32)
    m.box(3, 7, 0, 5, 9, 30, "metal"); m.box(27, 7, 0, 29, 9, 30, "metal")
    m.box(2, 5, 0, 6, 11, 1, "metal"); m.box(26, 5, 0, 30, 11, 1, "metal")
    m.box(4, 8, 12, 28, 9, 30, "metal_light"); m.box(5, 9, 13, 27, 10, 29, "white")
    for x, z, c in ((8, 25, "accent"), (9, 25, "accent"), (10, 24, "accent"), (14, 22, "fabric"), (15, 22, "fabric"),
                    (16, 22, "fabric"), (17, 22, "fabric"), (8, 18, "fabric2"), (9, 18, "fabric2"), (10, 18, "fabric2"),
                    (20, 17, "accent"), (21, 18, "accent"), (22, 19, "accent")):
        m.set(x, 9, z, c)
    m.box(6, 9, 12, 26, 11, 13, "metal")
    return m


def water_cooler(t):
    m = Model(16, 16, 32)
    m.box(4, 5, 0, 12, 12, 18, "white"); m.box(5, 12, 11, 7, 13, 13, "metal"); m.box(9, 12, 11, 11, 13, 13, "accent")
    m.cyl(8, 8.5, 3.8, 18, 30, "water"); m.cyl(8, 8.5, 1.5, 30, 32, "water")
    return m


def filing_cabinet(t):
    m = Model(16, 16, 24)
    m.box(2, 4, 0, 14, 13, 23, "metal_light")
    for z in (2, 9, 16):
        m.box(3, 13, z, 13, 13, z + 5, "metal_light"); m.box(6, 12, z + 3, 10, 14, z + 4, "metal")
    for z in (8, 15):
        m.box(2, 12, z, 14, 13, z + 1, "metal")
    return m


def meeting_table(t):
    m = Model(48, 32, 12)
    m.box(2, 4, 9, 46, 28, 11, "wood"); m.box(3, 5, 9, 45, 27, 10, "wood_dark")
    m.box(20, 12, 0, 28, 20, 9, "metal"); m.box(16, 10, 0, 32, 22, 1, "metal")
    m.box(10, 8, 11, 16, 12, 12, "paper"); m.box(30, 18, 11, 36, 22, 12, "paper"); m.box(22, 14, 11, 26, 18, 12, "screen")
    return m


def fireplace(t):
    m = Model(32, 16, 32)
    m.box(1, 3, 0, 31, 12, 26, "stone"); m.box(0, 3, 24, 32, 13, 27, "wood_dark")
    m.box(6, 9, 0, 26, 12, 16, "metal"); m.clear(8, 10, 1, 24, 12, 14)
    m.box(9, 8, 1, 23, 10, 3, "wood_dark")
    m.blob(16, 10, 5, 6, 1.5, 5, "fire", seed=21, rough=.6)
    m.box(4, 3, 27, 28, 8, 32, "stone")
    m.box(6, 12, 27, 9, 13, 30, "light"); m.box(22, 12, 27, 25, 13, 29, "pot")
    return m


def log_pile(t):
    m = Model(16, 16, 12)
    # logs lie along x; sawn ends show on the left/right sides
    for (y, z, x0, x1) in ((4, 0, 1, 15), (9, 0, 1, 15), (6, 4, 2, 14), (11, 4, 2, 14), (8, 8, 3, 13)):
        m.box(x0, y - 2, z, x1, y + 2, z + 4, "wood_dark")
        m.box(x0, y - 1, z + 1, x0 + 1, y + 1, z + 3, "wood"); m.box(x1 - 1, y - 1, z + 1, x1, y + 1, z + 3, "wood")
    return m


def armchair(t):
    m = Model(16, 16, 20)
    m.box(1, 3, 2, 15, 14, 7, "fabric"); m.box(1, 3, 7, 15, 7, 18, "fabric")
    m.box(1, 3, 2, 3, 14, 12, "fabric"); m.box(13, 3, 2, 15, 14, 12, "fabric")
    m.box(3, 7, 7, 13, 14, 9, "fabric2")
    for x, y in ((2, 4), (12, 4), (2, 12), (12, 12)):
        m.box(x, y, 0, x + 2, y + 1, 2, "wood_dark")
    return m


def server_rack(t):
    m = Model(16, 16, 34)
    m.box(1, 3, 0, 15, 14, 33, "metal")
    for z in range(3, 31, 4):
        m.box(2, 14, z, 14, 14, z + 3, "wood_dark")
        m.box(2, 13, z, 14, 14, z + 3, "metal")
        m.set(3, 14 - 1, z + 1, "neon" if (z // 4) % 3 else "neon2")
        m.set(5, 13, z + 1, "screen")
    m.box(1, 13, 0, 15, 14, 1, "neon")
    return m


def holo_table(t):
    m = Model(32, 32, 26)
    m.cyl(16, 16, 12, 0, 8, "metal", r_top=10); m.cyl(16, 16, 11, 8, 9, "neon")
    m.cyl(16, 16, 10, 9, 10, "white")
    m.blob(16, 16, 17, 5, 5, 5, "water", seed=31, rough=0)
    m.clear(0, 0, 13, 32, 32, 14); m.clear(0, 0, 17, 32, 32, 18); m.clear(0, 0, 20, 32, 32, 21)
    return m


def console(t):
    m = Model(32, 16, 18)
    m.box(1, 5, 0, 31, 13, 10, "metal"); m.box(1, 8, 10, 31, 13, 12, "metal_light")
    m.box(1, 5, 10, 31, 8, 18, "metal"); m.box(3, 8, 11, 29, 9, 17, "screen")
    for x in range(4, 28, 3):
        m.set(x, 11, 12, "neon" if x % 2 else "neon2")
    return m


def cryo_pod(t):
    m = Model(16, 32, 20)
    m.box(1, 2, 0, 15, 30, 6, "metal"); m.box(1, 2, 6, 15, 30, 8, "white")
    m.box(2, 4, 8, 14, 28, 14, "glass"); m.box(3, 5, 8, 13, 27, 13, "fabric")
    m.box(1, 29, 2, 15, 30, 4, "neon")
    return m


def shoji(t):
    m = Model(32, 16, 32)
    m.box(1, 7, 0, 31, 9, 31, "wood_dark")
    m.box(2, 7, 1, 30, 9, 30, "paper")
    for x in range(1, 32, 5):
        m.box(x, 7, 0, x + 1, 10, 31, "wood_dark")
    for z in (0, 8, 16, 24, 30):
        m.box(1, 7, z, 31, 10, z + 1, "wood_dark")
    return m


def tea_table(t):
    m = Model(16, 16, 10)
    m.box(1, 2, 4, 15, 14, 6, "wood")
    for x, y in ((2, 3), (12, 3), (2, 11), (12, 11)):
        m.box(x, y, 0, x + 2, y + 2, 4, "wood_dark")
    m.box(5, 6, 6, 9, 10, 9, "pot"); m.box(9, 7, 7, 10, 8, 8, "pot")
    m.box(10, 10, 6, 12, 12, 8, "white")
    return m


def bamboo(t):
    m = Model(16, 16, 40)
    m.box(2, 4, 0, 14, 14, 5, "stone"); m.box(3, 5, 4, 13, 13, 5, "soil")
    for (x, y, hgt) in ((5, 7, 38), (9, 9, 32), (7, 11, 35), (11, 6, 27)):
        for z in range(5, hgt):
            m.set(x, y, z, "glass" if z % 7 else "wood")
        m.blob(x, y, hgt - 3, 3, 2.5, 3, "plant", seed=x * 7 + y, rough=.7)
    return m


def koi_pond(t):
    m = Model(48, 32, 3)
    m.blob(24, 16, 0, 22, 14, 3, "stone", seed=41, rough=.1)
    m.blob(24, 16, 1, 19, 11, 2.2, "water", seed=42, rough=.1)
    m.clear(0, 0, 2, 48, 32, 3)
    for (x, y) in ((18, 13), (19, 13), (30, 18), (31, 18), (31, 19)):
        m.set(x, y, 1, "accent")
    m.set(25, 20, 1, "white"); m.set(26, 20, 1, "white")
    return m


def arcade_cabinet(t):
    m = Model(16, 16, 34)
    m.box(2, 3, 0, 14, 12, 34, "wood_dark")
    m.box(2, 12, 0, 14, 13, 14, "wood_dark")
    m.box(2, 9, 14, 14, 14, 16, "metal")          # control panel
    m.set(5, 13, 16, "accent"); m.set(8, 12, 16, "neon2"); m.set(10, 12, 16, "neon")
    m.box(3, 9, 17, 13, 10, 28, "screen")         # screen
    m.box(2, 9, 29, 14, 11, 34, "neon2")          # marquee
    m.box(1, 12, 0, 2, 14, 34, "neon"); m.box(14, 12, 0, 15, 14, 34, "neon")
    return m


def pinball(t):
    m = Model(16, 32, 26)
    for x, y in ((2, 4), (12, 4), (2, 26), (12, 26)):
        m.box(x, y, 0, x + 2, y + 2, 12, "metal")
    m.box(1, 3, 12, 15, 29, 15, "wood_dark"); m.box(2, 4, 14, 14, 28, 15, "glass")
    m.set(6, 12, 15, "neon2"); m.set(10, 16, 15, "neon"); m.set(7, 20, 15, "accent")
    m.box(1, 2, 15, 15, 5, 26, "wood_dark"); m.box(2, 5, 16, 14, 5, 25, "screen")
    m.box(1, 29, 12, 15, 30, 14, "neon2")
    return m


def vending(t):
    m = Model(16, 16, 34)
    m.box(1, 3, 0, 15, 13, 33, "fabric")
    m.box(2, 13, 8, 11, 13, 31, "glass")
    for z in (12, 18, 24):
        for x in range(3, 10, 2):
            m.set(x, 13, z, ["accent", "neon", "neon2", "white"][(x + z) % 4])
    m.box(12, 12, 16, 14, 14, 24, "metal"); m.box(3, 12, 2, 10, 14, 6, "metal")
    m.box(1, 3, 33, 15, 13, 34, "neon")
    return m


def neon_sign(t):
    m = Model(32, 16, 34)
    m.box(4, 7, 0, 6, 9, 20, "metal"); m.box(26, 7, 0, 28, 9, 20, "metal")
    m.box(2, 7, 20, 30, 9, 33, "metal")
    # a pixel "GG" in neon
    pts = [(0, 0), (1, 0), (2, 0), (0, 1), (0, 2), (2, 2), (0, 3), (2, 3), (0, 4), (1, 4), (2, 4), (3, 2)]
    for ox, col in ((7, "neon2"), (17, "neon")):
        for px, pz in pts:
            m.box(ox + px * 2, 9, 30 - pz * 2, ox + px * 2 + 2, 10, 32 - pz * 2, col)
    return m


SHARED = {"desk": desk, "chair": chair, "sofa": sofa, "bookshelf": bookshelf, "plant": plant,
          "coffee_table": coffee_table, "lamp": lamp, "rug": rug, "tv": tv,
          "portal": portal, "noteboard": noteboard}
SPECIALS = {
    "office": {"whiteboard": whiteboard, "water_cooler": water_cooler, "filing_cabinet": filing_cabinet,
               "meeting_table": meeting_table},
    "cabin": {"fireplace": fireplace, "log_pile": log_pile, "armchair": armchair},
    "scifi": {"server_rack": server_rack, "holo_table": holo_table, "console": console, "cryo_pod": cryo_pod},
    "zen": {"shoji": shoji, "tea_table": tea_table, "bamboo": bamboo, "koi_pond": koi_pond},
    "arcade": {"arcade_cabinet": arcade_cabinet, "pinball": pinball, "vending": vending, "neon_sign": neon_sign},
}
LABELS = {"desk": "Desk", "chair": "Chair", "sofa": "Sofa", "bookshelf": "Bookshelf", "plant": "Plant",
          "coffee_table": "Coffee table", "lamp": "Lamp", "rug": "Rug", "tv": "TV", "whiteboard": "Whiteboard",
          "water_cooler": "Water cooler", "filing_cabinet": "Filing cabinet", "meeting_table": "Meeting table",
          "fireplace": "Fireplace", "log_pile": "Log pile", "armchair": "Armchair", "server_rack": "Server rack",
          "holo_table": "Holo table", "console": "Console", "cryo_pod": "Cryo pod", "shoji": "Shoji screen",
          "tea_table": "Tea table", "bamboo": "Bamboo", "koi_pond": "Koi pond", "arcade_cabinet": "Arcade cabinet",
          "pinball": "Pinball", "vending": "Vending machine", "neon_sign": "Neon sign",
          "portal": "Portal", "noteboard": "Note board"}
# per-theme label overrides
LABEL_OVERRIDES = {("zen", "chair"): "Floor cushion", ("zen", "lamp"): "Stone lantern", ("zen", "desk"): "Low desk",
                   ("zen", "plant"): "Bonsai", ("cabin", "tv"): "Radio", ("arcade", "chair"): "Bean bag",
                   ("scifi", "chair"): "Pod chair", ("scifi", "plant"): "Hydroponic tube", ("arcade", "plant"): "Cactus",
                   ("cabin", "plant"): "Fern", ("office", "plant"): "Fiddle-leaf fig", ("arcade", "desk"): "Gaming desk"}
