-- Starship: grey hull plating, hazard orange, cyan consoles.
return function(K)
  local M = K.mat
  local th = K.theme {
    id = "starship", label = "Starship",
    palette = {
      hull = M({ "#1c2028", "#343b48", "#4e5868", "#6e7a8c" }, "panels"),
      hull_light = M({ "#4a5462", "#7c8898", "#a8b4c2", "#d0dae4" }),
      metal = M({ "#101217", "#1f232b", "#313743", "#48505e" }),
      trim = M({ "#5a3208", "#a85e10", "#e08a1c", "#ffb84a" }),
      hazard = M({ "#1a1a1a", "#2a2a2a", "#e0a020", "#ffd050" }, "flat"),
      screen = M({ "#06303e", "#0c6a82", "#20b4d0", "#9af0ff" }, "flat", { emissive = true }),
      screen2 = M({ "#3a0616", "#861430", "#e03050", "#ff9aa8" }, "flat", { emissive = true }),
      glow = M({ "#0a4a5a", "#18a0c0", "#50e8ff", "#d0fcff" }, "noise", { emissive = true }),
      core = M({ "#1a2a6a", "#3a60e0", "#80b0ff", "#e0f0ff" }, "stripes_z", { emissive = true }),
      space = M({ "#04040c", "#080a18", "#0e1226", "#141a34" }),
      star = M({ "#6a7090", "#b0b8e0", "#e8ecff", "#ffffff" }, "flat", { emissive = true }),
      fabric = M({ "#141c30", "#22304e", "#34487a", "#4c66a4" }, "dither"),
      seat_red = M({ "#3a0c10", "#6a1820", "#9a2830", "#c44048" }, "dither"),
      plant = M({ "#0e2a1c", "#1a4a2e", "#2a7a44", "#50b060" }, "leaf"),
      soil = M({ "#16100c", "#261c14", "#36281c", "#463424" }, "noise"),
      grate = M({ "#101217", "#23272f", "#3a404c", "#545c6a" }, "grate"),
      white = M({ "#6a7280", "#aab2be", "#d8dee6", "#f4f7fa" }),
      light = M({ "#8a6a2a", "#e8c870", "#fff0b0", "#fffbe8" }, "flat", { emissive = true }),
      accent = M({ "#6a1e1e", "#a8322c", "#d44c3c", "#f07a5c" }),
      paper = M({ "#2a6a7a", "#40a0b8", "#70d0e0", "#c0f4ff" }, "flat", { emissive = true }),
    },
    floors = { "hull", "grate" },
    wall = M({ "#262c36", "#4a5464", "#6c788a", "#8c98aa" }, "panels"),
    wall_trim = "trim",
    wall_extra = function(m)
      m:box(0, 15, 14, 16, 16, 15, "glow")      -- light strip along the wall
      m:box(0, 15, 24, 16, 16, 25, "metal")
    end,
  }

  th:item("captain_chair", "Captain's chair", function()
    local m = K.model(16, 16, 28)
    m:cyl(8, 9, 3, 0, 7, "metal"); m:cyl(8, 9, 5, 0, 1, "hull_light")
    m:box(2, 5, 7, 14, 14, 10, "seat_red")
    m:box(3, 3, 10, 13, 6, 26, "seat_red"); m:box(4, 3, 26, 12, 6, 28, "hull_light")
    m:box(1, 6, 10, 3, 14, 14, "hull_light"); m:box(13, 6, 10, 15, 14, 14, "hull_light")
    m:box(1, 11, 14, 3, 13, 15, "screen"); m:box(13, 11, 14, 15, 13, 15, "screen2")
    return m
  end)

  th:item("helm", "Helm console", function()
    local m = K.model(32, 16, 22)
    m:box(2, 4, 0, 30, 12, 12, "hull")
    for i = 0, 5 do m:box(1, 3 + i, 12 + i, 31, 13, 13 + i, "hull_light") end  -- sloped top
    m:box(3, 3, 12, 29, 4, 22, "metal")                                        -- back riser
    m:box(4, 4, 15, 28, 5, 21, "screen")
    for x = 5, 25, 5 do m:box(x, 9, 15, x + 3, 11, 16, (x // 5) % 2 == 0 and "screen" or "screen2") end
    m:box(2, 12, 2, 30, 13, 3, "trim")
    return m
  end)

  th:item("tv", "Viewscreen", function()
    local m = K.model(32, 16, 30)
    m:box(12, 6, 0, 20, 10, 8, "metal"); m:box(8, 5, 0, 24, 11, 1, "hull_light")
    m:box(2, 6, 8, 30, 9, 30, "hull_light"); m:box(3, 9, 9, 29, 10, 29, "screen")
    m:box(3, 9, 9, 29, 10, 10, "trim")
    return m
  end)

  th:item("portal", "Teleporter pad", function()
    local m = K.model(16, 16, 3)
    m:cyl(8, 8, 7.5, 0, 1, "hull_light")
    m:cyl(8, 8, 6, 0, 2, "metal")
    m:cyl(8, 8, 4.5, 1, 3, "glow")
    m:cyl(8, 8, 2, 2, 3, "star")
    return m
  end)

  th:item("noteboard", "Mission board", function()
    local m = K.model(16, 16, 30)
    m:box(6, 7, 0, 10, 10, 12, "metal"); m:box(4, 6, 0, 12, 11, 1, "hull_light")
    m:box(1, 7, 12, 15, 9, 30, "hull_light"); m:box(2, 9, 13, 14, 10, 29, "space")
    for _, n in ipairs({ { 3, 25, "screen" }, { 8, 26, "trim" }, { 4, 19, "screen2" }, { 9, 17, "screen" }, { 10, 22, "paper" } }) do
      m:box(n[1], 9, n[2] - 2, n[1] + 3, 11, n[2] + 1, n[3] == "trim" and "light" or n[3])
    end
    return m
  end)

  th:item("bunk", "Crew bunk", function()
    local m = K.model(32, 16, 30)
    m:box(1, 2, 0, 3, 14, 30, "hull_light"); m:box(29, 2, 0, 31, 14, 30, "hull_light")
    for _, z in ipairs({ 2, 16 }) do
      m:box(3, 2, z, 29, 14, z + 3, "metal")
      m:box(3, 3, z + 3, 29, 13, z + 6, "fabric")
      m:box(4, 4, z + 6, 10, 12, z + 8, "white")        -- pillow
    end
    m:box(3, 2, 28, 29, 14, 30, "hull")
    m:box(1, 14, 10, 31, 15, 11, "trim")
    return m
  end)

  th:item("crate", "Cargo crate", function()
    local m = K.model(16, 16, 14)
    m:box(1, 2, 0, 15, 15, 13, "hull")
    m:box(1, 2, 13, 15, 15, 14, "hull_light")
    for x = 1, 14 do if (x // 2) % 2 == 0 then m:box(x, 15, 2, x + 1, 16, 5, "hazard") else m:box(x, 15, 2, x + 1, 16, 5, "metal") end end
    m:box(6, 15, 7, 10, 16, 10, "hull_light")
    return m
  end)

  th:item("reactor", "Warp core", function()
    local m = K.model(32, 32, 44)
    m:cyl(16, 16, 14, 0, 3, "metal"); m:cyl(16, 16, 12, 3, 5, "hull_light")
    m:cyl(16, 16, 7, 5, 40, "core")
    for _, z in ipairs({ 10, 20, 30 }) do m:cyl(16, 16, 9, z, z + 2, "hull_light") end
    m:cyl(16, 16, 9, 40, 44, "metal"); m:cyl(16, 16, 4, 43, 44, "glow")
    for _, p in ipairs({ { 3, 16 }, { 29, 16 } }) do m:cyl(p[1], p[2], 2, 0, 36, "hull") end
    return m
  end)

  th:item("locker", "Locker", function()
    local m = K.model(16, 16, 30)
    m:box(1, 4, 0, 15, 13, 29, "hull")
    m:box(1, 13, 1, 7, 14, 28, "hull_light"); m:box(9, 13, 1, 15, 14, 28, "hull_light")
    m:box(5, 14, 14, 6, 15, 18, "metal"); m:box(10, 14, 14, 11, 15, 18, "metal")
    m:box(2, 14, 23, 6, 15, 24, "screen"); m:box(10, 14, 23, 14, 15, 24, "screen2")
    m:box(1, 4, 29, 15, 13, 30, "trim")
    return m
  end)

  th:item("mess_table", "Mess table", function()
    local m = K.model(32, 32, 13)
    m:box(2, 3, 11, 30, 29, 13, "hull_light")
    m:box(2, 29, 11, 30, 30, 12, "glow")
    m:box(13, 13, 0, 19, 19, 11, "metal"); m:box(9, 9, 0, 23, 23, 1, "hull_light")
    m:box(6, 7, 13, 10, 11, 14, "hull"); m:box(20, 18, 13, 24, 22, 14, "hull")  -- trays
    m:cyl(15, 16, 1.5, 13, 16, "screen")
    return m
  end)

  th:item("chair", "Bridge seat", function()
    local m = K.model(16, 16, 22)
    m:cyl(8, 9, 1.5, 0, 8, "metal"); m:cyl(8, 9, 4.5, 0, 1, "hull_light")
    m:box(3, 5, 8, 13, 13, 10, "fabric"); m:box(3, 4, 10, 13, 6, 20, "fabric")
    m:box(3, 4, 20, 13, 6, 21, "hull_light")
    return m
  end)

  th:item("plant", "Hydro planter", function()
    local m = K.model(16, 16, 24)
    m:box(2, 5, 0, 14, 14, 8, "hull_light"); m:box(3, 6, 6, 13, 13, 8, "soil")
    m:box(2, 14, 3, 14, 15, 4, "glow")
    m:blob(6, 9, 13, 3.5, 3, 6, "plant", 11); m:blob(10.5, 9.5, 12, 3, 3, 5, "plant", 12)
    m:blob(8, 8, 18, 3, 2.5, 5, "plant", 13)
    m:box(2, 5, 22, 14, 7, 24, "metal"); m:box(3, 6, 21, 13, 7, 22, "light")  -- grow lamp
    m:box(2, 5, 8, 3, 7, 22, "metal"); m:box(13, 5, 8, 14, 7, 22, "metal")
    return m
  end)

  th:item("viewport", "Viewport", function()
    local m = K.model(32, 16, 34)
    m:box(0, 3, 0, 32, 7, 34, "hull")
    m:box(3, 7, 6, 29, 8, 31, "hull_light")
    m:box(5, 7, 8, 27, 9, 29, "space")
    for _, s in ipairs({ { 7, 26 }, { 12, 20 }, { 18, 27 }, { 23, 15 }, { 9, 12 }, { 20, 10 }, { 25, 22 }, { 15, 14 }, { 6, 18 } }) do
      m:set(s[1], 8, s[2], "star")
    end
    m:box(19, 8, 18, 22, 9, 21, "screen2")      -- a distant red planet
    m:set(20, 8, 21, "accent")
    m:box(0, 7, 2, 32, 8, 3, "trim")
    return m
  end)

  th:item("rug", "Deck grate", function()
    local m = K.model(32, 32, 1)
    m:box(0, 0, 0, 32, 32, 1, "trim")
    m:box(2, 2, 0, 30, 30, 1, "grate")
    return m
  end)

  return th
end
