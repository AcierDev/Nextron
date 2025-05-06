@echo off
echo Building Everwood CNC Controller for Windows with native modules...
echo This will ensure serialport works correctly on Windows.

:: Install dependencies if needed
IF NOT EXIST node_modules (
  echo Installing dependencies...
  npm install
)

:: Remove any existing serialport modules to ensure a clean start
echo Removing any existing serialport modules...
rmdir /s /q node_modules\serialport
rmdir /s /q node_modules\@serialport

:: Install serialport with specific options for Windows compatibility
echo Installing serialport specifically for Windows Electron...
npm install --save serialport @serialport/bindings-cpp @serialport/parser-readline @serialport/list @serialport/stream

:: Rebuild native modules for Electron
echo Rebuilding native modules for Electron...
npx electron-rebuild -f -w serialport,@serialport/bindings-cpp

:: Set build environment to avoid ASAR packaging
set USE_ASAR=false

:: Build the application with specific Windows settings
echo Building the application...
set ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES=true
npx electron-builder build --win --x64 --config.asar=false

echo Build complete! Check the 'dist' directory for the installer and portable executable.
pause 