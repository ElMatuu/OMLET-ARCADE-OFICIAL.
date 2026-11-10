const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'www');
fs.mkdirSync(outputDir, { recursive: true });

let tailwindCli;
try {
  tailwindCli = require.resolve('tailwindcss/lib/cli.js');
} catch {
  console.error('Tailwind CSS is not installed. Run npm install before building PLAYVERSE.');
  process.exit(1);
}

const cssBuild = spawnSync(process.execPath, [
  tailwindCli,
  '-i', path.join(root, 'styles.css'),
  '-o', path.join(outputDir, 'styles.css'),
  '--minify'
], { cwd: root, stdio: 'inherit' });

if (cssBuild.error) throw cssBuild.error;
if (cssBuild.status !== 0) process.exit(cssBuild.status || 1);

const webPreparation = spawnSync(process.execPath, [
  path.join(root, 'scripts', 'prepare-web.js')
], { cwd: root, stdio: 'inherit' });

if (webPreparation.error) throw webPreparation.error;
if (webPreparation.status !== 0) process.exit(webPreparation.status || 1);

console.log('PLAYVERSE production web bundle is ready in ./www');
