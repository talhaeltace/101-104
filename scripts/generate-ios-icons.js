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

  // iOS icons should be 1024x1024 with no transparency.
  // The current source is 1024x873 with alpha; using `contain` would add visible
  // padding (white bars) in the final icon. Instead:
  // - trim transparent border
  // - resize with `cover` (crop) so the artwork fills the square
  // - flatten to remove alpha (App Store requires opaque icons)
  const squared1024 = await sharp(sourceIcon)
    .trim()
    .resize(1024, 1024, {
      fit: 'cover',
      position: 'centre'
    })
    .flatten({ background: { r: 11, g: 16, b: 32 } })
    .png()
    .toBuffer();
  
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `${size}.png`);
    try {
      await sharp(squared1024)
        .resize(size, size, { fit: 'fill' })
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
