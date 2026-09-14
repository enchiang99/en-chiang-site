/**
 * 一次性搬遷工具：把目前資料檔裡「還在借用 V1（正式站 enchiang.com）網址」的照片，
 * 抓下來、跑一次跟整批上傳一樣的自動壓縮／轉檔，存進 V2 自己的 images/ 資料夾，
 * 然後把資料檔裡對應的網址，從 https://enchiang.com/images/xxx 改成 V2 自己的 /images/xxx。
 *
 * 這樣轉正式網域之後，V2 就不再需要依賴 enchiang.com 這個網址才能顯示照片，
 * 而且全部照片都會套用同一套壓縮標準（轉 JPEG、最長邊 1600px、品質 82）。
 *
 * ⚠️ 只會「新增」處理過的照片到 images/，不會刪除 images/ 裡任何現有檔案——
 * 像透過「整批上傳 zip」或後台單張上傳、本來就已經是 /images/xxx 這種本機路徑的照片，
 * 完全不會被這個腳本動到，安全上不會有「V2 自己獨有的照片被誤刪」這種風險。
 *
 * 這是「一次性」的搬遷工具，不會自動觸發，要到 GitHub 網頁的 Actions 分頁，
 * 選「一次性搬遷：把 V1 的照片抓進 V2 並壓縮」這個流程，手動點「Run workflow」執行。
 *
 * 用法：node scripts/migrate-v1-images.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { optimizeImage } = require("./lib/image-optimizer");

const ROOT = path.join(__dirname, "..");
const IMAGES_DIR = path.join(ROOT, "images");
const V1_PREFIX = "https://enchiang.com/images/";

// 掃描這幾個資料夾裡的文字內容檔案（YAML 資料檔＋文章 markdown），找出還在用 V1 網址的照片。
// 不掃 images/、assets/、.git、node_modules 這些跟「內容」無關的資料夾。
const SCAN_ROOTS = [
  path.join(ROOT, "_data"),
  path.join(ROOT, "_about_en"),
  path.join(ROOT, "_about_daily"),
  path.join(ROOT, "_about_love"),
];
const SCAN_EXTENSIONS = new Set([".yml", ".yaml", ".md", ".markdown"]);

function listContentFiles(dir, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listContentFiles(full, out);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return download(res.headers.location, destPath).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on("finish", () => fileStream.close(resolve));
        fileStream.on("error", reject);
      })
      .on("error", reject);
  });
}

/**
 * 逐行找出這個檔案裡「還在用 V1 網址」的完整網址。
 * 不能單純用「遇到空白就停」的正規表示式，因為有些照片檔名本身就帶空白
 * （例如「四款招牌 一起上街.png」），YAML 裡通常會用引號包起來，
 * 但也可能沒加引號（YAML 純量本身可以包含空白）。
 * 這裡改成：有引號就抓到對應的收尾引號為止，沒引號就抓到這一行結尾（去掉行尾空白）。
 */
function extractV1Urls(content) {
  const urls = new Set();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    let searchFrom = 0;
    while (true) {
      const idx = line.indexOf(V1_PREFIX, searchFrom);
      if (idx === -1) break;
      const before = idx > 0 ? line[idx - 1] : "";
      let rest = line.slice(idx);
      if (before === '"') {
        const end = rest.indexOf('"');
        if (end !== -1) rest = rest.slice(0, end);
      } else if (before === "'") {
        const end = rest.indexOf("'");
        if (end !== -1) rest = rest.slice(0, end);
      } else {
        rest = rest.replace(/\s+$/, ""); // 沒加引號：值是這一行剩下的部分，只去掉行尾空白
      }
      if (rest) urls.add(rest);
      searchFrom = idx + V1_PREFIX.length;
    }
  }
  return urls;
}

function uniqueLocalPath(filename) {
  let dest = path.join(IMAGES_DIR, filename);
  if (!fs.existsSync(dest)) return dest;
  // 萬一 images/ 裡剛好已經有同名檔案（例如之前手動放過一張同名照片），
  // 一樣比照整批上傳的做法，加時間戳記，不覆蓋、不刪掉舊的。
  const stamped = `v1_${Date.now()}_${filename}`;
  return path.join(IMAGES_DIR, stamped);
}

async function main() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch (e) {
    console.error("找不到 sharp 套件，無法執行壓縮（workflow 裡應該要有 npm install sharp）。");
    process.exit(1);
  }

  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const contentFiles = SCAN_ROOTS.flatMap((dir) => listContentFiles(dir));
  console.log(`掃描了 ${contentFiles.length} 個資料檔／文章檔案，尋找還在用 V1 網址的照片...`);

  const fileContents = new Map();
  const urlSet = new Set();
  for (const f of contentFiles) {
    const content = fs.readFileSync(f, "utf-8");
    fileContents.set(f, content);
    extractV1Urls(content).forEach((u) => urlSet.add(u));
  }

  if (urlSet.size === 0) {
    console.log("沒有找到任何還在用 V1 網址的照片，結束（可能都已經搬遷過了）。");
    return;
  }

  console.log(`找到 ${urlSet.size} 張還在用 V1 網址的照片，開始逐一下載＋壓縮...`);

  const urlToLocal = new Map();
  let okCount = 0;
  let failCount = 0;

  for (const url of urlSet) {
    let filename;
    try {
      filename = decodeURIComponent(url.slice(V1_PREFIX.length));
    } catch (e) {
      filename = url.slice(V1_PREFIX.length);
    }
    filename = path.basename(filename); // 保險起見，避免網址裡帶奇怪的路徑片段

    const downloadPath = uniqueLocalPath(filename);
    console.log(`下載：${filename}`);
    try {
      // 網址裡可能有空白或中文（例如檔名帶空白、全形符號），實際發送 HTTP 請求前要編碼成合法網址；
      // 但檔名、資料檔裡要比對／替換的字串都還是用原始未編碼的 url，兩者分開處理。
      await download(encodeURI(url), downloadPath);
    } catch (e) {
      console.warn(`  ! 下載失敗，跳過：${url}（${e.message}）`);
      failCount++;
      continue;
    }

    const finalPath = await optimizeImage(sharp, downloadPath);
    const finalName = path.basename(finalPath);
    urlToLocal.set(url, "/images/" + finalName);
    console.log(`  -> images/${finalName}`);
    okCount++;
  }

  // 把資料檔／文章檔案裡的 V1 網址，換成 V2 自己的本機路徑
  let updatedFiles = 0;
  for (const [f, originalContent] of fileContents) {
    let content = originalContent;
    let changed = false;
    for (const [url, localPath] of urlToLocal) {
      if (content.includes(url)) {
        content = content.split(url).join(localPath);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(f, content, "utf-8");
      updatedFiles++;
      console.log(`已更新網址：${path.relative(ROOT, f)}`);
    }
  }

  console.log(
    `搬遷完成：成功 ${okCount} 張、失敗 ${failCount} 張，更新了 ${updatedFiles} 個資料檔／文章檔案裡的網址。`
  );
  if (failCount > 0) {
    console.log("下載失敗的照片，資料檔裡的網址會維持原本的 V1 網址（不影響前台顯示，只是還沒搬過來），可以之後重跑一次這個流程。");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
