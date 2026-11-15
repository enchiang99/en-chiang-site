/**
 * 圖片壓縮／轉檔的共用邏輯，被 process-incoming-zips.js（整批上傳／單張上傳自動壓縮）
 * 和 migrate-v1-images.js（把 V1 的照片搬進 V2 並壓縮）共用，兩邊規則保持一致，
 * 之後只要改一個地方，兩套流程都會套用到同一套壓縮標準。
 */

const fs = require("fs");
const path = require("path");

const MAX_LONG_EDGE = 1600; // 前台實際顯示用夠了，沒必要留原始相機的滿版尺寸
const JPEG_QUALITY = 82;
const MAX_JPEG_BYTES = 400 * 1024; // 已經是 JPEG 但檔案還是超過這個大小，也重新壓縮一次
const OPTIMIZABLE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]); // gif/webp 先跳過，不動它們

/**
 * 壓縮一張圖片（2026-11-09 修正版）：
 * - 【不再改檔名、不再刪檔】檔名永遠維持原樣，後台、文章裡指到這張圖的網址才不會壞掉。
 *   （舊版會把沒有透明背景的 PNG 轉成 .jpg 並刪掉原本的 .png，
 *     但文章和後台資料還是寫 .png，照片就會整個不見。）
 * - PNG：只在尺寸超過 1600px 時縮小，存回同一個 .png 檔
 * - JPEG：只有「尺寸太大」或「檔案太大」才重新壓縮，避免越壓越糊
 * - gif/webp 或讀取失敗 → 原封不動
 *
 * 回傳處理後的檔案路徑（現在永遠等於原本的路徑）。
 */
async function optimizeImage(sharp, fullPath) {
  const ext = path.extname(fullPath).toLowerCase();
  if (!OPTIMIZABLE_EXTENSIONS.has(ext)) return fullPath;

  let meta;
  try {
    meta = await sharp(fullPath).metadata();
  } catch (e) {
    console.warn(`  ! 讀取失敗，跳過這張：${path.basename(fullPath)}（${e.message}）`);
    return fullPath;
  }

  const longEdge = Math.max(meta.width || 0, meta.height || 0);
  const isPng = ext === ".png";

  try {
    if (isPng) {
      if (longEdge > MAX_LONG_EDGE) {
        const tmpPath = fullPath + ".tmp.png";
        await sharp(fullPath)
          .resize({ width: MAX_LONG_EDGE, height: MAX_LONG_EDGE, fit: "inside", withoutEnlargement: true })
          .png({ compressionLevel: 9 })
          .toFile(tmpPath);
        fs.renameSync(tmpPath, fullPath);
        console.log(`  縮小尺寸（維持 PNG、檔名不變）：${path.basename(fullPath)}`);
      }
      return fullPath;
    }

    // 一般 JPEG：只有「尺寸太大」或「檔案太大」才重新壓縮
    const stat = fs.statSync(fullPath);
    const tooBig = longEdge > MAX_LONG_EDGE || stat.size > MAX_JPEG_BYTES;
    if (!tooBig) return fullPath;

    const tmpPath = fullPath + ".tmp.jpg";
    let pipeline = sharp(fullPath);
    if (longEdge > MAX_LONG_EDGE) {
      pipeline = pipeline.resize({ width: MAX_LONG_EDGE, height: MAX_LONG_EDGE, fit: "inside", withoutEnlargement: true });
    }
    await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(tmpPath);
    fs.renameSync(tmpPath, fullPath);
    console.log(`  重新壓縮：${path.basename(fullPath)}`);
    return fullPath;
  } catch (e) {
    console.warn(`  ! 處理失敗，跳過這張：${path.basename(fullPath)}（${e.message}）`);
    return fullPath;
  }
}

module.exports = {
  optimizeImage,
  MAX_LONG_EDGE,
  JPEG_QUALITY,
  MAX_JPEG_BYTES,
  OPTIMIZABLE_EXTENSIONS,
};
