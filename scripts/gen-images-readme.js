// 自動掃描 images/ 資料夾，依照每個檔案「最後一次上傳（commit）日期」新到舊排序，
// 產生 images/README.md，讓手機瀏覽 GitHub 時能直接看到縮圖預覽。
// 由 .github/workflows/images-readme.yml 在 images/ 資料夾有變動時自動觸發，不需要手動執行。

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

function getLastCommitDate(relPath) {
  try {
    const out = execSync(
      `git log -1 --format=%ad --date=format:%Y-%m-%d -- "${relPath}"`,
      { cwd: ROOT }
    ).toString().trim();
    return out || '0000-00-00';
  } catch (e) {
    return '0000-00-00';
  }
}

function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error('images/ 資料夾不存在，略過');
    return;
  }

  const files = fs.readdirSync(IMAGES_DIR)
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()));

  const entries = files.map(name => ({
    name,
    date: getLastCommitDate(`images/${name}`)
  }));

  // 新到舊排序；日期相同則依檔名排序，確保結果穩定
  entries.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.name.localeCompare(b.name);
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  let md = '# 圖片總覽（images/ 資料夾）\n\n';
  md += '此檔案由 GitHub Actions 自動產生與更新，依照上傳日期新到舊排序，方便手機瀏覽時直接看縮圖對照檔名。\n';
  md += '**請勿手動編輯**，改了也會在下次有圖片變動時被自動覆蓋。\n\n';
  md += `最後自動更新：${todayStr}　·　共 ${entries.length} 張圖片\n\n---\n\n`;

  for (const e of entries) {
    md += `### \`${e.name}\`　·　${e.date}\n`;
    md += `![${e.name}](./${e.name})\n\n`;
  }

  fs.writeFileSync(path.join(IMAGES_DIR, 'README.md'), md, 'utf8');
  console.log(`已產生 images/README.md，共 ${entries.length} 張圖片`);
}

main();
