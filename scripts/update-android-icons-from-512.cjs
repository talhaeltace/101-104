/**
 * Android icon generator from 512.png
 * Creates all required Android launcher icon sizes
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Source file
const sourceFile = path.join(__dirname, '../public/Assets.xcassets/AppIcon.appiconset/512.png');

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

async function generateIcons() {
  console.log('🎨 Starting Android icon generation from 512.png...\n');

  // Check if source file exists
  if (!fs.existsSync(sourceFile)) {
    console.error('❌ Source file not found:', sourceFile);
    process.exit(1);
  }

  // Generate standard launcher icons
  console.log('📱 Generating ic_launcher.png files...');
  for (const { folder, size } of androidSizes) {
    const outputPath = path.join(androidResDir, folder, 'ic_launcher.png');
    await sharp(sourceFile)
      .resize(size, size, { fit: 'cover' })
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
      .resize(size, size, { fit: 'cover' })
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
    // The actual icon should be about 66% of the total size (safe zone)
    const iconSize = Math.floor(size * 0.66);
    const padding = Math.floor((size - iconSize) / 2);
    
    // Create transparent background and place icon in center
    await sharp(sourceFile)
      .resize(iconSize, iconSize, { fit: 'cover' })
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

  // Also update public/android icons for web manifest
  console.log('\n🌐 Updating public/android icons...');
  const publicAndroidDir = path.join(__dirname, '../public/android');
  
  for (const { folder, size } of androidSizes) {
    const publicFolderPath = path.join(publicAndroidDir, folder);
    if (fs.existsSync(publicFolderPath)) {
      // Copy the nelit_icon.png or create one
      const outputPath = path.join(publicFolderPath, 'nelit_icon.png');
      await sharp(sourceFile)
        .resize(size, size, { fit: 'cover' })
        .png()
        .toFile(outputPath);
      console.log(`  ✅ public/android/${folder}/nelit_icon.png (${size}x${size})`);
    }
  }

  console.log('\n✅ All Android icons generated successfully!');
  console.log('\n📌 Next steps:');
  console.log('   1. Run: npx cap sync android');
  console.log('   2. Rebuild the AAB: cd android && .\\gradlew.bat bundleRelease');
}

generateIcons().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
