@echo off
rem Draws the floor-layout art in Aseprite, then packs it into the game's atlases.
rem   tools\aseprite\draw.cmd              all four themes
rem   tools\aseprite\draw.cmd starship     just one
setlocal
cd /d "%~dp0\..\.."
set ASEPRITE=C:\aseprite\build\bin\aseprite.exe
if not exist "%ASEPRITE%" (
  echo Aseprite not found at %ASEPRITE%. Edit ASEPRITE in tools\aseprite\draw.cmd.
  exit /b 1
)
if "%~1"=="" (
  "%ASEPRITE%" -b --script tools\aseprite\draw_layouts.lua || exit /b 1
) else (
  "%ASEPRITE%" -b --script-param only=%~1 --script tools\aseprite\draw_layouts.lua || exit /b 1
)
python tools\assets\pack_aseprite.py || py tools\assets\pack_aseprite.py || exit /b 1
echo.
echo Done. Open tools\aseprite\art\^<theme^>\^<piece^>.aseprite to touch up a piece; frames are tagged S, E, N, W.
