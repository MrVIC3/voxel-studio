@echo off
cd /d "%~dp0"
call npm run builder:start
if errorlevel 1 pause
