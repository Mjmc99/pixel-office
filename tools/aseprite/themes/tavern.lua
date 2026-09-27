-- Adventurer's Hall: a tabletop/D&D room. Stone, oak, candlelight, gold and banners.
return function(K)
  local M = K.mat
  local th = K.theme {
    id = "tavern", label = "Adventurer's Hall",
    palette = {
      oak = M({ "#2a170c", "#4e2e16", "#744620", "#9a6230" }, "planks_x"),
      oak_dark = M({ "#1a0e06", "#321c0e", "#4a2c16", "#643e20" }, "grain_z"),
      stone = M({ "#26242a", "#3e3a42", "#58525c", "#767078" }, "bricks"),
      flag = M({ "#222026", "#36323a", "#4c4650", "#645c68" }, "flagstone"),
      marble = M({ "#48464e", "#76727c", "#a6a0aa", "#d2ccd4" }, "noise"),
      iron = M({ "#101012", "#1e1e22", "#303036", "#46464e" }),
      steel = M({ "#3a3e46", "#687080", "#9aa2b0", "#d0d6e0" }),
      gold = M({ "#5a3a08", "#a4700e", "#e0a820", "#fff070" }),
      red = M({ "#3a0a0e", "#6e141a", "#a4222a", "#d4423e" }, "dither"),
      blue = M({ "#0e1638", "#1a2a62", "#2a4296", "#4a66c4" }, "dither"),
      green = M({ "#0e2a18", "#1a4a2a", "#2a6e3c", "#4a9a54" }, "dither"),
      parchment = M({ "#6e5a36", "#a88e5a", "#d4bc86", "#f0e0b0" }),
      ink = M({ "#2a1e14", "#4a3424", "#6e5238", "#8e6e50" }),
      fire = M({ "#a02010", "#e05818", "#f8a030", "#fff080" }, "noise", { emissive = true }),
      candle = M({ "#8a7a5a", "#d8ccae", "#f0e8d0", "#fffaf0" }),
      flame = M({ "#c05a10", "#f0a030", "#ffe070", "#fffbe0" }, "flat", { emissive = true }),
      potion_r = M({ "#5a0a1a", "#b0183a", "#ff4a6a", "#ffb0c0" }, "flat", { emissive = true }),
      potion_g = M({ "#0a4a1a", "#18a03a", "#4ae06a", "#b0ffc0" }, "flat", { emissive = true }),
      potion_b = M({ "#0a1a5a", "#1840b0", "#4a80ff", "#b0d0ff" }, "flat", { emissive = true }),
      rune = M({ "#2a0a4a", "#6a20b0", "#b060ff", "#e8c8ff" }, "flat", { emissive = true }),
      books = M({ "#4a1c1c", "#7a2e2a", "#a8453a", "#cc6a50" }, "books", { multi = {
        { "#4a1c1c", "#7a2e2a", "#a8453a", "#cc6a50" }, { "#1c3a2a", "#2a5a3a", "#3f7f50", "#5fa870" },
        { "#2a2a4e", "#3c3c78", "#5656a4", "#7a7ac8" }, { "#4e3a14", "#80601e", "#b08a30", "#d8b454" },
        { "#3a2a1c", "#5e4430", "#86624a", "#a8846a" } } }),
      mini = M({ "#1a1a1e", "#3a3a42", "#6a6a76", "#a4a4b0" }, "multi", { multi = {
        { "#3a0a0e", "#8a1a22", "#c43a3a", "#f07a6a" }, { "#0e1a3a", "#1e3a8a", "#3a6ad0", "#8ab0f8" },
        { "#0e3a1a", "#1e7a3a", "#3ab05a", "#8ae09a" }, { "#3a2a0a", "#8a6a1a", "#d0a83a", "#f8e08a" } } }),
      die = M({ "#4a0a3a", "#9a1a7a", "#e040b0", "#ffa0e0" }),
      die2 = M({ "#0a3a4a", "#1a7a9a", "#40c0e0", "#a0f0ff" }),
      rug = M({ "#2a0a0e", "#4a141a", "#6e2028", "#943038" }, "dither"),
      rug_border = M({ "#4a3a10", "#806018", "#b08e24", "#e0c040" }),
    },
    floors = { "flag", "oak" },
    wall = M({ "#2a2630", "#443e4a", "#5e5664", "#7a7082" }, "bricks"),
    wall_trim = "oak_dark",
    wall_extra = function(m)
      m:box(0, 14, 26, 16, 16, 29, "oak_dark")   -- timber beam
    end,
  }

  th:item("game_table", "Gaming table", function()
    local m = K.model(64, 48, 18)
    m:box(2, 3, 11, 62, 45, 14, "oak")
    m:box(2, 3, 11, 62, 5, 16, "oak_dark"); m:box(2, 43, 11, 62, 45, 16, "oak_dark")   -- raised rim
    m:box(2, 3, 11, 4, 45, 16, "oak_dark"); m:box(60, 3, 11, 62, 45, 16, "oak_dark")
    for _, p in ipairs({ { 5, 6 }, { 55, 6 }, { 5, 38 }, { 55, 38 } }) do m:box(p[1], p[2], 0, p[1] + 4, p[2] + 4, 11, "oak_dark") end
    -- the battle map: a parchment with a dungeon drawn on it
    m:box(10, 9, 14, 48, 39, 15, "parchment")
    for x = 10, 47, 4 do for y = 9, 38 do if y % 4 == 0 then m:set(x, y, 14, "ink") end end end
    for _, r in ipairs({ { 14, 12, 24, 20 }, { 30, 24, 44, 35 }, { 20, 20, 22, 30 }, { 22, 28, 30, 30 } }) do
      for x = r[1], r[3] - 1 do m:set(x, r[2], 14, "ink"); m:set(x, r[4] - 1, 14, "ink") end
      for y = r[2], r[4] - 1 do m:set(r[1], y, 14, "ink"); m:set(r[3] - 1, y, 14, "ink") end
    end
    -- miniatures (heroes + a big red dragon mini)
    for i, p in ipairs({ { 16, 15 }, { 19, 17 }, { 21, 24 }, { 26, 29 } }) do
      m:cyl(p[1] + .5, p[2] + .5, 1.3, 15, 16, "iron"); m:box(p[1], p[2], 16, p[1] + 1, p[2] + 1, 19, "mini")
      m:set(p[1], p[2], 19, "candle")
    end
    m:cyl(37.5, 29.5, 3, 15, 16, "iron"); m:blob(37.5, 29.5, 18.5, 2.6, 2.2, 3, "red", 4, 0)
    -- dungeon master's screen at the far end, dice, and candles
    m:box(50, 16, 14, 52, 32, 18, "red"); m:box(50, 16, 17, 52, 32, 18, "gold")
    m:box(44, 10, 14, 46, 12, 16, "die"); m:box(47, 38, 14, 49, 40, 16, "die2"); m:box(12, 36, 14, 14, 38, 16, "die")
    for _, c in ipairs({ { 6, 7 }, { 57, 40 } }) do m:cyl(c[1], c[2], 1.2, 14, 17, "candle"); m:set(c[1], c[2], 17, "flame") end
    m:box(54, 36, 14, 59, 41, 15, "parchment")   -- character sheets
    return m
  end)

  th:item("chair", "Wooden chair", function()
    local m = K.model(16, 16, 22)
    m:box(3, 5, 7, 13, 13, 9, "oak")
    for _, p in ipairs({ { 3, 5 }, { 11, 5 }, { 3, 11 }, { 11, 11 } }) do m:box(p[1], p[2], 0, p[1] + 2, p[2] + 2, 7, "oak_dark") end
    m:box(3, 5, 9, 5, 7, 21, "oak_dark"); m:box(11, 5, 9, 13, 7, 21, "oak_dark")
    m:box(5, 5, 14, 11, 6, 20, "oak"); m:box(4, 7, 9, 12, 12, 10, "red")
    return m
  end)

  th:item("bookshelf", "Tome shelf", function()
    local m = K.model(32, 16, 34)
    m:box(1, 3, 0, 31, 12, 34, "oak_dark")
    m:clear(3, 5, 2, 29, 12, 32)
    for _, z in ipairs({ 2, 11, 20 }) do m:box(3, 5, z, 29, 12, z + 1, "oak"); m:box(3, 6, z + 1, 29, 11, z + 8, "books") end
    m:box(3, 5, 29, 29, 12, 30, "oak")
    m:box(5, 7, 30, 9, 10, 32, "parchment"); m:cyl(24, 9, 1.5, 30, 33, "potion_g")
    m:box(21, 7, 21, 27, 11, 26, nil); m:blob(24, 9, 23, 2.3, 2, 2.3, "marble", 2, 0)  -- a skull, of course
    m:set(23, 11, 23, "iron"); m:set(25, 11, 23, "iron")
    return m
  end)

  th:item("brazier", "Brazier", function()
    local m = K.model(16, 16, 26)
    for _, p in ipairs({ { 4, 4 }, { 11, 4 }, { 7, 12 } }) do m:box(p[1], p[2], 0, p[1] + 1, p[2] + 1, 12, "iron") end
    m:cyl(8, 8, 6, 12, 16, "iron", 7)
    m:cyl(8, 8, 5, 14, 16, "ink")
    m:blob(8, 8, 18, 4.5, 4.5, 6, "fire", 9, .5); m:blob(8, 8, 22, 2.5, 2.5, 4, "flame", 10, .4)
    return m
  end)

  th:item("torch", "Torch stand", function()
    local m = K.model(16, 16, 36)
    m:cyl(8, 8, 3.5, 0, 2, "iron"); m:cyl(8, 8, 1, 2, 26, "iron")
    m:cyl(8, 8, 2.5, 26, 29, "iron", 3)
    m:blob(8, 8, 31, 2.6, 2.6, 4, "fire", 3, .5); m:blob(8, 8, 33, 1.5, 1.5, 3, "flame", 4, .3)
    return m
  end)

  th:item("banner", "Banner", function()
    local m = K.model(16, 16, 40)
    m:cyl(8, 6, 3, 0, 2, "iron"); m:cyl(8, 6, 1, 0, 38, "oak_dark"); m:blob(8, 6, 39, 1.5, 1.5, 1.5, "gold", 1, 0)
    m:box(2, 6, 36, 14, 7, 37, "oak_dark")
    m:box(3, 7, 14, 13, 8, 36, "blue")
    for x = 3, 12, 2 do m:set(x, 7, 13, "blue") end            -- swallowtail hem
    m:box(3, 7, 34, 13, 8, 36, "gold")
    for _, p in ipairs({ { 7, 28 }, { 8, 28 }, { 6, 27 }, { 9, 27 }, { 7, 26 }, { 8, 26 }, { 7, 25 }, { 8, 24 }, { 7, 23 }, { 6, 22 }, { 9, 22 } }) do m:set(p[1], 8, p[2], "gold") end  -- a gold dragon crest
    return m
  end)

  th:item("chest", "Treasure chest", function()
    local m = K.model(16, 16, 16)
    m:box(1, 4, 0, 15, 14, 9, "oak")
    m:box(1, 4, 9, 15, 6, 16, "oak")                        -- lid, flipped open against the back
    m:box(1, 4, 0, 2, 14, 9, "iron"); m:box(14, 4, 0, 15, 14, 9, "iron")
    m:box(6, 14, 4, 10, 15, 8, "gold")                      -- lock
    m:box(2, 6, 8, 14, 13, 10, "gold"); m:blob(8, 9, 10, 5, 3.5, 2.5, "gold", 5, .6)
    m:set(5, 9, 11, "potion_r"); m:set(10, 8, 11, "potion_b"); m:set(8, 11, 11, "potion_g")  -- gems
    return m
  end)

  th:item("armor", "Suit of armor", function()
    local m = K.model(16, 16, 38)
    m:box(3, 4, 0, 13, 12, 3, "oak_dark")
    m:box(5, 6, 3, 7, 9, 15, "steel"); m:box(9, 6, 3, 11, 9, 15, "steel")      -- legs
    m:box(4, 5, 15, 12, 10, 27, "steel"); m:box(5, 10, 17, 11, 11, 25, "steel") -- chest plate
    m:blob(8, 7.5, 26.5, 5, 3.5, 2, "steel", 1, 0)                              -- pauldrons
    m:box(2, 6, 14, 4, 9, 26, "steel"); m:box(12, 6, 14, 14, 9, 26, "steel")    -- arms
    m:blob(8, 7.5, 31, 2.8, 2.8, 3.2, "steel", 2, 0)
    m:box(6, 10, 30, 10, 11, 31, "iron")                                        -- visor slit
    m:box(7, 6, 34, 9, 9, 38, "red")                                            -- plume
    m:box(13, 9, 3, 14, 10, 34, "iron"); m:box(12, 9, 30, 15, 10, 31, "iron")  -- spear
    m:box(13, 9, 34, 14, 10, 37, "steel")
    return m
  end)

  th:item("barrel", "Barrel", function()
    local m = K.model(16, 16, 20)
    for z = 0, 19 do
      local r = 5.4 + math.sin(z / 19 * math.pi) * 1.2
      m:cyl(8, 8.5, r, z, z + 1, "oak_dark")
    end
    for _, z in ipairs({ 2, 17 }) do m:cyl(8, 8.5, 5.6 + (z == 2 and .4 or .4), z, z + 1, "iron") end
    m:cyl(8, 8.5, 5.4, 19, 20, "oak")
    m:box(7, 14, 7, 9, 16, 9, "iron")                                           -- tap
    return m
  end)

  th:item("candelabra", "Candelabra", function()
    local m = K.model(16, 16, 28)
    m:cyl(8, 8, 3.5, 0, 2, "gold"); m:cyl(8, 8, 1, 2, 18, "gold")
    m:box(3, 7, 17, 13, 9, 18, "gold")
    for _, x in ipairs({ 3, 8, 12 }) do
      local top = x == 8 and 25 or 23
      m:box(x, 7, 18, x + 1, 9, top, "candle"); m:box(x, 7, top, x + 1, 9, top + 2, "flame")
    end
    return m
  end)

  th:item("statue", "Dragon statue", function()
    local m = K.model(32, 32, 44)
    m:box(3, 5, 0, 29, 29, 5, "marble"); m:box(4, 6, 5, 28, 28, 6, "stone")
    m:blob(16, 18, 13, 8, 7, 7, "marble", 21, .3)                 -- body
    m:blob(24, 22, 9, 3, 4, 3, "marble", 22, .3); m:blob(8, 22, 9, 3, 4, 3, "marble", 23, .3)  -- haunches
    for i = 0, 6 do m:blob(16, 14 - i * .8, 18 + i * 2.6, 3.2 - i * .15, 3, 2.2, "marble", 30 + i, .2) end  -- neck
    m:blob(16, 10, 36, 3.5, 5, 3, "marble", 40, .2)              -- head
    m:box(15, 5, 35, 17, 7, 37, "marble")                          -- snout
    m:set(14, 8, 37, "potion_r"); m:set(18, 8, 37, "potion_r")     -- glowing eyes
    m:box(13, 11, 38, 14, 13, 43, "marble"); m:box(18, 11, 38, 19, 13, 43, "marble")  -- horns
    for i = 0, 9 do                                                 -- wings
      m:box(4 - i // 3, 18 + i // 2, 18 + i, 10, 19 + i // 2, 19 + i, "stone")
      m:box(22, 18 + i // 2, 18 + i, 28 + i // 3, 19 + i // 2, 19 + i, "stone")
    end
    for i = 0, 8 do m:blob(16 + i * 1.2, 26 + i * .3, 6 + (i % 2), 1.8, 1.8, 1.5, "marble", 50 + i, .1) end  -- tail
    return m
  end)

  th:item("weapon_rack", "Weapon rack", function()
    local m = K.model(32, 16, 32)
    m:box(2, 4, 0, 30, 10, 3, "oak_dark")
    m:box(3, 6, 3, 5, 8, 30, "oak_dark"); m:box(27, 6, 3, 29, 8, 30, "oak_dark")
    m:box(3, 6, 22, 29, 8, 24, "oak")
    -- sword, axe, spear, bow
    m:box(8, 8, 3, 9, 9, 26, "steel"); m:box(6, 8, 10, 11, 9, 11, "gold"); m:box(8, 8, 5, 9, 9, 9, "oak_dark")
    m:box(14, 8, 3, 15, 9, 28, "oak"); m:box(15, 8, 22, 18, 9, 28, "steel")
    m:box(21, 8, 3, 22, 9, 31, "oak_dark"); m:box(20, 8, 28, 23, 9, 31, "steel")
    for z = 6, 26 do local x = 25 + math.floor(math.sin((z - 6) / 20 * math.pi) * 2); m:set(x, 9, z, "oak") end
    m:box(24, 9, 6, 25, 10, 27, "parchment")
    return m
  end)

  th:item("potion_shelf", "Potion shelf", function()
    local m = K.model(32, 16, 30)
    m:box(1, 3, 0, 31, 9, 30, "oak_dark"); m:clear(3, 5, 2, 29, 9, 28)
    local mats = { "potion_r", "potion_g", "potion_b" }
    for si, z in ipairs({ 2, 11, 20 }) do
      m:box(3, 5, z, 29, 9, z + 1, "oak")
      for j = 0, 4 do
        local x = 5 + j * 5
        local mat = mats[(si + j) % 3 + 1]
        m:cyl(x + .5, 7, 1.8, z + 1, z + 5, mat); m:box(x, 6, z + 5, x + 1, 8, z + 7, "candle")
      end
    end
    m:box(1, 3, 28, 31, 9, 30, "oak")
    return m
  end)

  th:item("rug", "Rug", function()
    local m = K.model(48, 32, 1)
    m:box(1, 2, 0, 47, 30, 1, "rug_border")
    m:box(3, 4, 0, 45, 28, 1, "rug")
    m:box(6, 7, 0, 42, 8, 1, "rug_border"); m:box(6, 24, 0, 42, 25, 1, "rug_border")
    for x = 10, 38, 7 do m:box(x, 13, 0, x + 3, 19, 1, "rug_border") end
    return m
  end)

  th:item("noteboard", "Quest board", function()
    local m = K.model(16, 16, 32)
    m:box(2, 6, 0, 4, 8, 30, "oak_dark"); m:box(12, 6, 0, 14, 8, 30, "oak_dark")
    m:box(1, 6, 29, 15, 9, 31, "oak_dark")
    m:box(2, 8, 12, 14, 9, 28, "oak")
    for _, n in ipairs({ { 3, 26 }, { 8, 25 }, { 4, 19 }, { 9, 18 } }) do m:box(n[1], 9, n[2] - 4, n[1] + 4, 10, n[2], "parchment") end
    m:set(5, 10, 24, "red"); m:set(10, 10, 23, "ink"); m:set(6, 10, 17, "red"); m:set(11, 10, 16, "gold")
    return m
  end)

  th:item("portal", "Magic circle", function()
    local m = K.model(16, 16, 2)
    m:cyl(8, 8, 7.5, 0, 1, "rune"); m:cyl(8, 8, 6.3, 0, 1, "flag")
    m:cyl(8, 8, 4.5, 0, 1, "rune"); m:cyl(8, 8, 3.5, 0, 1, "flag")
    for a = 0, 4 do
      local ang = a * 2 * math.pi / 5 - math.pi / 2
      m:set(math.floor(8 + math.cos(ang) * 5.5), math.floor(8 + math.sin(ang) * 5.5), 1, "rune")
    end
    m:cyl(8, 8, 1.2, 1, 2, "flame")
    return m
  end)

  th:item("tv", "Scrying mirror", function()
    local m = K.model(32, 16, 32)
    m:box(4, 6, 0, 28, 10, 2, "oak_dark")
    m:box(5, 7, 2, 7, 9, 28, "gold"); m:box(25, 7, 2, 27, 9, 28, "gold")
    m:box(5, 7, 26, 27, 9, 30, "gold"); m:box(14, 7, 30, 18, 9, 32, "potion_b")
    m:box(7, 8, 6, 25, 9, 26, "gold"); m:box(8, 9, 7, 24, 10, 25, "rune")
    m:box(9, 9, 8, 23, 10, 24, "potion_b")
    return m
  end)

  return th
end
