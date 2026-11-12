@echo off
cd /d "%~dp0"
if exist "release\VoxelStudio-win32-x64-camera\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-camera\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-timeline\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-timeline\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-item-depth\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-item-depth\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-character-studio\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-character-studio\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-character-rim\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-character-rim\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-character\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-character\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-pixeleye\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-pixeleye\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-relief\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-relief\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-softswing\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-softswing\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-vanillarun\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-vanillarun\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-armdrive\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-armdrive\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-sprint\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-sprint\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-layers\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-layers\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-run\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-run\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-joints\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-joints\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-motion\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-motion\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-face\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-face\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-staging\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-staging\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64-large-schematics\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64-large-schematics\VoxelStudio.exe"
  exit /b
)
if exist "release\VoxelStudio-win32-x64\VoxelStudio.exe" (
  start "" "release\VoxelStudio-win32-x64\VoxelStudio.exe"
  exit /b
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing Voxel Studio dependencies...
  call npm install
  if errorlevel 1 (pause & exit /b 1)
)
if not exist "node_modules\electron\dist\electron.exe" (
  call node node_modules\electron\install.js
  if errorlevel 1 (pause & exit /b 1)
)
if not exist "dist\index.html" (
  call npm run build
  if errorlevel 1 (pause & exit /b 1)
)
start "" "node_modules\electron\dist\electron.exe" .
