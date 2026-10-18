@echo off
REM AXONIZ — Windows shim launcher
REM
REM This wrapper explicitly invokes node.exe so the .js file association
REM doesn't matter. Use it when the global npm bin shim is broken or
REM when Windows tries to "open" axoniz.js in VS Code instead of running it.
REM
REM Usage:
REM   .\axoniz.cmd --lc --provider orca
REM   .\axoniz.cmd --web
REM   .\axoniz.cmd serve --port 7861
REM
REM After running `npm install -g .` once, the global `axoniz` command
REM should work directly from any directory.

setlocal
set "SCRIPT_DIR=%~dp0"
set "ENTRY=%SCRIPT_DIR%dist\cli\entry.js"

if not exist "%ENTRY%" (
  echo [axoniz] dist\cli\entry.js not found.
  echo [axoniz] Run "npm run build" in the project root first.
  exit /b 1
)

REM Find node.exe — try PATH, then common install locations
where node >nul 2>nul
if %errorlevel%==0 (
  node "%ENTRY%" %*
  exit /b %errorlevel%
)

set "NODE_CANDIDATES=^
  "C:\Program Files\nodejs\node.exe";^
  "C:\Program Files (x86)\nodejs\node.exe";^
  "%APPDATA%\npm\node.exe";^
  "%LOCALAPPDATA%\Programs\nodejs\node.exe""

for %%N in (%NODE_CANDIDATES%) do (
  if exist "%%~N" (
    "%%~N" "%ENTRY%" %*
    exit /b %errorlevel%
  )
)

echo [axoniz] node.exe not found in PATH or common install locations.
echo [axoniz] Install Node.js from https://nodejs.org/ and re-run.
exit /b 1
