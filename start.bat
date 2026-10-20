@echo off
rem Windows: double-click this file to start Weekend (needs Node.js 22+ from https://nodejs.org).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install version 22 or newer from https://nodejs.org and try again.
  pause
  exit /b 1
)
node scripts\local.mjs %*
pause
