@echo off
REM Start Axoniz + Odysseus UI System

setlocal enabledelayedexpansion

set AXONIZ_DIR=C:\Users\akikf\programing\nn\axoniz
set MODELS_DIR=C:\Users\akikf\.axoniz\models\lmstudio-community
set LLAMA_MODEL=%MODELS_DIR%\Claude-opus\Claude-4.5-Opus-Q6_K.gguf
set LLAMA_PORT=2123
set WEB_PORT=7000

cls
echo.
echo ============================================
echo   AXONIZ-ZERO + ODYSSEUS UI
echo   Sovereign Local AI System
echo ============================================
echo.

:menu
echo.
echo SELECT MODEL:
echo.
echo CLAUDE:
echo   1. Q6_K (3.2GB) - Best Quality
echo   2. Q4_K (2.4GB) - Balanced
echo   3. Q2_K (1.6GB) - Fast
echo.
echo OTHER:
echo   4. Nemotron (2.64GB) - Lightweight
echo.

set /p choice="Enter choice (1-4): "

if "%choice%"=="1" (
    set LLAMA_MODEL=%MODELS_DIR%\Claude-opus\Claude-4.5-Opus-Q6_K.gguf
    set MODEL_NAME=Claude-4.5-Opus Q6_K
    goto start
)

if "%choice%"=="2" (
    set LLAMA_MODEL=%MODELS_DIR%\Claude-opus\output.Q4_k.gguf
    set MODEL_NAME=Claude-4.5-Opus Q4_K
    goto start
)

if "%choice%"=="3" (
    set LLAMA_MODEL=%MODELS_DIR%\Claude-opus\output.Q2_k.gguf
    set MODEL_NAME=Claude-4.5-Opus Q2_K
    goto start
)

if "%choice%"=="4" (
    set LLAMA_MODEL=%MODELS_DIR%\NVIDIA-Nemotron-3-Nano-4B-GGUF\NVIDIA-Nemotron-3-Nano-4B-Q4_K_M.gguf
    set MODEL_NAME=NVIDIA Nemotron-3-Nano Q4_K
    goto start
)

echo Invalid choice. Try again.
timeout /t 2 /nobreak
goto menu

:start
cls
echo.
echo ============================================
echo   Starting AXONIZ-ZERO + ODYSSEUS
echo ============================================
echo.
echo Model: %MODEL_NAME%
echo.

REM Create temp PowerShell script for llama-server
(
    echo $modelPath = "%LLAMA_MODEL%"
    echo $port = %LLAMA_PORT%
    echo.
    echo Write-Host "============================================" -ForegroundColor Green
    echo Write-Host "llama-server (Axoniz Integration)" -ForegroundColor Green
    echo Write-Host "============================================" -ForegroundColor Green
    echo Write-Host ""
    echo Write-Host "Model: %MODEL_NAME%" -ForegroundColor Yellow
    echo Write-Host "Port:  $port" -ForegroundColor Yellow
    echo Write-Host ""
    echo.
    echo llama-server.exe -m "$modelPath" --port $port --host 127.0.0.1 -ngl 33
) > "%temp%\axoniz-llama.ps1"

echo [1/2] Starting llama-server on port %LLAMA_PORT%...
start powershell -NoExit -Command "& '%temp%\axoniz-llama.ps1'"

echo [2/2] Waiting 5 seconds...
timeout /t 5 /nobreak

echo.
echo Starting Axoniz Web Server on port %WEB_PORT%...
start powershell -NoExit -Command "cd '%AXONIZ_DIR%'; python axoniz/web/server-integrated.py"

echo.
echo ============================================
echo   SERVICES STARTING
echo ============================================
echo.
echo llama-server: http://127.0.0.1:%LLAMA_PORT%
echo Axoniz UI:    http://127.0.0.1:%WEB_PORT%
echo.
echo Opening browser...
timeout /t 3 /nobreak
start http://127.0.0.1:%WEB_PORT%

echo.
pause
