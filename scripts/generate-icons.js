import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const src = path.resolve(process.cwd(), 'icon.svg');
const outDir = path.resolve(process.cwd(), 'public', 'icons');

async function ensureOutDir() {
  await fs.promises.mkdir(outDir, { recursive: true });
}

async function generate() {
  if (!fs.existsSync(src)) {
    console.error('icon.svg not found at', src);
    process.exit(1);
  }

  await ensureOutDir();

  await Promise.all(sizes.map(async (s) => {
    const out = path.join(outDir, `icon-${s}x${s}.png`);
    await sharp(src)
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    console.log('written', out);
  }));

  // Also create a 192 and 512 shortcut names
  // (already created above but ensure naming)
}

generate().catch((e) => {
  console.error(e);
  process.exit(1);
});
