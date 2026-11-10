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
console.log('Prepared PLAYVERSE web client and update assets in ./www');
