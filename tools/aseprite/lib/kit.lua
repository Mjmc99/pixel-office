-- kit.lua: a tiny voxel -> pixel-art drawing kit for Aseprite scripts.
--
-- Same look as the game's other furniture (tools/assets/voxel.py): oblique
-- 3/4 view (screen_y = y - z), 16 px tiles, 1 px dark outline, soft light
-- from the left, 4-step colour ramps. You build a piece out of boxes,
-- cylinders and blobs, facing SOUTH, and the kit draws all four facings.
--
-- Model space: x = right, y = toward the camera (south), z = up. 1 voxel = 1 px.
--
-- Output, per theme, in tools/aseprite/art/<theme>/:
--   <item>.aseprite     one sprite per piece: frames S, E, N, W (tagged), editable
--   <item>_<F>.png      the four facings, cropped, for the game atlas
--   floor*.png, wall_*.png, tiles.aseprite
--   meta.json           labels, footprints, heights (read by tools/assets/pack_aseprite.py)
--
-- Only uses: Sprite, Image, Point, ColorMode, app.pixelColor, app.fs,
-- Image:drawPixel, Image:saveAs, Sprite:newCel/newEmptyFrame/newTag/saveAs/close.

local K = {}
local FACINGS = { "S", "E", "N", "W" }
K.FACINGS = FACINGS

-- ------------------------------------------------------------------ colours
local function hex(h)
  h = h:gsub("#", "")
  return { tonumber(h:sub(1, 2), 16), tonumber(h:sub(3, 4), 16), tonumber(h:sub(5, 6), 16) }
end

--- A material: 4-step ramp (dark -> light), optional texture and glow.
-- tex: flat | planks_x | planks_y | grain_z | noise | dither | stripes_z | leaf | books | multi | rivets | grate
function K.mat(ramp, tex, opts)
  opts = opts or {}
  local m = { ramp = {}, tex = tex or "flat", emissive = opts.emissive or false, multi = nil }
  for i, h in ipairs(ramp) do m.ramp[i] = hex(h) end
  if opts.multi then
    m.multi = {}
    for j, r in ipairs(opts.multi) do
      m.multi[j] = {}
      for i, h in ipairs(r) do m.multi[j][i] = hex(h) end
    end
  end
  return m
end

local function clamp(v, lo, hi) if v < lo then return lo elseif v > hi then return hi end return v end

