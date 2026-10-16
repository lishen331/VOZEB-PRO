@echo off
chcp 65001 >nul
rem 双击启动前端热更新服务：改前端代码保存后，浏览器 http://localhost:3300 自动更新，不用重建 Docker。
rem 前提：Docker Desktop 已启动（需要其中的 Postgres 与 vozeb-pg-forward 转发）。关掉这个窗口即停止服务。
cd /d "%~dp0web"
docker start vozeb-pg-forward >nul 2>&1
start "" http://localhost:3300
npm run dev:frontend
