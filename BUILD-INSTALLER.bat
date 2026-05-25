@echo off
cd /d "%~dp0"
title The Spiral Trading System — Build

echo.
echo  ================================================
echo   THE SPIRAL TRADING SYSTEM // BUILD
echo  ================================================
echo.

if exist dist rmdir /s /q dist

echo  Installing dependencies...
call npm install --legacy-peer-deps
if %errorlevel% neq 0 ( echo [ERROR] npm install failed & pause & exit /b 1 )

echo.
echo  Building...
call node_modules\.bin\electron-builder --win --x64
if %errorlevel% neq 0 ( echo [ERROR] Build failed & pause & exit /b 1 )

echo.
echo  ================================================
echo   BUILD COMPLETE
echo  ================================================
echo.
dir /b dist\*.exe
echo.
pause
