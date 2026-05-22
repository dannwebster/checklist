const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const svgPath = path.join(__dirname, '../build/icon.svg');
const pngPath = path.join(__dirname, '../build/icon.png');
const outDir = path.join(__dirname, '../build/icons');

const PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const ICNS_MAP = [
  { type: 'icp4', size: 16 },
  { type: 'icp5', size: 32 },
  { type: 'ic07', size: 128 },
  { type: 'ic08', size: 256 },
  { type: 'ic09', size: 512 },
  { type: 'ic10', size: 1024 },
];

function buildIco(pngBuffers, sizes) {
  const count = pngBuffers.length;
  let dataOffset = 6 + count * 16;
  const offsets = pngBuffers.map(buf => { const o = dataOffset; dataOffset += buf.length; return o; });

  const out = Buffer.alloc(dataOffset);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);

  for (let i = 0; i < count; i++) {
    const pos = 6 + i * 16;
    const s = sizes[i];
    out.writeUInt8(s >= 256 ? 0 : s, pos);
    out.writeUInt8(s >= 256 ? 0 : s, pos + 1);
    out.writeUInt8(0, pos + 2);
    out.writeUInt8(0, pos + 3);
    out.writeUInt16LE(1, pos + 4);
    out.writeUInt16LE(32, pos + 6);
    out.writeUInt32LE(pngBuffers[i].length, pos + 8);
    out.writeUInt32LE(offsets[i], pos + 12);
  }

  for (let i = 0; i < count; i++) pngBuffers[i].copy(out, offsets[i]);
  return out;
}

function buildIcns(images) {
  let totalSize = 8;
  for (const img of images) totalSize += 8 + img.data.length;

  const out = Buffer.alloc(totalSize);
  Buffer.from('icns').copy(out, 0);
  out.writeUInt32BE(totalSize, 4);

  let pos = 8;
  for (const img of images) {
    Buffer.from(img.type).copy(out, pos);
    out.writeUInt32BE(8 + img.data.length, pos + 4);
    img.data.copy(out, pos + 8);
    pos += 8 + img.data.length;
  }
  return out;
}

async function main() {
  if (fs.existsSync(pngPath)) {
    const svgMtime = fs.statSync(svgPath).mtimeMs;
    const pngMtime = fs.statSync(pngPath).mtimeMs;
    if (pngMtime >= svgMtime) {
      console.log('Icons are up to date, skipping generation.');
      return;
    }
  }

  console.log('Converting SVG to PNG...');
  await sharp(svgPath).resize(1024, 1024).png().toFile(pngPath);

  const pngDir = path.join(outDir, 'png');
  const winDir = path.join(outDir, 'win');
  const macDir = path.join(outDir, 'mac');
  fs.mkdirSync(pngDir, { recursive: true });
  fs.mkdirSync(winDir, { recursive: true });
  fs.mkdirSync(macDir, { recursive: true });

  const allSizes = [...new Set([...PNG_SIZES, ...ICO_SIZES, ...ICNS_MAP.map(m => m.size)])];
  console.log('Resizing to all required dimensions...');
  const buffers = {};
  await Promise.all(
    allSizes.map(async size => {
      buffers[size] = await sharp(pngPath).resize(size, size).png().toBuffer();
    })
  );

  await Promise.all([
    ...PNG_SIZES.map(size => fs.promises.writeFile(path.join(pngDir, `${size}x${size}.png`), buffers[size])),
    fs.promises.writeFile(path.join(winDir, 'icon.ico'), buildIco(ICO_SIZES.map(s => buffers[s]), ICO_SIZES)),
    fs.promises.writeFile(path.join(macDir, 'icon.icns'), buildIcns(ICNS_MAP.map(m => ({ type: m.type, data: buffers[m.size] })))),
  ]);

  console.log('Done! Icons generated in build/icons/');
}

main().catch(err => { console.error(err); process.exit(1); });
