/**
 * 產生 images/images-README.md：
 * - 掃描 images/ 資料夾裡所有圖片
 * - 依「最後一次被 commit 的時間」排序（新的在最上面，符合「依上傳時間排序」）
 * - 每張圖顯示縮圖預覽（GitHub 網頁上看得到），下面附一行可以直接複製貼上的網址
 *   這個網址是給 /admin/ 後台的「Replace with URL」用的，不用重新上傳同一張照片
 *
 * 用法：node scripts/gen-images-readme.js
 * 會被 GitHub Actions 自動呼叫，不需要手動執行。
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const IMAGES_DIR = path.join(__dirname, "..", "images");
const README_PATH = path.join(IMAGES_DIR, "images-README.md");

// 這個 repo 名稱要跟實際部署的 repo 一致；測試站是 en-chiang-site-v2，
// 之後正式搬到 en-chiang-site 時記得把這行改掉。
const REPO = "enchiang99/en-chiang-site-v2";
const BRANCH = "main";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

function isImageFile(filename) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function getLastCommitTime(filePath) {
  try {
    const relPath = path.relative(path.join(__dirname, ".."), filePath);
    const output = execSync(`git log -1 --format=%ct -- "${relPath}"`, {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
    }).trim();
    if (output) return parseInt(output, 10) * 1000;
  } catch (e) {
    // 如果檔案還沒被 commit 過（例如這次流程剛加進來還沒 commit），
    // 就退回用檔案本身的修改時間排序。
  }
  return fs.statSync(filePath).mtimeMs;
}

function formatDate(ms) {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log("images/ 資料夾不存在，結束。");
    return;
  }

  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => isImageFile(f))
    .map((f) => {
      const fullPath = path.join(IMAGES_DIR, f);
      return {
        name: f,
        time: getLastCommitTime(fullPath),
      };
    })
    .sort((a, b) => b.time - a.time);

  let md = "# 照片總覽\n\n";
  md +=
    "這份清單會自動更新，不用手動維護。每張照片下面那行網址可以直接複製，貼到 `/admin/` 後台圖片欄位的「Replace with URL」，不用重新上傳同一張照片。\n\n";
  md += `共 ${files.length} 張照片，依最後上傳時間排序（新到舊）。\n\n---\n\n`;

  for (const file of files) {
    const rawUrl = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/images/${encodeURIComponent(
      file.name
    )}`;
    md += `### ${file.name}\n`;
    md += `上傳日期：${formatDate(file.time)}\n\n`;
    md += `![${file.name}](./${encodeURIComponent(file.name)})\n\n`;
    md += "複製這行網址貼到後台：\n";
    md += "```\n" + rawUrl + "\n```\n\n---\n\n";
  }

  fs.writeFileSync(README_PATH, md, "utf8");
  console.log(`已產生 images/images-README.md，共 ${files.length} 張照片。`);
}

main();
