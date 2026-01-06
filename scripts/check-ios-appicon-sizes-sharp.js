import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const meta = await sharp(p).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) {
    console.log(`META_FAIL ${f} width=${w} height=${h}`);
    bad++;
    continue;
  }
  if (w !== h) {
    console.log(`BAD ${f} ${w}x${h}`);
    bad++;
  } else {
    console.log(`OK  ${f} ${w}x${h}`);
  }
}

process.exitCode = bad ? 1 : 0;
