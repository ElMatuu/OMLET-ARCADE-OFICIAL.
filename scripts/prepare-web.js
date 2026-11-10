const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'index.html');
const outputDir = path.join(root, 'www');
const output = path.join(outputDir, 'index.html');

if (!fs.existsSync(source)) {
  console.error('PLAYVERSE entry file index.html was not found.');
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(source, output);
for (const asset of ['service-worker.js', 'app-update.js', 'manifest.webmanifest']) {
  const assetSource = path.join(root, asset);
  if (!fs.existsSync(assetSource)) {
    console.error('Required web update asset was not found: ' + asset);
    process.exit(1);
  }
  const assetContent = asset === 'service-worker.js'
    ? fs.readFileSync(assetSource, 'utf8').replace('__PLAYVERSE_BUILD_VERSION__', 'build-' + Date.now())
    : fs.readFileSync(assetSource);
  fs.writeFileSync(path.join(outputDir, asset), assetContent);
}
const iconSource = path.join(root, 'assets', 'playverse-icon.svg');
if (!fs.existsSync(iconSource)) {
  console.error('PLAYVERSE application icon was not found: ' + iconSource);
  process.exit(1);
}
fs.mkdirSync(path.join(outputDir, 'assets'), { recursive: true });
fs.copyFileSync(iconSource, path.join(outputDir, 'assets', 'playverse-icon.svg'));

const liveKitClientSource = path.join(root, 'node_modules', 'livekit-client', 'dist', 'livekit-client.umd.min.js');
if (!fs.existsSync(liveKitClientSource)) {
  console.error('LiveKit browser SDK was not installed. Run npm install before building PLAYVERSE.');
  process.exit(1);
}
fs.copyFileSync(liveKitClientSource, path.join(outputDir, 'livekit-client.umd.min.js'));

console.log('Prepared PLAYVERSE web client, LiveKit SDK and update assets in ./www');
