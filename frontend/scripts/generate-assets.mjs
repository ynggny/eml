/**
 * SVGからPNG画像を生成するスクリプト
 *
 * 使用方法:
 *   npm run generate-assets
 *
 * 必要なパッケージ:
 *   npm install --save-dev sharp
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', 'public');

async function generateAssets() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('sharpがインストールされていません。');
    console.error('以下のコマンドでインストールしてください:');
    console.error('  npm install --save-dev sharp');
    console.error('');
    console.error('または、以下のオンラインツールでSVGをPNGに変換できます:');
    console.error('  - https://svgtopng.com/');
    console.error('  - https://cloudconvert.com/svg-to-png');
    process.exit(1);
  }

  console.log('アセット生成を開始します...\n');

  // OGP画像 (1200x630)
  console.log('OGP画像を生成中...');
  const ogpSvg = readFileSync(join(publicDir, 'ogp.svg'));
  await sharp(ogpSvg)
    .resize(1200, 630)
    .png()
    .toFile(join(publicDir, 'ogp.png'));
  console.log('  ✓ ogp.png (1200x630)');

  // Favicon各サイズ
  console.log('\nFaviconを生成中...');
  const faviconSvg = readFileSync(join(publicDir, 'favicon.svg'));

  // 16x16
  await sharp(faviconSvg)
    .resize(16, 16)
    .png()
    .toFile(join(publicDir, 'favicon-16x16.png'));
  console.log('  ✓ favicon-16x16.png');

  // 32x32
  await sharp(faviconSvg)
    .resize(32, 32)
    .png()
    .toFile(join(publicDir, 'favicon-32x32.png'));
  console.log('  ✓ favicon-32x32.png');

  // Apple Touch Icon (180x180)
  await sharp(faviconSvg)
    .resize(180, 180)
    .png()
    .toFile(join(publicDir, 'apple-touch-icon.png'));
  console.log('  ✓ apple-touch-icon.png (180x180)');

  // PWA Icons
  console.log('\nPWAアイコンを生成中...');

  // 192x192
  await sharp(faviconSvg)
    .resize(192, 192)
    .png()
    .toFile(join(publicDir, 'icon-192x192.png'));
  console.log('  ✓ icon-192x192.png');

  // 512x512
  await sharp(faviconSvg)
    .resize(512, 512)
    .png()
    .toFile(join(publicDir, 'icon-512x512.png'));
  console.log('  ✓ icon-512x512.png');

  console.log('\n✅ すべてのアセット生成が完了しました！');
}

generateAssets().catch(console.error);
