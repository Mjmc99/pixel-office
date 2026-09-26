@echo off
setlocal
title Pixel Office - dev server
cd /d "%~dp0"
rem Installs Node.js LTS if needed, installs packages once, then starts the game.
where node >nul 2>nul || (
  echo Installing Node.js LTS with winget...
  winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
)
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul || (echo Node.js is still not on PATH. Close this window and run play.cmd again. & pause & exit /b 1)
if not exist node_modules (
  echo Installing packages ^(first run only^)...
  call npm install || (pause & exit /b 1)
)
echo.
echo  Opening http://localhost:5173  - open the same link in a second tab to see two players.
echo  Press Ctrl+C here to stop the server.
echo.
start "" http://localhost:5173/
call npm run dev
