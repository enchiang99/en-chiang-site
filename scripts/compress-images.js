// 自動壓縮這次推送中新增/修改的圖片：長邊縮到 1600px 以內，JPEG 品質壓到 82。
// PNG 只做等比縮放＋無損重新壓縮（不做破壞性有損量化），避免像價目表、截圖這類含文字的
// PNG 圖片被壓到模糊。已經夠小的檔案會直接略過，不重複處理。
// 由 .github/workflows/images-pipeline.yml 自動呼叫，不需要手動執行。

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const MAX_EDGE = 1600;
const JPEG_QUALITY = 82;
const SIZE_SKIP_THRESHOLD = 400 * 1024; // 400KB，已經夠小就略過

async function processFile(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) return false; // 檔案被刪除，略過

  const ext = path.extname(relPath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
    console.log(`略過（非 jpg/png，暫不處理）：${relPath}`);
    return false;
  }

  const originalStat = fs.statSync(fullPath);
  let meta;
  try {
    meta = await sharp(fullPath).metadata();
  } catch (e) {
    console.log(`略過（無法讀取圖片）：${relPath} - ${e.message}`);
    return false;
  }
  const longEdge = Math.max(meta.width || 0, meta.height || 0);

  if (originalStat.size <= SIZE_SKIP_THRESHOLD && longEdge <= MAX_EDGE) {
    console.log(`略過（已經夠小）：${relPath}`);
    return false;
  }

  let pipeline = sharp(fullPath)
    .rotate() // 依 EXIF 方向自動校正，避免手機照片轉向跑掉
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });

  pipeline = (ext === '.jpg' || ext === '.jpeg')
    ? pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    : pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });

  const buffer = await pipeline.toBuffer();

  if (buffer.length >= originalStat.size) {
    console.log(`略過（壓縮後沒有變小）：${relPath}`);
    return false;
  }

  fs.writeFileSync(fullPath, buffer);
  const beforeKB = (originalStat.size / 1024).toFixed(0);
  const afterKB = (buffer.length / 1024).toFixed(0);
  console.log(`已壓縮：${relPath}　${beforeKB}KB → ${afterKB}KB`);
  return true;
}

async function main() {
  const raw = process.env.CHANGED_FILES || '';
  const files = raw.split('\n').map(f => f.trim()).filter(Boolean);

  if (!files.length) {
    console.log('沒有偵測到變動的圖片檔案');
    return;
  }

  let anyChanged = false;
  for (const f of files) {
    const changed = await processFile(f);
    if (changed) anyChanged = true;
  }

  if (!anyChanged) console.log('本次沒有檔案需要壓縮');
}

main();
