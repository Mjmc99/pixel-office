-- Neon Apartment: dark concrete and chrome, hot-pink and cyan neon, a city outside.
return function(K)
  local M = K.mat
  local th = K.theme {
    id = "apartment", label = "Neon Apartment",
    palette = {
      concrete = M({ "#16141c", "#24212c", "#34303e", "#464152" }, "noise"),
      tile = M({ "#121018", "#1e1a28", "#2c2638", "#3c344c" }, "panels"),
      chrome = M({ "#2a2a34", "#5a5a68", "#9a9aa8", "#dcdce6" }),
      black = M({ "#0a0a0e", "#141418", "#202026", "#2e2e36" }),
      pink = M({ "#4a0a2a", "#b0186a", "#ff4aa8", "#ffc0e4" }, "flat", { emissive = true }),
      cyan = M({ "#083a4a", "#10a0c0", "#40e8ff", "#c8faff" }, "flat", { emissive = true }),
      purple = M({ "#2a0e4a", "#5a1e9a", "#9a4ae0", "#d4a8ff" }, "flat", { emissive = true }),
      yellow = M({ "#4a3a08", "#b09010", "#ffe040", "#fff8c0" }, "flat", { emissive = true }),
      screen = M({ "#0c1a3a", "#1a3a7a", "#3a70d0", "#a0d0ff" }, "flat", { emissive = true }),
      night = M({ "#06061a", "#0c0c2a", "#14143e", "#1e1e52" }),
      tower = M({ "#0a0a18", "#12122a", "#1c1c3a", "#26264a" }),
      fabric = M({ "#1e1030", "#34204e", "#4c3272", "#684898" }, "dither"),
      fabric2 = M({ "#2a0a1e", "#4a1434", "#6e2250", "#963474" }, "dither"),
      sheets = M({ "#3a3a4e", "#62627e", "#9090ac", "#c4c4dc" }, "dither"),
      wood = M({ "#1e1414", "#342424", "#4a3434", "#604646" }, "planks_x"),
      plant = M({ "#0a2a2a", "#10504a", "#1a8a7a", "#40d0b0" }, "leaf", { emissive = false }),
      lava = M({ "#6a0a2a", "#d02060", "#ff6a9a", "#ffd0e0" }, "noise", { emissive = true }),
      white = M({ "#5a5a66", "#9a9aa8", "#cacad6", "#eeeef6" }),
      noodle = M({ "#8a6a2a", "#d8b060", "#f4d890", "#fff4d0" }),
      rug = M({ "#140e1e", "#20162e", "#2e2040", "#3e2c54" }, "dither"),
    },
    floors = { "tile", "concrete" },
    wall = M({ "#1a1822", "#2a2734", "#3c3848", "#524c62" }, "noise"),
    wall_trim = "black",
    wall_extra = function(m)
      m:box(0, 15, 3, 16, 16, 4, "pink")      -- neon baseboard
      m:box(0, 15, 27, 16, 16, 28, "cyan")    -- and a cyan cove light up top
    end,
  }

  th:item("bed", "Bed", function()
    local m = K.model(32, 32, 16)
    m:box(1, 2, 0, 31, 30, 5, "black")
    m:box(1, 30, 1, 31, 31, 2, "pink")               -- underglow
    m:box(1, 2, 5, 31, 30, 9, "sheets")
    m:box(2, 12, 9, 30, 29, 11, "fabric")            -- duvet
    m:box(3, 4, 9, 14, 10, 12, "white"); m:box(18, 4, 9, 29, 10, 12, "white")
    m:box(0, 0, 0, 32, 3, 16, "black"); m:box(1, 2, 13, 31, 3, 14, "cyan")  -- headboard strip
    return m
  end)

  th:item("sofa", "Couch", function()
    local m = K.model(32, 16, 18)
    m:box(1, 3, 0, 31, 14, 3, "black"); m:box(1, 14, 1, 31, 15, 2, "cyan")
    m:box(1, 3, 3, 31, 14, 8, "fabric2")
    m:box(1, 3, 8, 31, 7, 17, "fabric2")
    m:box(1, 3, 8, 4, 14, 13, "fabric2"); m:box(28, 3, 8, 31, 14, 13, "fabric2")
    m:box(5, 5, 8, 15, 13, 10, "fabric2"); m:box(17, 5, 8, 27, 13, 10, "fabric2")
    m:box(20, 6, 10, 26, 8, 15, "purple")          -- glowing cushion
    return m
  end)

  th:item("kitchen", "Kitchenette", function()
    local m = K.model(32, 16, 24)
    m:box(1, 3, 0, 31, 13, 14, "black")
    m:box(1, 3, 14, 31, 14, 16, "chrome")
    m:box(1, 13, 1, 31, 14, 2, "pink")
    m:box(4, 5, 15, 12, 11, 16, "black"); m:cyl(6, 7, 1.6, 15, 16, "pink"); m:cyl(10, 9, 1.6, 15, 16, "pink")  -- induction hob
    m:box(18, 5, 15, 26, 11, 16, nil); m:box(18, 5, 13, 26, 11, 14, "chrome"); m:box(21, 3, 16, 23, 5, 21, "chrome")  -- sink + tap
    m:cyl(28, 8, 1.8, 16, 20, "white"); m:box(27, 7, 20, 30, 10, 21, "noodle")    -- noodle cup
    m:box(1, 2, 16, 31, 3, 24, "concrete"); m:box(3, 3, 20, 9, 4, 22, "cyan")      -- splashback + menu screen
    return m
  end)

  th:item("fridge", "Fridge", function()
    local m = K.model(16, 16, 34)
    m:box(2, 4, 0, 14, 14, 34, "chrome")
    m:box(2, 14, 1, 14, 15, 12, "white"); m:box(2, 14, 13, 14, 15, 33, "white")
    m:box(12, 15, 16, 13, 16, 28, "black"); m:box(12, 15, 4, 13, 16, 10, "black")
    m:box(4, 15, 24, 9, 16, 30, "screen")
    m:set(5, 15, 27, "cyan"); m:set(7, 15, 26, "pink")
    return m
  end)

  th:item("tv", "Holo TV", function()
    local m = K.model(32, 16, 30)
    m:box(2, 5, 0, 30, 12, 7, "black"); m:box(2, 12, 1, 30, 13, 2, "purple")
    m:box(3, 7, 7, 29, 9, 29, "black"); m:box(4, 9, 8, 28, 10, 28, "screen")
    for _, p in ipairs({ { 7, 22, "pink" }, { 8, 22, "pink" }, { 12, 14, "cyan" }, { 20, 20, "yellow" }, { 22, 12, "pink" } }) do m:set(p[1], 9, p[2], p[3]) end
    m:box(4, 9, 8, 28, 10, 9, "cyan")
    return m
  end)

  th:item("desk", "Battle station", function()
    local m = K.model(32, 16, 24)
    m:box(1, 2, 10, 31, 14, 12, "black"); m:box(1, 14, 10, 31, 15, 11, "cyan")
    m:box(2, 3, 0, 4, 13, 10, "chrome"); m:box(28, 3, 0, 30, 13, 10, "chrome")
    for _, x in ipairs({ 3, 12, 21 }) do
      m:box(x, 3, 12, x + 8, 4, 22, "black"); m:box(x + 1, 4, 13, x + 7, 5, 21, x == 12 and "purple" or "screen")
    end
    m:box(9, 8, 12, 21, 11, 13, "chrome"); m:box(23, 9, 12, 26, 12, 13, "black")
    m:box(24, 3, 0, 28, 13, 10, "black"); m:box(24, 13, 2, 28, 14, 8, "pink")      -- PC tower
    return m
  end)

  th:item("chair", "Gaming chair", function()
    local m = K.model(16, 16, 26)
    m:cyl(8, 9, 1.4, 1, 8, "chrome"); m:box(2, 8, 0, 14, 10, 1, "chrome"); m:box(7, 3, 0, 9, 15, 1, "chrome")
    m:box(3, 5, 8, 13, 13, 10, "black")
    m:box(3, 3, 10, 13, 6, 25, "black"); m:box(5, 5, 14, 11, 6, 23, "pink")
    m:box(1, 7, 10, 3, 12, 14, "black"); m:box(13, 7, 10, 15, 12, 14, "black")
    return m
  end)

  th:item("neon_sign", "Neon sign", function()
    local m = K.model(16, 16, 30)
    m:box(0, 4, 8, 16, 5, 28, "black")
    -- a little ramen bowl + steam in neon
    for x = 3, 12 do m:set(x, 5, 13, "pink") end
    for x = 4, 11 do m:set(x, 5, 12, "pink") end
    m:set(3, 5, 14, "pink"); m:set(12, 5, 14, "pink")
    for _, s in ipairs({ { 5, 17 }, { 6, 18 }, { 5, 19 }, { 8, 17 }, { 9, 18 }, { 8, 19 }, { 11, 17 }, { 12, 18 }, { 11, 19 } }) do m:set(s[1], 5, s[2], "cyan") end
    for x = 3, 12 do m:set(x, 5, 23, "yellow") end
    m:box(7, 4, 0, 9, 6, 8, "chrome")
    return m
  end)

  th:item("window", "City window", function()
    local m = K.model(32, 16, 34)
    m:box(0, 3, 0, 32, 6, 34, "black")
    m:box(1, 6, 3, 31, 7, 33, "chrome")
    m:box(2, 6, 4, 30, 8, 32, "night")
    -- skyline
    local towers = { { 3, 18 }, { 7, 26 }, { 11, 14 }, { 15, 22 }, { 20, 28 }, { 24, 16 }, { 27, 20 } }
    for i, t in ipairs(towers) do
      local x1 = (towers[i + 1] and towers[i + 1][1] or 30)
      m:box(t[1], 7, 4, x1, 8, t[2], "tower")
      for z = 6, t[2] - 2, 3 do
        for x = t[1] + 1, x1 - 2, 2 do
          if K.h01(i, x, z) > .55 then m:set(x, 7, z, K.h01(x, z) > .8 and "pink" or "yellow") end
        end
      end
    end
    m:set(21, 7, 29, "pink")   -- beacon on the tall tower
    m:box(1, 7, 16, 31, 8, 17, "chrome")  -- window mullion
    return m
  end)

  th:item("plant", "Synth plant", function()
    local m = K.model(16, 16, 24)
    m:cyl(8, 9, 4, 0, 7, "chrome"); m:cyl(8, 9, 4.2, 6, 7, "cyan")
    m:blob(8, 9, 13, 4.5, 4, 6, "plant", 5); m:blob(7, 8, 19, 3, 3, 4, "plant", 6)
    for _, p in ipairs({ { 5, 10, 14 }, { 11, 8, 16 }, { 8, 12, 12 }, { 7, 7, 21 } }) do m:set(p[1], p[2], p[3], "purple") end
    return m
  end)

  th:item("lamp", "Lava lamp", function()
    local m = K.model(16, 16, 22)
    m:cyl(8, 8, 3.5, 0, 5, "chrome", 2.5)
    m:cyl(8, 8, 2.5, 5, 18, "purple", 3)
    m:blob(7.5, 8, 9, 1.8, 1.8, 2.2, "lava", 1, 0); m:blob(8.5, 8, 14, 1.5, 1.5, 1.8, "lava", 2, 0)
    m:cyl(8, 8, 2, 18, 22, "chrome", 1)
    return m
  end)

  th:item("rug", "Neon rug", function()
    local m = K.model(48, 32, 1)
    m:box(1, 2, 0, 47, 30, 1, "pink")
    m:box(2, 3, 0, 46, 29, 1, "rug")
    for x = 6, 42, 6 do m:box(x, 6, 0, x + 2, 26, 1, "fabric") end
    m:box(4, 15, 0, 44, 16, 1, "cyan")
    return m
  end)

  th:item("coffee_table", "Coffee table", function()
    local m = K.model(32, 16, 10)
    m:box(2, 4, 7, 30, 12, 9, "chrome"); m:box(3, 5, 9, 29, 11, 10, "night")
    m:box(4, 5, 0, 6, 11, 7, "black"); m:box(26, 5, 0, 28, 11, 7, "black")
    m:box(8, 6, 9, 13, 9, 10, "cyan"); m:cyl(22, 8, 1.5, 9, 12, "pink")   -- tablet + drink
    return m
  end)

  th:item("noteboard", "Pin board", function()
    local m = K.model(16, 16, 30)
    m:box(1, 4, 12, 15, 6, 30, "black"); m:box(7, 5, 0, 9, 6, 12, "chrome")
    for _, n in ipairs({ { 2, 26, "pink" }, { 7, 27, "cyan" }, { 11, 24, "yellow" }, { 3, 19, "cyan" }, { 8, 18, "purple" }, { 11, 16, "pink" } }) do
      m:box(n[1], 6, n[2] - 3, n[1] + 3, 7, n[2], n[3])
    end
    return m
  end)

  th:item("portal", "Teleport pad", function()
    local m = K.model(16, 16, 2)
    m:cyl(8, 8, 7.5, 0, 1, "black")
    m:cyl(8, 8, 6, 0, 2, "pink"); m:cyl(8, 8, 5, 0, 2, "black"); m:cyl(8, 8, 3.5, 1, 2, "cyan")
    return m
  end)

  th:item("server", "Home server", function()
    local m = K.model(16, 16, 26)
    m:box(2, 4, 0, 14, 13, 26, "black")
    for z = 3, 22, 4 do
      m:box(3, 13, z, 13, 14, z + 2, "chrome")
      m:set(4, 13, z + 1, (z // 4) % 2 == 0 and "cyan" or "pink"); m:set(6, 13, z + 1, "yellow")
    end
    return m
  end)

  return th
end
