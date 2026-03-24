const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const svgPath = path.join(__dirname, '../build/icon.svg');
const pngPath = path.join(__dirname, '../build/icon.png');

async function main() {
  // Skip if icon.png exists and is newer than (or same age as) icon.svg
  if (fs.existsSync(pngPath)) {
    const svgMtime = fs.statSync(svgPath).mtimeMs;
    const pngMtime = fs.statSync(pngPath).mtimeMs;
    if (pngMtime >= svgMtime) {
      console.log('Icons are up to date, skipping generation.');
      return;
    }
  }

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
