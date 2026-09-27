-- Submarine: riveted green-grey steel, brass fittings, red valves, sonar green.
return function(K)
  local M = K.mat
  local th = K.theme {
    id = "submarine", label = "Submarine",
    palette = {
      steel = M({ "#1a2420", "#2e3e38", "#465a52", "#62786e" }, "rivets"),
      steel_light = M({ "#3a4a44", "#62766e", "#8aa096", "#b4c8be" }),
      iron = M({ "#0e1210", "#1c2220", "#2c3431", "#3e4844" }),
      brass = M({ "#4a3010", "#8a5e1c", "#c4922e", "#ecc458" }),
      copper = M({ "#3a1a0e", "#6e321a", "#a4542c", "#d07e48" }),
      red = M({ "#3a0808", "#761414", "#b42220", "#e44a3a" }),
      sonar = M({ "#062a10", "#0e5a22", "#2aa446", "#9ef0a0" }, "flat", { emissive = true }),
      water = M({ "#041a2e", "#0a3050", "#14507a", "#2a78a4" }, "noise", { emissive = true }),
      fish = M({ "#6a4a10", "#c08a20", "#f0c040", "#fff0a0" }, "flat", { emissive = true }),
      light = M({ "#8a5a1a", "#e8b050", "#ffe090", "#fff8e0" }, "flat", { emissive = true }),
      redlight = M({ "#6a0808", "#c01818", "#ff4a3a", "#ffb0a0" }, "flat", { emissive = true }),
      wood = M({ "#2e1e10", "#54381e", "#7a5430", "#9e7446" }, "planks_x"),
      canvas = M({ "#3a3a2a", "#5e5e44", "#86866a", "#aeae92" }, "dither"),
      blanket = M({ "#1a2438", "#2a3a56", "#3e547a", "#5a76a0" }, "dither"),
      paper = M({ "#7a6e52", "#b4a47c", "#dcd0a8", "#f4ecd0" }),
      ink = M({ "#1a2a3a", "#2a4a6a", "#3a6a8a", "#5a8aaa" }),
      grate = M({ "#0e1210", "#202824", "#344038", "#4a5850" }, "grate"),
      glass = M({ "#1a3a3a", "#2e5a5a", "#4a8484", "#80b8b4" }),
      white = M({ "#6a706a", "#a8aea6", "#d4d8d0", "#f0f2ec" }),
    },
    floors = { "steel", "grate" },
    wall = M({ "#1e2a26", "#34463e", "#4c6258", "#688074" }, "rivets"),
    wall_trim = "iron",
    wall_extra = function(m)
      m:cylx(0, 16, 14.5, 20, 1.5, "copper")   -- a pipe running along the wall
      m:box(0, 14, 29, 16, 16, 30, "iron")
    end,
  }

  th:item("periscope", "Periscope", function()
    local m = K.model(16, 16, 44)
    m:cyl(8, 8, 6, 0, 2, "steel_light")
    m:cyl(8, 8, 2.5, 2, 44, "steel_light")
    m:box(4, 7, 18, 12, 13, 26, "iron")
    m:box(6, 13, 21, 10, 14, 24, "glass")
    m:box(1, 8, 20, 4, 11, 22, "brass"); m:box(12, 8, 20, 15, 11, 22, "brass")  -- handles
    m:cyl(8, 8, 3, 36, 38, "brass")
    return m
  end)

  th:item("sonar", "Sonar station", function()
    local m = K.model(32, 16, 24)
    m:box(1, 3, 0, 31, 13, 14, "steel")
    m:box(1, 3, 14, 31, 7, 24, "steel_light")
    m:cyly(6, 8, 16, 19, 4.5, "iron"); m:cyly(7, 8, 16, 19, 3.5, "sonar")
    m:set(17, 7, 20, "white"); m:set(14, 7, 18, "white")
    for x = 4, 26, 4 do m:box(x, 12, 11, x + 2, 14, 13, (x // 4) % 2 == 0 and "red" or "brass") end
    m:box(3, 13, 3, 29, 14, 9, "iron")
    m:cyl(6, 12, 1.5, 14, 15, "redlight")
    return m
  end)

  th:item("chart_table", "Chart table", function()
    local m = K.model(32, 32, 16)
    m:box(2, 3, 10, 30, 29, 13, "wood")
    for _, p in ipairs({ { 3, 4 }, { 27, 4 }, { 3, 26 }, { 27, 26 } }) do m:box(p[1], p[2], 0, p[1] + 2, p[2] + 2, 10, "iron") end
    m:box(4, 6, 13, 27, 25, 14, "paper")
    -- coastline + route
    for _, c in ipairs({ { 6, 8 }, { 7, 9 }, { 8, 9 }, { 9, 10 }, { 9, 11 }, { 10, 12 }, { 10, 13 }, { 9, 14 }, { 8, 15 }, { 8, 16 } }) do m:set(c[1], c[2], 13, "ink") end
    for x = 12, 24, 2 do m:set(x, 11 + (x - 12) // 2, 13, "red") end
    m:box(20, 18, 14, 25, 20, 15, "brass")   -- ruler
    m:cyl(9, 21, 2, 14, 16, "brass")          -- compass
    m:cyl(24, 9, 1.5, 14, 18, "light")        -- candle lamp
    return m
  end)

  th:item("torpedo", "Torpedo tube", function()
    local m = K.model(32, 16, 18)
    m:box(4, 3, 0, 8, 13, 5, "iron"); m:box(24, 3, 0, 28, 13, 5, "iron")
    m:cylx(1, 30, 8, 10, 6.5, "steel_light")
    m:cylx(0, 2, 8, 10, 7.5, "brass")
    m:cylx(30, 32, 8, 10, 5, "iron")
    m:box(14, 14, 7, 18, 15, 13, "red")       -- warning plate
    return m
  end)

  th:item("valves", "Valve panel", function()
    local m = K.model(16, 16, 30)
    m:box(1, 4, 0, 15, 8, 30, "steel")
    m:cylx(0, 16, 6, 27, 1.5, "copper")
    for _, v in ipairs({ { 5, 20 }, { 11, 12 } }) do
      m:cyly(8, 10, v[1], v[2], 3.5, "red"); m:cyly(8, 10, v[1], v[2], 2, nil); m:box(v[1] - 1, 8, v[2] - 1, v[1] + 1, 10, v[2] + 1, "iron")
    end
    m:cyly(8, 9, 11, 21, 2.5, "brass"); m:set(11, 8, 22, "white"); m:set(10, 8, 21, "white")
    m:cyly(8, 9, 5, 11, 2.5, "brass"); m:set(5, 8, 12, "white")
    return m
  end)

  th:item("bunk", "Bunk", function()
    local m = K.model(32, 16, 30)
    m:box(1, 2, 0, 31, 4, 30, "steel")
    for _, z in ipairs({ 2, 17 }) do
      m:box(2, 4, z, 30, 13, z + 3, "iron")
      m:box(2, 4, z + 3, 30, 13, z + 5, "blanket")
      m:box(3, 5, z + 5, 9, 12, z + 7, "white")
      m:box(2, 13, z, 30, 14, z + 1, "brass")
    end
    m:box(18, 13, 20, 30, 14, 30, "canvas")   -- half-drawn curtain
    m:box(1, 2, 29, 31, 14, 30, "steel_light")
    return m
  end)

  th:item("pipes", "Pipe bundle", function()
    local m = K.model(16, 16, 40)
    m:cyl(4, 6, 2.5, 0, 40, "copper"); m:cyl(10, 5, 2, 0, 40, "steel_light"); m:cyl(8, 10, 1.8, 0, 40, "brass")
    for _, z in ipairs({ 8, 26 }) do m:box(1, 2, z, 14, 13, z + 2, "iron") end
    m:cyly(10, 13, 8, 17, 2.5, "red"); m:cyly(10, 13, 8, 17, 1, "iron")
    return m
  end)

  th:item("ballast", "Ballast tank", function()
    local m = K.model(16, 16, 30)
    m:cyl(8, 8.5, 6.5, 0, 3, "iron"); m:cyl(8, 8.5, 6, 3, 27, "steel")
    m:cyl(8, 8.5, 5, 27, 29, "steel_light"); m:cyl(8, 8.5, 1.5, 29, 30, "brass")
    for _, z in ipairs({ 8, 18 }) do m:cyl(8, 8.5, 6.4, z, z + 1, "brass") end
    m:cyly(13, 15, 8, 13, 2, "brass"); m:set(8, 14, 13, "white")   -- gauge
    return m
  end)

  th:item("porthole", "Porthole", function()
    local m = K.model(16, 16, 32)
    m:box(0, 3, 0, 16, 7, 32, "steel")
    m:cyly(7, 8, 8, 18, 7, "brass")
    m:cyly(7, 9, 8, 18, 5.5, "water")
    for _, f in ipairs({ { 6, 20 }, { 7, 20 }, { 5, 20 }, { 10, 15 }, { 11, 15 } }) do m:set(f[1], 8, f[2], "fish") end
    m:set(8, 8, 23, "white"); m:set(9, 8, 25, "white")   -- bubbles
    for _, a in ipairs({ 0, 1, 2, 3, 4, 5, 6, 7 }) do
      local ang = a * math.pi / 4
      m:set(math.floor(8 + math.cos(ang) * 6.3), 8, math.floor(18 + math.sin(ang) * 6.3), "iron")
    end
    return m
  end)

  th:item("diving_suit", "Diving suit", function()
    local m = K.model(16, 16, 36)
    m:box(4, 5, 0, 12, 12, 2, "iron"); m:box(7, 7, 2, 9, 9, 14, "iron")
    m:box(4, 6, 12, 12, 11, 24, "canvas")
    m:box(2, 7, 14, 4, 10, 23, "canvas"); m:box(12, 7, 14, 14, 10, 23, "canvas")
    m:box(3, 5, 24, 13, 12, 26, "brass")
    m:blob(8, 8.5, 30, 5, 4.5, 5, "brass", 3, 0)
    m:cyly(12, 14, 8, 30, 2.5, "glass"); m:cyly(12, 13, 8, 30, 3.2, "brass"); m:cyly(12, 14, 8, 30, 2.2, "glass")
    return m
  end)

  th:item("crate", "Supply crate", function()
    local m = K.model(16, 16, 13)
    m:box(1, 2, 0, 15, 15, 12, "wood"); m:box(1, 2, 12, 15, 15, 13, "wood")
    m:box(1, 15, 0, 3, 16, 12, "iron"); m:box(13, 15, 0, 15, 16, 12, "iron")
    m:box(5, 15, 5, 11, 16, 8, "paper")
    return m
  end)

  th:item("lamp", "Caged lamp", function()
    local m = K.model(16, 16, 22)
    m:cyl(8, 8, 3, 0, 2, "iron"); m:cyl(8, 8, 1, 2, 12, "iron")
    m:blob(8, 8, 16, 3, 3, 4, "light", 1, 0)
    for _, p in ipairs({ { 5, 8 }, { 11, 8 }, { 8, 5 }, { 8, 11 } }) do m:box(p[1], p[2], 12, p[1] + 1, p[2] + 1, 21, "brass") end
    m:cyl(8, 8, 3.5, 20, 22, "brass")
    return m
  end)

  th:item("tv", "Scope monitor", function()
    local m = K.model(16, 16, 26)
    m:box(2, 4, 0, 14, 12, 12, "steel")
    m:box(2, 4, 12, 14, 12, 25, "steel_light")
    m:box(4, 12, 14, 12, 13, 23, "sonar")
    m:box(3, 12, 13, 13, 13, 14, "iron")
    m:box(5, 12, 7, 7, 13, 9, "red"); m:box(9, 12, 7, 11, 13, 9, "brass")
    return m
  end)

  th:item("noteboard", "Duty roster", function()
    local m = K.model(16, 16, 28)
    m:box(1, 4, 0, 15, 7, 28, "steel")
    m:box(2, 7, 10, 14, 8, 26, "wood")
    for _, n in ipairs({ { 3, 23 }, { 8, 24 }, { 4, 17 }, { 9, 16 } }) do m:box(n[1], 8, n[2] - 3, n[1] + 4, 9, n[2] + 1, "paper") end
    m:set(5, 9, 23, "red"); m:set(10, 9, 24, "red"); m:set(6, 9, 17, "red"); m:set(11, 9, 16, "red")
    return m
  end)

  th:item("portal", "Hatch", function()
    local m = K.model(16, 16, 3)
    m:cyl(8, 8, 7.5, 0, 1, "iron")
    m:cyl(8, 8, 6.5, 0, 2, "steel_light")
    m:cyl(8, 8, 4, 1, 3, "red"); m:cyl(8, 8, 2.5, 2, 3, nil)
    m:box(7, 3, 2, 9, 13, 3, "red"); m:box(3, 7, 2, 13, 9, 3, "red")
    m:cyl(8, 8, 1, 2, 3, "brass")
    return m
  end)

  th:item("chair", "Stool", function()
    local m = K.model(16, 16, 14)
    m:cyl(8, 9, 1.2, 0, 11, "iron"); m:cyl(8, 9, 4, 0, 1, "iron")
    m:cyl(8, 9, 4.5, 11, 14, "red"); m:cyl(8, 9, 4.5, 11, 12, "brass")
    return m
  end)

  th:item("rug", "Deck grating", function()
    local m = K.model(32, 32, 1)
    m:box(0, 0, 0, 32, 32, 1, "brass")
    m:box(1, 1, 0, 31, 31, 1, "grate")
    return m
  end)

  return th
end
