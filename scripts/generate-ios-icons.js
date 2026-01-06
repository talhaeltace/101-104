import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceIcon = path.join(__dirname, '../public/MapFlow_icon.png');
const outputDir = path.join(__dirname, '../ios/App/App/Assets.xcassets/AppIcon.appiconset');

// All required iOS icon sizes
const sizes = [
  16, 20, 29, 32, 40, 48, 50, 55, 57, 58, 60, 64, 66, 72, 76, 80, 87, 88, 
  92, 100, 102, 108, 114, 120, 128, 144, 152, 167, 172, 180, 196, 216, 
  234, 256, 258, 512, 1024
];

async function generateIcons() {
  console.log('Reading source icon:', sourceIcon);

  const meta = await sharp(sourceIcon).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  const side = Math.max(width, height, 1024);
  const padLeft = Math.floor((side - width) / 2);
  const padRight = Math.ceil((side - width) / 2);
  const padTop = Math.floor((side - height) / 2);
  const padBottom = Math.ceil((side - height) / 2);

  const squaredBase = sharp(sourceIcon)
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .resize(1024, 1024, { fit: 'fill' });
  
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `${size}.png`);
    try {
      await squaredBase
        .clone()
        .resize(size, size, { fit: 'fill' })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .png()
        .toFile(outputPath);
      console.log(`✓ Generated ${size}x${size} icon`);
    } catch (err) {
      console.error(`✗ Failed to generate ${size}x${size}:`, err.message);
    }
  }
  
  console.log('\nDone! All icons generated.');
}

generateIcons();