local function matRGB(m, i, alt)
  local ramp = m.ramp
  if m.multi then ramp = m.multi[(alt % #m.multi) + 1] end
  return ramp[clamp(i, 0, 3) + 1]
end

-- deterministic hash -> [0, 1)
local function h01(...)
  local h = 2166136261
  for _, v in ipairs({ ... }) do
    v = math.floor(v) & 0xffffffff
    for _ = 1, 4 do
      h = ((h ~ (v & 0xff)) * 16777619) & 0xffffffff
      v = v >> 8
    end
  end
  h = h ~ (h >> 13); h = (h * 0x5bd1e995) & 0xffffffff; h = h ~ (h >> 15)
  return (h & 0xffffff) / 0x1000000
end
K.h01 = h01

-- ------------------------------------------------------------------ models
local Model = {}
Model.__index = Model

--- New model w x d x h voxels (w, d multiples of 16 for placeable pieces).
function K.model(w, d, h)
  local m = setmetatable({ w = w, d = d, h = h, grid = {}, det = {}, alt = {}, mats = {}, matIndex = {} }, Model)
  return m
end

function Model:_i(x, y, z) return x + y * self.w + z * self.w * self.d end

function Model:_mid(name)
  local i = self.matIndex[name]
  if not i then
    self.mats[#self.mats + 1] = name
    i = #self.mats
    self.matIndex[name] = i
  end
  return i
end

function Model:get(x, y, z)
  if x < 0 or y < 0 or z < 0 or x >= self.w or y >= self.d or z >= self.h then return 0 end
  return self.grid[self:_i(x, y, z)] or 0
end

function Model:set(x, y, z, mat)
  if x < 0 or y < 0 or z < 0 or x >= self.w or y >= self.d or z >= self.h then return end
  self.grid[self:_i(x, y, z)] = mat and self:_mid(mat) or nil
end

--- Fill [x0,x1) x [y0,y1) x [z0,z1).
function Model:box(x0, y0, z0, x1, y1, z1, mat)
  local mid = mat and self:_mid(mat) or nil
  for z = math.max(0, z0), math.min(self.h, z1) - 1 do
    for y = math.max(0, y0), math.min(self.d, y1) - 1 do
      for x = math.max(0, x0), math.min(self.w, x1) - 1 do
        self.grid[self:_i(x, y, z)] = mid
      end
    end
  end
end

function Model:clear(x0, y0, z0, x1, y1, z1) self:box(x0, y0, z0, x1, y1, z1, nil) end

--- Vertical cylinder (or cone with r_top) centred on cx, cy.
function Model:cyl(cx, cy, r, z0, z1, mat, r_top)
  local mid = mat and self:_mid(mat) or nil
  for z = math.max(0, z0), math.min(self.h, z1) - 1 do
    local t = (z1 - z0 <= 1) and 0 or (z - z0) / (z1 - z0 - 1)
    local rr = r_top and (r + (r_top - r) * t) or r
    for y = 0, self.d - 1 do
      for x = 0, self.w - 1 do
        if (x + .5 - cx) ^ 2 + (y + .5 - cy) ^ 2 <= rr * rr then self.grid[self:_i(x, y, z)] = mid end
      end
    end
  end
end

--- Horizontal cylinder along x (pipes, logs, torpedoes).
function Model:cylx(x0, x1, cy, cz, r, mat)
  local mid = mat and self:_mid(mat) or nil
  for x = math.max(0, x0), math.min(self.w, x1) - 1 do
    for y = 0, self.d - 1 do
      for z = 0, self.h - 1 do
        if (y + .5 - cy) ^ 2 + (z + .5 - cz) ^ 2 <= r * r then self.grid[self:_i(x, y, z)] = mid end
      end
    end
  end
end

--- Horizontal cylinder along y.
function Model:cyly(y0, y1, cx, cz, r, mat)
  local mid = mat and self:_mid(mat) or nil
  for y = math.max(0, y0), math.min(self.d, y1) - 1 do
    for x = 0, self.w - 1 do
      for z = 0, self.h - 1 do
        if (x + .5 - cx) ^ 2 + (z + .5 - cz) ^ 2 <= r * r then self.grid[self:_i(x, y, z)] = mid end
      end
    end
  end
end

--- Lumpy ellipsoid (foliage, cushions, flames).
function Model:blob(cx, cy, cz, rx, ry, rz, mat, seed, rough)
  seed = seed or 0; rough = rough or 0.25
  local mid = mat and self:_mid(mat) or nil
  for z = 0, self.h - 1 do
    for y = 0, self.d - 1 do
      for x = 0, self.w - 1 do
        local v = ((x + .5 - cx) / rx) ^ 2 + ((y + .5 - cy) / ry) ^ 2 + ((z + .5 - cz) / rz) ^ 2
        if v <= 1 + rough * (h01(seed, x // 2, y // 2, z // 2) - .5) then self.grid[self:_i(x, y, z)] = mid end
      end
    end
  end
end

--- Detail texture in model space (so it turns with the piece).
function Model:texture(pal, seed)
  seed = seed or 0
  for z = 0, self.h - 1 do
    for y = 0, self.d - 1 do
      for x = 0, self.w - 1 do
        local i = self:_i(x, y, z)
        local g = self.grid[i]
        if g then
          local m = pal[self.mats[g]]
          if not m then error("unknown material '" .. tostring(self.mats[g]) .. "'") end
          local d = 0
          local t = m.tex
          if t == "planks_x" then
            d = (y % 4 == 3) and -1 or ((h01(seed, x // 7, y // 4) > .8) and 1 or 0)
          elseif t == "planks_y" then
            d = (x % 4 == 3) and -1 or ((h01(seed, x // 4, y // 7) > .8) and 1 or 0)
          elseif t == "grain_z" then
            d = ((x + y) % 5 == 0 and h01(seed, x, y, z // 3) > .4) and -1 or 0
          elseif t == "noise" then
            local r = h01(seed, x, y, z); d = (r < .15) and -1 or ((r > .88) and 1 or 0)
          elseif t == "dither" then
            d = ((x + y + z) % 2 == 0 and h01(seed, x // 2, y // 2, z // 2) > .5) and -1 or 0
          elseif t == "stripes_z" then
            d = (z % 3 == 0) and -1 or 0
          elseif t == "leaf" then
            local r = h01(seed, x, y, z); d = (r < .3) and -1 or ((r > .75) and 1 or 0)
          elseif t == "books" then
            local bx = x + y
            self.alt[i] = math.floor(h01(seed, bx // 2) * 97)
            d = (bx % 2 == 0) and 1 or 0
          elseif t == "multi" then
            self.alt[i] = math.floor(h01(seed, x // 3, y // 3, z // 3) * 97)
          elseif t == "rivets" then      -- steel plates, 8 px panels, rivet at each corner
            local px, py, pz = x % 8, y % 8, z % 8
            if (px == 0 or py == 0) and (z % 8 ~= 1) and not (pz == 0) then d = -1 end
            if (px == 1 and (py == 1 or pz == 1)) or (py == 1 and pz == 1) then d = 1 end
          elseif t == "grate" then       -- floor grating: 2 px bars
            d = ((x % 4 == 0) or (y % 4 == 0)) and 0 or -1
          elseif t == "bricks" then      -- stone blocks, offset rows
            local row = z // 4
            local off = (row % 2) * 4
            if z % 4 == 0 or ((x + y + off) % 8 == 0) then d = -1
            elseif h01(seed, (x + y + off) // 8, row) > .7 then d = 1 end
          elseif t == "flagstone" then   -- irregular floor stones
            local cx, cy = (x + (y // 6) * 3) // 6, y // 6
            if (x + (y // 6) * 3) % 6 == 0 or y % 6 == 0 then d = -1
            elseif h01(seed, cx, cy) > .6 then d = 1 end
          elseif t == "panels" then      -- sci-fi deck plates
            local px, py = x % 16, y % 16
            if px == 0 or py == 0 or (z > 2 and z % 12 == 0) then d = -1
            elseif (px == 2 or px == 13) and (py == 2 or py == 13) then d = 1 end
          end
          self.det[i] = d
        end
      end
    end
  end
end

-- rotated view: returns dims and a lookup (x', y') -> source (x, y)
local function view(m, f)
  local W, D = m.w, m.d
  if f == "S" then return W, D, function(x, y) return x, y end end
  if f == "N" then return W, D, function(x, y) return W - 1 - x, D - 1 - y end end
  if f == "E" then return D, W, function(x, y) return W - 1 - y, x end end
  return D, W, function(x, y) return y, D - 1 - x end -- W
end

--- Render one facing. Returns { w, h, px = {[y*w+x] = {r,g,b}} } (nil = transparent).
function Model:render(f, pal)
  local W, D, src = view(self, f)
  local H = self.h
  local IH = D + H
  local g, det, alt = {}, {}, {}
  -- rotated copies (flat arrays)
  local function ri(x, y, z) return x + y * W + z * W * D end
  for z = 0, H - 1 do
    for y = 0, D - 1 do
      for x = 0, W - 1 do
        local sx, sy = src(x, y)
        local si = self:_i(sx, sy, z)
        local v = self.grid[si]
        if v then
          local j = ri(x, y, z)
          g[j] = v; det[j] = self.det[si] or 0; alt[j] = self.alt[si] or 0
        end
      end
    end
  end
  local function G(x, y, z)
    if x < 0 or y < 0 or z < 0 or x >= W or y >= D or z >= H then return nil end
    return g[ri(x, y, z)]
  end
  local img, srcv, face, matb, altb = {}, {}, {}, {}, {}
  for y = 0, D - 1 do          -- painter's order: y asc, then z asc
    for z = 0, H - 1 do
      for x = 0, W - 1 do
        local mi = G(x, y, z)
        if mi then
          local m = pal[self.mats[mi]]
          local j = ri(x, y, z)
          local dd, a = det[j], alt[j]
          local topOpen = G(x, y, z + 1) == nil
          local frontOpen = G(x, y + 1, z) == nil
          local tshade, fshade = 3, 2
          if not m.emissive then
            if G(x + 1, y, z) == nil and not (x - 1 >= 0 and G(x - 1, y, z) == nil) then fshade = 1 end
          end
          if topOpen then
            local ty = y - z + H - 1
            local k = ty * W + x
            local s = tshade + math.min(0, dd) + ((dd > 0 and tshade < 3) and 1 or 0)
            img[k] = matRGB(m, s, a); srcv[k] = { x, y, z }; face[k] = 1; matb[k] = mi; altb[k] = a
          end
          if frontOpen then
            local fy = y - z + H
            local k = fy * W + x
            local ao = 0
            if not m.emissive and (z == 0 or (y + 1 < D and G(x, y + 1, z + 1) ~= nil)) then ao = -1 end
            img[k] = matRGB(m, fshade + dd + ao, a); srcv[k] = { x, y, z }; face[k] = 2; matb[k] = mi; altb[k] = a
          end
        end
      end
    end
  end
  -- contours: silhouette + depth breaks
  local out = {}
  for py = 0, IH - 1 do
    for px = 0, W - 1 do
      local k = py * W + px
      local c = img[k]
      if c then
        local m = pal[self.mats[matb[k]]]
        local a = altb[k]
        local edge = false
        for _, q in ipairs({ { py - 1, px }, { py + 1, px }, { py, px - 1 }, { py, px + 1 } }) do
          local qy, qx = q[1], q[2]
          if qy < 0 or qx < 0 or qy >= IH or qx >= W or not img[qy * W + qx] then edge = true; break end
        end
        if edge then
          out[k] = matRGB(m, m.emissive and 1 or 0, a)
        else
          out[k] = c
          local p = srcv[k]
          for _, q in ipairs({ { py - 1, px }, { py, px - 1 } }) do
            local qk = q[1] * W + q[2]
            local s = srcv[qk]
            local dist = math.abs(p[1] - s[1]) + math.abs(p[2] - s[2]) + math.abs(p[3] - s[3])
            local nearer = (p[2] - p[3]) >= (s[2] - s[3])
            if (dist > 2 and nearer and matb[qk] ~= matb[k]) or (dist > 3 and nearer) then
              if not m.emissive then out[k] = matRGB(m, (face[k] == 1) and 1 or 0, a) end
              break
            end
          end
        end
      end
    end
  end
  return { w = W, h = IH, px = out }
end

-- ------------------------------------------------------------------ Aseprite output
local rgba = app.pixelColor.rgba

local function toImage(r)
  local img = Image(r.w, r.h, ColorMode.RGB)
  for k, c in pairs(r.px) do
    img:drawPixel(k % r.w, k // r.w, rgba(c[1], c[2], c[3], 255))
  end
  return img
end

-- tiny JSON encoder (keys sorted, so re-runs give identical files)
local function json(v, ind)
  ind = ind or ""
  local t = type(v)
  if t == "table" then
    if #v > 0 or next(v) == nil then
      local parts = {}
      for _, x in ipairs(v) do parts[#parts + 1] = json(x, ind .. " ") end
      return "[" .. table.concat(parts, ", ") .. "]"
    end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = k end
    table.sort(keys)
    local parts = {}
    for _, k in ipairs(keys) do parts[#parts + 1] = ind .. " " .. string.format("%q", k) .. ": " .. json(v[k], ind .. " ") end
    return "{\n" .. table.concat(parts, ",\n") .. "\n" .. ind .. "}"
  elseif t == "string" then
    return '"' .. v:gsub('\\', '\\\\'):gsub('"', '\\"') .. '"'
  elseif t == "boolean" then
    return v and "true" or "false"
  end
  return tostring(v)
end

--- Save a multi-frame sprite: frames = { {name=, img=}, ... }, all anchored bottom-left.
local function saveSprite(path, frames)
  local W, H = 1, 1
  for _, f in ipairs(frames) do W = math.max(W, f.img.width); H = math.max(H, f.img.height) end
  local spr = Sprite(W, H, ColorMode.RGB)
  spr.layers[1].name = "art"
  for i = 2, #frames do spr:newEmptyFrame(i) end
  for i, f in ipairs(frames) do
    spr:newCel(spr.layers[1], i, f.img, Point(0, H - f.img.height))
    local tag = spr:newTag(i, i)
    tag.name = f.name
  end
  spr:saveAs(path)
  spr:close()
end

-- ------------------------------------------------------------------ themes
--- Start a theme. def = { id, label, palette = {name = K.mat(...)}, floors = {mat, mat}, wall = mat, wall_trim = name, wall_extra = fn(m) }
function K.theme(def)
  local th = { def = def, items = {} }
  function th:item(id, label, build)
    self.items[#self.items + 1] = { id = id, label = label, build = build }
  end
  return th
end

local function floorTile(pal, mat, seed)
  local m = K.model(16, 16, 1)
  m:box(0, 0, 0, 16, 16, 1, mat)
  m:texture(pal, seed)
  local img = Image(16, 16, ColorMode.RGB)
  local mt = pal[mat]
  for y = 0, 15 do
    for x = 0, 15 do
      local i = m:_i(x, y, 0)
      local c = matRGB(mt, 2 + (m.det[i] or 0), m.alt[i] or 0)
      img:drawPixel(x, y, rgba(c[1], c[2], c[3], 255))
    end
  end
  return img
end

local function wallTiles(def)
  local pal = {}
  for k, v in pairs(def.palette) do pal[k] = v end
  pal.__wall = def.wall
  pal.__cap = K.mat({ "#121118", "#1c1a24", "#26232f", "#302c3a" })
  local out = {}
  for _, spec in ipairs({ { "wall_tall", 32 }, { "wall_low", 6 } }) do
    local name, hgt = spec[1], spec[2]
    local m = K.model(16, 16, hgt)
    m:box(0, 0, 0, 16, 16, hgt, "__wall")
    if hgt > 8 then
      m:box(0, 0, 0, 16, 16, 3, def.wall_trim)
      if def.wall_extra then def.wall_extra(m) end
      m:box(0, 0, hgt - 2, 16, 16, hgt, "__cap")
    else
      m:box(0, 0, hgt - 2, 16, 16, hgt, "__cap")
    end
    m:texture(pal, 7)
    out[#out + 1] = { name = name, img = toImage(m:render("S", pal)) }
  end
  return out
end

local function strhash(s)
  local h = 0
  for i = 1, #s do h = (h * 31 + s:byte(i)) & 0xffff end
  return h
end

--- Draw every piece of a theme and write it to outDir/<theme>/.
function K.build(th, outDir)
  local def = th.def
  local dir = app.fs.joinPath(outDir, def.id)
  app.fs.makeAllDirectories(dir)
  local meta = { id = def.id, label = def.label, items = {}, floors = {}, walls = { "wall_tall", "wall_low" } }
  local count = 0
  for _, it in ipairs(th.items) do
    local m = it.build()
    assert(m.w % 16 == 0 and m.d % 16 == 0, def.id .. "/" .. it.id .. ": w and d must be multiples of 16")
    m:texture(def.palette, strhash(it.id))
    local frames, views = {}, {}
    for _, f in ipairs(FACINGS) do
      local img = toImage(m:render(f, def.palette))
      img:saveAs(app.fs.joinPath(dir, it.id .. "_" .. f .. ".png"))
      frames[#frames + 1] = { name = f, img = img }
      local tw, td = math.ceil(m.w / 16), math.ceil(m.d / 16)
      if f == "E" or f == "W" then tw, td = td, tw end
      views[f] = { frame = it.id .. "_" .. f, w = tw, d = td, px = { img.width, img.height } }
    end
    saveSprite(app.fs.joinPath(dir, it.id .. ".aseprite"), frames)
    meta.items[#meta.items + 1] = { id = def.id .. "/" .. it.id, item = it.id, label = it.label, height = m.h, flat = m.h <= 3, views = views }
    count = count + 1
  end
  -- floor tiles (2 materials x 2 variants) and walls
  local tiles = {}
  for i, mat in ipairs(def.floors) do
    for v = 0, 1 do
      local name = "floor" .. (i - 1) .. "_" .. v
      local img = floorTile(def.palette, mat, 100 + v)
      img:saveAs(app.fs.joinPath(dir, name .. ".png"))
      tiles[#tiles + 1] = { name = name, img = img }
      meta.floors[#meta.floors + 1] = name
    end
  end
  for _, w in ipairs(wallTiles(def)) do
    w.img:saveAs(app.fs.joinPath(dir, w.name .. ".png"))
    tiles[#tiles + 1] = w
  end
  saveSprite(app.fs.joinPath(dir, "tiles.aseprite"), tiles)
  local fh = io.open(app.fs.joinPath(dir, "meta.json"), "w")
  fh:write(json(meta), "\n")
  fh:close()
  print(string.format("%-10s %2d pieces x 4 facings, %d floor tiles, 2 walls -> %s", def.id, count, #meta.floors, dir))
end

return K
