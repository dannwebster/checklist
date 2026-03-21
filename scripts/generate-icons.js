const { execSync } = require('child_process');
const path = require('path');
const sharp = require('sharp');

const svgPath = path.join(__dirname, '../build/icon.svg');
const pngPath = path.join(__dirname, '../build/icon.png');

async function main() {
  console.log('Converting SVG to PNG...');
  await sharp(svgPath)
    .resize(1024, 1024)
    .png()
    .toFile(pngPath);
  console.log('Generated build/icon.png');

  console.log('Generating platform icons...');
  execSync(
    `npx electron-icon-builder --input="${pngPath}" --output="${path.join(__dirname, '../build')}"`,
    { stdio: 'inherit' }
  );
  console.log('Done! Icons generated in build/');
}

main().catch(err => { console.error(err); process.exit(1); });
