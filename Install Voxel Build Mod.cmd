@echo off
cd /d "%~dp0"
node builder/install-mod.cjs %*
pause
