import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceIcon = path.join(__dirname, '../ios/App/App/Assets.xcassets/AppIcon.appiconset/512.png');
const outputDir = path.join(__dirname, '../ios/App/App/Assets.xcassets/AppIcon.appiconset');

// All required iOS icon sizes
const sizes = [
  16, 20, 29, 32, 40, 48, 50, 55, 57, 58, 60, 64, 66, 72, 76, 80, 87, 88, 
  92, 100, 102, 108, 114, 120, 128, 144, 152, 167, 172, 180, 196, 216, 
  234, 256, 258, 512, 1024
];

async function generateIcons() {
  console.log('Reading source icon:', sourceIcon);
  
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `${size}.png`);
    try {
      await sharp(sourceIcon)
        .resize(size, size, {
          fit: 'cover',
          position: 'center'
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } }) // Remove alpha, add white background
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
