@echo off
echo "Building Everwood CNC Controller for Windows..."

:: Install dependencies if needed
IF NOT EXIST node_modules (
  echo "Installing dependencies..."
  npm install
)

:: Install electron-rebuild if not installed
IF NOT EXIST node_modules\electron-rebuild (
  echo "Installing electron-rebuild..."
  npm install electron-rebuild --save-dev
)

:: Rebuild native modules for Electron
echo "Rebuilding native modules for Electron..."
npx electron-rebuild -f -w serialport,@serialport/bindings-cpp

:: Build the application
echo "Building the application..."
npm run build:win

echo "Build complete! Check the 'dist' directory for the installer and portable executable."
pause 