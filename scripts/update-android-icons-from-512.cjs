/**
 * Android icon generator from 512.png
 * Creates all required Android launcher icon sizes
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Source file (prefer the Play Store icon in repo root)
const sourceCandidates = [
  path.join(__dirname, '../public/MapFlow_icon.png'),
  path.join(__dirname, '../google-play-icon-512.png'),
  path.join(__dirname, '../512x512-icon.png'),
  path.join(__dirname, '../public/icon.png'),
  path.join(__dirname, '../resources/icon.png'),
  path.join(__dirname, '../public/nelitlogo.png'),
];

const sourceFile = sourceCandidates.find(p => fs.existsSync(p));

// Android mipmap directories and their sizes
const androidSizes = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

// Foreground sizes (for adaptive icons - slightly larger for padding)
const foregroundSizes = [
  { folder: 'mipmap-mdpi', size: 108 },
  { folder: 'mipmap-hdpi', size: 162 },
  { folder: 'mipmap-xhdpi', size: 216 },
  { folder: 'mipmap-xxhdpi', size: 324 },
  { folder: 'mipmap-xxxhdpi', size: 432 },
];

const androidResDir = path.join(__dirname, '../android/app/src/main/res');

// Foreground scale factor for adaptive icons.
// 0.66 is the strict safe-zone default but can look too small on many launchers.
// Bump slightly so the icon sits better on the home screen.
const foregroundRatio = Number(process.env.ANDROID_FOREGROUND_RATIO || '0.82');

async function generateIcons() {
  console.log('🎨 Starting Android icon generation from 512.png...\n');

  // Check if source file exists
  if (!sourceFile) {
    console.error('❌ Source file not found. Tried:', sourceCandidates.join(', '));
    process.exit(1);
  }

  console.log('✅ Using source:', sourceFile);

  // Generate standard launcher icons
  console.log('📱 Generating ic_launcher.png files...');
  for (const { folder, size } of androidSizes) {
    const outputPath = path.join(androidResDir, folder, 'ic_launcher.png');
    await sharp(sourceFile)
      .resize(size, size, { fit: 'cover', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outputPath);
    console.log(`  ✅ ${folder}/ic_launcher.png (${size}x${size})`);
  }

  // Generate round launcher icons
  console.log('\n🔵 Generating ic_launcher_round.png files...');
  for (const { folder, size } of androidSizes) {
    const outputPath = path.join(androidResDir, folder, 'ic_launcher_round.png');
    
    // Create circular mask
    const circleSize = size;
    const circleSvg = `<svg width="${circleSize}" height="${circleSize}">
      <circle cx="${circleSize/2}" cy="${circleSize/2}" r="${circleSize/2}" fill="white"/>
    </svg>`;
    
    await sharp(sourceFile)
      .resize(size, size, { fit: 'cover', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .composite([{
        input: Buffer.from(circleSvg),
        blend: 'dest-in'
      }])
      .png()
      .toFile(outputPath);
    console.log(`  ✅ ${folder}/ic_launcher_round.png (${size}x${size})`);
  }

  // Generate foreground icons for adaptive icons
  console.log('\n🖼️ Generating ic_launcher_foreground.png files...');
  for (const { folder, size } of foregroundSizes) {
    const outputPath = path.join(androidResDir, folder, 'ic_launcher_foreground.png');
    
    // For foreground, we need the icon centered with padding
    // The actual icon should be about ~66% (safe zone), but we allow a slightly larger ratio.
    const iconSize = Math.floor(size * Math.max(0.66, Math.min(foregroundRatio, 0.92)));
    const padding = Math.floor((size - iconSize) / 2);
    
    // Create transparent background and place icon in center
    await sharp(sourceFile)
      .resize(iconSize, iconSize, { fit: 'cover', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .resize(size, size) // Ensure exact size
      .png()
      .toFile(outputPath);
    console.log(`  ✅ ${folder}/ic_launcher_foreground.png (${size}x${size})`);
  }

  // Ensure adaptive icon XML exists (Android 8+). Without this, launchers may show a legacy icon
  // with unwanted padding/background.
  const anydpiDir = path.join(androidResDir, 'mipmap-anydpi-v26');
  fs.mkdirSync(anydpiDir, { recursive: true });
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background" />\n  <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n`;
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'), adaptiveXml);
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), adaptiveXml);
  console.log('\n✅ Wrote adaptive icon XML (mipmap-anydpi-v26)');

  // NOTE: Web/PWA icons are generated separately into public/ (favicon.png, pwa-*.png)

  console.log('\n✅ All Android icons generated successfully!');
  console.log('\n📌 Next steps:');
  console.log('   1. Run: npx cap sync android');
  console.log('   2. Rebuild the AAB: cd android && .\\gradlew.bat bundleRelease');
}

generateIcons().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
