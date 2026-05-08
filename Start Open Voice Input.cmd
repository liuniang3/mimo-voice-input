@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)

if "%MIMO_API_KEY%"=="" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('MIMO_API_KEY', 'User')"`) do set "MIMO_API_KEY=%%A"
)

if "%MIMO_BASE_URL%"=="" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('MIMO_BASE_URL', 'User')"`) do set "MIMO_BASE_URL=%%A"
)

if "%DASHSCOPE_API_KEY%"=="" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('DASHSCOPE_API_KEY', 'User')"`) do set "DASHSCOPE_API_KEY=%%A"
)

if "%QWEN_ASR_API_KEY%"=="" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('QWEN_ASR_API_KEY', 'User')"`) do set "QWEN_ASR_API_KEY=%%A"
)

if "%FUN_ASR_API_KEY%"=="" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('FUN_ASR_API_KEY', 'User')"`) do set "FUN_ASR_API_KEY=%%A"
)

if "%CLEANER_API_KEY%"=="" (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('CLEANER_API_KEY', 'User')"`) do set "CLEANER_API_KEY=%%A"
)

if "%MIMO_API_KEY%%DASHSCOPE_API_KEY%%QWEN_ASR_API_KEY%%FUN_ASR_API_KEY%"=="" (
  echo No ASR API key was found in environment variables.
  echo You can still enter API keys in the Open Voice Input settings window.
  echo.
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing dependencies...
  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  set npm_config_electron_mirror=https://npmmirror.com/mirrors/electron/
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

call npm start
