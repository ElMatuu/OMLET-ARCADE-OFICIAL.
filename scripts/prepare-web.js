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
console.log('Prepared PLAYVERSE web client in ./www');
