/**
 * 1) 掃描 incoming-zips/ 資料夾，把裡面所有 .zip 檔自動解壓縮、搬進 images/：
 *    - 只挑資料夾裡的圖片副檔名（忽略 zip 裡可能夾帶的系統檔案，例如 __MACOSX、.DS_Store）
 *    - 不管 zip 裡面有沒有子資料夾，全部拉平放進 images/（跟現有相簿資料的路徑習慣一致）
 *    - 如果檔名跟 images/ 裡已經有的重複，自動在檔名前面加上毫秒時間戳記，不會覆蓋舊照片
 *    - 處理完自動刪除這個 zip 檔
 *
 * 2)【2026-09-12 新增】不管圖片是從 zip 進來、還是後台直接單張上傳，
 *    只要進到 images/ 資料夾，就會自動幫你做好這幾件事，避免「照片跑很慢」再發生：
 *    - 沒有透明背景需求的 PNG（一般相片）自動轉存成 JPEG（PNG 存相片通常會比 JPEG 大好幾倍）
 *    - 任何一邊超過 1600px 的照片，等比例縮到最長邊 1600px（前台顯示用夠了，檔案會小很多）
 *    - JPEG 統一用品質 82（mozjpeg）重新壓縮，兼顧畫質跟檔案大小
 *    - 已經處理過、本來就夠小夠小張的照片不會重複壓縮，不會越壓畫質越差
 *    - 真的需要透明背景的 PNG（例如去背過的設計素材）會保留 PNG，只做尺寸縮放
 *
 * 用法：node scripts/process-incoming-zips.js
 * 由 .github/workflows/incoming-zips.yml 自動呼叫，不需要手動執行。
 *
 * 【2026-11-09 修正】只壓縮「這次新進來的照片」：
 *    - 從 zip 解出來的照片
 *    - 這次 push 新增到 images/ 的照片（workflow 會把清單寫進 NEW_IMAGES_FILE）
 *    舊照片一律不碰。真的要把全部舊照片重新壓縮一次，
 *    到 GitHub 的 Actions 分頁手動執行，並把「optimize_all」打勾（OPTIMIZE_ALL=true）。
 * （這個腳本需要先 npm install sharp，workflow 裡已經加了這個步驟）
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { optimizeImage } = require("./lib/image-optimizer");

const ROOT = path.join(__dirname, "..");
const INCOMING_DIR = path.join(ROOT, "incoming-zips");
const IMAGES_DIR = path.join(ROOT, "images");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const IGNORE_NAMES = new Set([".ds_store", "thumbs.db"]);

function isImageFile(filename) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function shouldIgnore(relPath) {
  var base = path.basename(relPath);
  if (base.startsWith("._")) return true; // macOS resource fork files
  if (IGNORE_NAMES.has(base.toLowerCase())) return true;
  if (relPath.split(path.sep).some((p) => p === "__MACOSX")) return true;
  return false;
}

function walk(dir, out) {
  out = out || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function uniqueDestName(filename) {
  let dest = path.join(IMAGES_DIR, filename);
  if (!fs.existsSync(dest)) return filename;
  const stamped = `${Date.now()}_${filename}`;
  return stamped;
}

function extractZips() {
  const extracted = [];
  if (!fs.existsSync(INCOMING_DIR)) {
    console.log("incoming-zips/ 資料夾不存在，跳過解壓縮這一步。");
    return extracted;
  }
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const zipFiles = fs
    .readdirSync(INCOMING_DIR)
    .filter((f) => path.extname(f).toLowerCase() === ".zip");

  const otherArchives = fs
    .readdirSync(INCOMING_DIR)
    .filter((f) => [".rar", ".7z"].includes(path.extname(f).toLowerCase()));
  for (const f of otherArchives) {
    console.warn(`⚠ ${f} 不是 .zip，沒辦法自動解壓縮，請重新壓成 .zip 再上傳。`);
  }

  if (zipFiles.length === 0) {
    console.log("沒有找到新的 zip 檔，跳過解壓縮這一步。");
    return extracted;
  }

  let movedCount = 0;

  for (const zipName of zipFiles) {
    const zipPath = path.join(INCOMING_DIR, zipName);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "incoming-zip-"));

    console.log(`解壓縮：${zipName}`);
    try {
      // -O UTF-8：強制用 UTF-8 解讀壓縮檔內的檔名，避免中文檔名變亂碼
      // -q：安靜模式；-o：覆蓋（暫存資料夾裡不會有舊檔案，純粹避免互動詢問）
      execSync(`unzip -O UTF-8 -q -o "${zipPath}" -d "${tmpDir}"`, { stdio: "inherit" });
    } catch (e) {
      console.error(`解壓縮失敗：${zipName}，跳過這個檔案。`, e.message);
      continue;
    }

    const allFiles = walk(tmpDir);
    for (const filePath of allFiles) {
      const relPath = path.relative(tmpDir, filePath);
      if (shouldIgnore(relPath)) continue;
      if (!isImageFile(filePath)) continue;

      const originalName = path.basename(filePath);
      const destName = uniqueDestName(originalName);
      const destPath = path.join(IMAGES_DIR, destName);
      fs.copyFileSync(filePath, destPath);
      extracted.push(destName);
      movedCount++;
      console.log(`  -> images/${destName}${destName !== originalName ? "（檔名重複，已加時間戳記）" : ""}`);
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.unlinkSync(zipPath);
    console.log(`已刪除：incoming-zips/${zipName}`);
  }

  console.log(`解壓縮完成，共搬移 ${movedCount} 張照片進 images/。`);
  return extracted;
}

// 這次 push 新增到 images/ 的檔案（由 workflow 用 git diff 算好，一行一個路徑）
function newlyAddedImages() {
  const listFile = process.env.NEW_IMAGES_FILE;
  if (!listFile || !fs.existsSync(listFile)) return [];
  return fs
    .readFileSync(listFile, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("images/") && l.split("/").length === 2)
    .map((l) => l.slice("images/".length));
}

async function optimizeImages(names) {
  if (!fs.existsSync(IMAGES_DIR) || names.length === 0) {
    console.log("這次沒有新照片需要壓縮。");
    return;
  }

  let sharp;
  try {
    sharp = require("sharp");
  } catch (e) {
    console.warn("找不到 sharp 套件，跳過圖片壓縮這一步（workflow 裡應該要有 npm install sharp）。");
    return;
  }

  console.log(`開始檢查 ${names.length} 張照片，該壓縮的就處理（檔名不會改）...`);
  for (const f of names) {
    const full = path.join(IMAGES_DIR, f);
    if (!fs.existsSync(full)) continue;
    await optimizeImage(sharp, full);
  }
  console.log("圖片壓縮檢查完成。");
}

async function main() {
  const extracted = extractZips();
  let targets;
  if (process.env.OPTIMIZE_ALL === "true") {
    targets = fs.readdirSync(IMAGES_DIR).filter((f) => !f.startsWith("."));
    console.log("手動選了「全部重新壓縮」，這次會檢查 images/ 裡所有照片。");
  } else {
    targets = Array.from(new Set(extracted.concat(newlyAddedImages())));
  }
  await optimizeImages(targets);
}

main();
