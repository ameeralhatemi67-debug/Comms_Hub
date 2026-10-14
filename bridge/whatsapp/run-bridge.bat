@echo off
rem Comms Hub WhatsApp bridge: links the system number by QR in this window, then sends
rem what the site has queued. Keep this window open; closing it stops delivery (nothing is
rem lost: messages wait on the site until the bridge is back).
cd /d "%~dp0"
if not exist ".env" (
  echo Missing bridge\whatsapp\.env. Copy .env.example to .env and fill in the two values.
  pause
  exit /b 1
)
if not exist "node_modules\whatsapp-web.js" (
  echo Installing the pinned dependencies once. The bridge uses your installed Edge or Chrome.
  set PUPPETEER_SKIP_DOWNLOAD=true
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo Installation failed.
    pause
    exit /b 1
  )
)
node bridge.cjs
pause
