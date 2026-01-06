const fs = require('fs');
const path = require('path');

function pngSize(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24) throw new Error('File too small');
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error('Not a PNG');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

function fileMeta(filePath) {
  const stat = fs.statSync(filePath);
  return {
    bytes: stat.size,
    mtime: new Date(stat.mtimeMs).toISOString()
  };
}

const root = path.resolve(__dirname, '../ios/App/App/Assets.xcassets/AppIcon.appiconset');
const files = [
  '1024.png',
  '180.png',
  '167.png',
  '152.png',
  '120.png',
  '87.png',
  '80.png',
  '76.png',
  '60.png',
  '58.png',
  '40.png',
  '29.png',
  '20.png'
];

let bad = 0;
for (const f of files) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) {
    console.log(`MISSING ${f}`);
    bad++;
    continue;
  }
  const { w, h } = pngSize(p);
  const { bytes, mtime } = fileMeta(p);
  if (w !== h) {
    console.log(`BAD ${f} ${w}x${h} bytes=${bytes} mtime=${mtime}`);
    bad++;
  } else {
    console.log(`OK  ${f} ${w}x${h} bytes=${bytes} mtime=${mtime}`);
  }
}

process.exitCode = bad ? 1 : 0;
