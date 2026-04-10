import sharp from 'sharp';
import { join } from 'path';

const logoPath = join(__dirname, '../../my-phone-landing/public/myphone-logo.png');
const outputDir = join(__dirname, '../assets/images');

async function main() {
  const meta = await sharp(logoPath).metadata();
  console.log(`Logo: ${meta.width}x${meta.height}`); // 1380x752
  
  const w = meta.width!;
  const h = meta.height!;

  // Very tight crop — just the infinity symbol itself
  // The infinity sits between roughly x:350-1030, y:280-580
  // Let's be even more precise: center of image, avoiding frame + "My-Phone" text + bottom curve
  const cropLeft = Math.round(w * 0.30);   // ~414
  const cropTop = Math.round(h * 0.35);    // ~263
  const cropWidth = Math.round(w * 0.40);  // ~552
  const cropHeight = Math.round(h * 0.40); // ~301

  console.log(`Crop: left=${cropLeft}, top=${cropTop}, w=${cropWidth}, h=${cropHeight}`);

  // Extract and process
  const cropped = await sharp(logoPath)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = cropped;
  const pixels = new Uint8Array(data);
  
  // More aggressive background removal
  // The dark app background is very dark (< 30-40 brightness)
  // The gold symbol has high R and G values
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = (r + g + b) / 3;
    
    // Check if pixel looks "gold" — high R, decent G, lower B
    const isGoldish = r > 80 && g > 50 && (r + g) > (b * 3);
    
    if (brightness < 35 && !isGoldish) {
      // Dark background — fully transparent
      pixels[i + 3] = 0;
    } else if (brightness < 60 && !isGoldish) {
      // Semi-dark — fade proportionally
      const alpha = Math.round(((brightness - 35) / 25) * 255);
      pixels[i + 3] = Math.min(alpha, pixels[i + 3]);
    }
  }

  const rawOpts = { raw: { width: info.width, height: info.height, channels: 4 as const } };

  // Main version (400x400)
  await sharp(Buffer.from(pixels), rawOpts)
    .resize(400, 400, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(outputDir, 'infinity-logo.png'));
  console.log('✅ infinity-logo.png');

  // Small version (80x80)
  await sharp(Buffer.from(pixels), rawOpts)
    .resize(80, 80, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(outputDir, 'infinity-logo-small.png'));
  console.log('✅ infinity-logo-small.png');

  // Preview on dark bg
  await sharp(Buffer.from(pixels), rawOpts)
    .resize(400, 400, { fit: 'contain', background: { r: 6, g: 6, b: 10, alpha: 255 } })
    .flatten({ background: { r: 6, g: 6, b: 10 } })
    .png()
    .toFile(join(outputDir, 'infinity-logo-preview.png'));
  console.log('✅ infinity-logo-preview.png');
}

main();
