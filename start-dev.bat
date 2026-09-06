@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0"
node scripts\with-app-env.mjs node node_modules\vite\bin\vite.js dev --host 0.0.0.0 --port 8080
