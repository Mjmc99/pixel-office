-- draw_layouts.lua: draws the art for the themed floor layouts.
--
--   Starship · Submarine · Neon Apartment · Adventurer's Hall (tabletop / D&D)
--
-- Run headless (Windows):
--   C:\aseprite\build\bin\aseprite.exe -b --script tools\aseprite\draw_layouts.lua
-- One theme only:
--   ... --script-param only=starship --script tools\aseprite\draw_layouts.lua
-- Or in Aseprite: File > Scripts > Open Scripts Folder, add this folder, then run it.
--
-- Output lands in tools/aseprite/art/<theme>/ (see lib/kit.lua). Then
--   python tools/assets/pack_aseprite.py
-- packs it into public/assets/ for the game. tools\aseprite\draw.cmd does both.

local here = debug.getinfo(1, "S").source:gsub("^@", ""):match("^(.*[/\\])") or "./"
local K = dofile(here .. "lib/kit.lua")
local only = app.params and app.params.only
local out = here .. "art"

local themes = { "starship", "submarine", "apartment", "tavern" }
local t0 = os.clock()
for _, id in ipairs(themes) do
  if not only or only == "" or only == id then
    local th = dofile(here .. "themes/" .. id .. ".lua")(K)
    K.build(th, out)
  end
end
print(string.format("done in %.1fs", os.clock() - t0))
