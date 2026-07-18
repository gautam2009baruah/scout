@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 20.6 or newer is required.
  echo Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo Created .env from .env.example.
  echo Edit .env with the database credentials, then run start.cmd again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies. This only runs the first time...
  call npm ci
  if errorlevel 1 (
    echo ERROR: Dependency installation failed.
    pause
    exit /b 1
  )
)

call npm start
