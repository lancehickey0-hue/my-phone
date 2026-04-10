import sharp from 'sharp';
import { join } from 'path';

const srcPath = '/work/temp/slack_downloads/myphone-infinity-original_jfCSAv4M.png';
const outputDir = join(__dirname, '../assets/images');

async function main() {
  const meta = await sharp(srcPath).metadata();
  console.log(`Source: ${meta.width}x${meta.height}, channels=${meta.channels}`);

  // This image is Lance's clean infinity symbol on a dark background
  // We need to:
  // 1. Remove the dark background to make it transparent
  // 2. Keep only the gold infinity symbol
  // 3. Save in multiple sizes

  const raw = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = raw;
  const pixels = new Uint8Array(data);

  console.log(`Raw: ${info.width}x${info.height}, channels=${info.channels}`);

  // Remove dark background — the symbol is bright gold, background is very dark
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114); // perceptual brightness

    if (brightness < 25) {
      // Very dark — fully transparent
      pixels[i + 3] = 0;
    } else if (brightness < 55) {
      // Transition zone — partial transparency
      const alpha = Math.round(((brightness - 25) / 30) * 255);
      pixels[i + 3] = alpha;
    }
    // Gold pixels (brightness > 55) keep full opacity
  }

  const rawOpts = { raw: { width: info.width, height: info.height, channels: 4 as const } };

  // Trim transparent edges and save at multiple sizes
  const trimmed = await sharp(Buffer.from(pixels), rawOpts)
    .trim()
    .png()
    .toBuffer();

  const trimMeta = await sharp(trimmed).metadata();
  console.log(`Trimmed: ${trimMeta.width}x${trimMeta.height}`);

  // Main asset (400px wide, maintain aspect)
  await sharp(trimmed)
    .resize(400, null, { fit: 'inside' })
    .png()
    .toFile(join(outputDir, 'infinity-logo.png'));
  console.log('✅ infinity-logo.png (400w, transparent)');

  // Small for tab bar (48px tall)
  await sharp(trimmed)
    .resize(null, 48, { fit: 'inside' })
    .png()
    .toFile(join(outputDir, 'infinity-logo-small.png'));
  console.log('✅ infinity-logo-small.png (48h)');

  // Medium for button (200px)
  await sharp(trimmed)
    .resize(200, null, { fit: 'inside' })
    .png()
    .toFile(join(outputDir, 'infinity-logo-medium.png'));
  console.log('✅ infinity-logo-medium.png (200w)');

  // Preview on dark bg for verification
  await sharp(trimmed)
    .resize(400, null, { fit: 'inside' })
    .flatten({ background: { r: 6, g: 6, b: 10 } })
    .png()
    .toFile(join(outputDir, 'infinity-logo-preview.png'));
  console.log('✅ infinity-logo-preview.png (on dark bg)');

  // Also save the original to assets
  await sharp(srcPath)
    .toFile(join(outputDir, 'myphone-infinity-original.png'));
  console.log('✅ myphone-infinity-original.png (Lance\'s original)');
}

main();
