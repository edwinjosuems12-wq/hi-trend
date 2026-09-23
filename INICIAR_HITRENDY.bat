@echo off
title HiTrendy - Inicio Completo
color 0B
echo ========================================================
echo            HITRENDY - INICIANDO SISTEMA COMPLETO
echo ========================================================
echo.
echo [1/3] Iniciando Backend API y Base de Datos (Puerto 8000)...
start "HiTrendy Backend" cmd /k "cd /d %~dp0starter\backend && python run.py"

timeout /t 3 >nul

echo [2/3] Iniciando Frontend Web Next.js (Puerto 3000)...
start "HiTrendy Frontend" cmd /k "cd /d %~dp0 && npm run start -w starter/web"

timeout /t 3 >nul

echo [3/3] Iniciando Tunel Publico de Cloudflare (Puerto 3000)...
start "HiTrendy Tunel" cmd /k ""C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000"

echo.
echo ========================================================
echo  LISTO: Frontend, Backend y Tunel estan ejecutandose!
echo.
echo  * Para entrar en tu COMPUTADORA: http://localhost:3000
echo  * Para entrar en tu TELEFONO: Abre la URL que aparece
echo    en la ventana de "HiTrendy Tunel" (termina en .trycloudflare.com)
echo.
echo  No cierres ninguna ventana mientras uses la aplicacion.
echo ========================================================
pause

