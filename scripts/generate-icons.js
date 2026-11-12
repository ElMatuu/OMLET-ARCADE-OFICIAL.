const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'omlet-arcade-icon.svg');
const output = path.join(root, 'assets', 'generated');
const icoPath = path.join(root, 'assets', 'playverse-icon.ico');

function buildIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  const chunks = [header];
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header[entry + 2] = 0;
    header[entry + 3] = 0;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    chunks.push(data);
    offset += data.length;
  });
  return Buffer.concat(chunks);
}

async function main() {
  if (!fs.existsSync(source)) throw new Error('No se encontró assets/omlet-arcade-icon.svg');
  fs.mkdirSync(output, { recursive: true });
  const icoImages = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    const data = await sharp(source).resize(size, size).png().toBuffer();
    icoImages.push({ size, data });
  }
  fs.writeFileSync(icoPath, buildIco(icoImages));

  const androidSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, size] of Object.entries(androidSizes)) {
    const dir = path.join(output, density);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(source).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));
  }
  await sharp(source).resize(432, 432).png().toFile(path.join(output, 'playverse_splash.png'));
  await sharp(source).resize(432, 432).png().toFile(path.join(output, 'playverse_foreground.png'));
  await sharp(source).resize(512, 512).png().toFile(path.join(root, 'assets', 'playverse-icon.png'));
  console.log('PLAYVERSE: generated Windows ICO and Android launcher/splash PNG assets from the Omlet Arcade SVG adaptation.');
}

main().catch((error) => {
  console.error('Icon generation failed:', error);
  process.exitCode = 1;
});
