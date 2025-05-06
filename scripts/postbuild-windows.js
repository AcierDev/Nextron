const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("Running post-build Windows script...");

// Paths to check and fix
const distPath = path.join(__dirname, "../dist/win-unpacked");
const appPath = path.join(distPath, "resources", "app");
const nodeModulesPath = path.join(appPath, "node_modules");

console.log(`Checking app directory: ${appPath}`);
if (!fs.existsSync(appPath)) {
  console.error(`App directory not found: ${appPath}`);
  process.exit(1);
}

// Create node_modules directory if it doesn't exist
if (!fs.existsSync(nodeModulesPath)) {
  console.log(`Creating ${nodeModulesPath}`);
  fs.mkdirSync(nodeModulesPath, { recursive: true });
}

// Function to copy directory recursively
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    entry.isDirectory()
      ? copyDirSync(srcPath, destPath)
      : fs.copyFileSync(srcPath, destPath);
  }
}

// Copy serialport modules from node_modules to dist
const sourceNodeModules = path.join(__dirname, "../node_modules");

// Copy package.json to app directory
const sourcePkgJson = path.join(__dirname, "../package.json");
const destPkgJson = path.join(appPath, "package.json");
console.log(`Copying package.json to ${destPkgJson}`);
fs.copyFileSync(sourcePkgJson, destPkgJson);

// Copy specific modules - bindings-cpp is the critical one
const modulesToCopy = [
  "serialport",
  "@serialport/bindings-cpp",
  "@serialport/list",
  "@serialport/parser-readline",
  "@serialport/stream",
];

for (const mod of modulesToCopy) {
  const sourcePath = path.join(sourceNodeModules, mod);
  const destPath = path.join(nodeModulesPath, mod);

  if (fs.existsSync(sourcePath)) {
    console.log(`Copying ${mod} module...`);
    copyDirSync(sourcePath, destPath);
  } else {
    console.warn(`Warning: Module ${mod} not found in source node_modules`);
  }
}

// Run electron-rebuild inside the app directory
try {
  console.log("Running electron-rebuild in the app directory...");

  // Create a temporary package.json if needed
  if (!fs.existsSync(destPkgJson)) {
    console.log("Creating temporary package.json");
    fs.writeFileSync(
      destPkgJson,
      JSON.stringify({
        name: "app",
        version: "1.0.0",
        description: "Electron app",
        main: "background.js",
      })
    );
  }

  // Make sure electron-rebuild is available
  if (
    !fs.existsSync(path.join(sourceNodeModules, ".bin", "electron-rebuild"))
  ) {
    console.log("Installing electron-rebuild globally...");
    execSync("npm install -g electron-rebuild");
  }

  // Run electron-rebuild
  console.log(`Running electron-rebuild in ${appPath}`);
  execSync("npx electron-rebuild -f -w serialport,@serialport/bindings-cpp", {
    cwd: appPath,
    stdio: "inherit",
  });

  console.log("Electron-rebuild completed successfully!");
} catch (error) {
  console.error("Error running electron-rebuild:", error);
}

console.log("Post-build Windows script completed successfully!");
