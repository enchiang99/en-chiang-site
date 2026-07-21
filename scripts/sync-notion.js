/**
 * sync-notion.js
 * 從 Notion「文章 Articles」資料庫抓取狀態=發佈的文章，
 * 重新產生 index.html 裡的 #articleStore 內容與選單(menu-sublist)清單。
 *
 * 需要的環境變數（由 GitHub Actions 的 Secrets 提供）：
 *   NOTION_TOKEN      Notion internal integration 的 API 金鑰
 *   ARTICLES_DB_ID    「文章 Articles」資料庫的 ID
 *
 * 使用方式：node scripts/sync-notion.js
 * 執行完會直接覆寫 repo 根目錄的 index.html。
 */

const fs = require('fs');
const path = require('path');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ARTICLES_DB_ID = process.env.ARTICLES_DB_ID;
const NOTION_VERSION = '2022-06-28';
const INDEX_PATH = path.join(__dirname, '..', 'index.html');

// 分類 -> index.html 裡對應的 menu-group data-group 值
const CATEGORY_TO_GROUP = {
  '關於EN': 'about-en',
  '關於日常': 'about-daily',
  '關於愛': 'journal',
};

if (!NOTION_TOKEN || !ARTICLES_DB_ID) {
  console.error('缺少 NOTION_TOKEN 或 ARTICLES_DB_ID 環境變數，中止執行。');
  process.exit(1);
}

async function notionFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

// 抓資料庫裡所有「狀態 = 發佈」的頁面
async function queryPublishedArticles() {
  const results = [];
  let cursor = undefined;
  do {
    const body = {
      filter: { property: '狀態', select: { equals: '發佈' } },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    };
    const data = await notionFetch(
      `https://api.notion.com/v1/databases/${ARTICLES_DB_ID}/query`,
      { method: 'POST', body: JSON.stringify(body) }
    );
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

// 抓單一頁面下的所有 block（分頁）
async function fetchBlocks(blockId) {
  const blocks = [];
  let cursor = undefined;
  do {
    const qs = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
    const data = await notionFetch(`https://api.notion.com/v1/blocks/${blockId}/children?${qs}`);
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 把 Notion 的 rich_text 陣列轉成帶基本樣式的 HTML（粗體/斜體/連結）
function richTextToHtml(richText) {
  return (richText || [])
    .map((rt) => {
      let text = escapeHtml(rt.plain_text || '');
      if (rt.annotations?.bold) text = `<strong>${text}</strong>`;
      if (rt.annotations?.italic) text = `<em>${text}</em>`;
      if (rt.href) text = `<a href="${escapeHtml(rt.href)}" target="_blank" rel="noopener">${text}</a>`;
      return text;
    })
    .join('');
}

function richTextToPlain(richText) {
  return (richText || []).map((rt) => rt.plain_text || '').join('');
}

// 把一批 Notion block 轉成文章內文 HTML（對應 .post-body 的格式）
function blocksToHtml(blocks) {
  const html = [];
  let listBuffer = [];
  let listTag = null;

  function flushList() {
    if (listBuffer.length) {
      html.push(`<${listTag}>${listBuffer.join('')}</${listTag}>`);
      listBuffer = [];
      listTag = null;
    }
  }

  for (const block of blocks) {
    const type = block.type;
    if (type === 'paragraph') {
      flushList();
      const text = richTextToHtml(block.paragraph.rich_text);
      html.push(`<p>${text || '<br>'}</p>`);
    } else if (type === 'heading_1' || type === 'heading_2' || type === 'heading_3') {
      flushList();
      const level = type === 'heading_1' ? 'h2' : type === 'heading_2' ? 'h3' : 'h4';
      html.push(`<${level}>${richTextToHtml(block[type].rich_text)}</${level}>`);
    } else if (type === 'bulleted_list_item') {
      if (listTag !== 'ul') { flushList(); listTag = 'ul'; }
      listBuffer.push(`<li>${richTextToHtml(block.bulleted_list_item.rich_text)}</li>`);
    } else if (type === 'numbered_list_item') {
      if (listTag !== 'ol') { flushList(); listTag = 'ol'; }
      listBuffer.push(`<li>${richTextToHtml(block.numbered_list_item.rich_text)}</li>`);
    } else if (type === 'quote') {
      flushList();
      html.push(`<blockquote>${richTextToHtml(block.quote.rich_text)}</blockquote>`);
    } else if (type === 'image') {
      flushList();
      const src = block.image.type === 'external' ? block.image.external.url : block.image.file.url;
      const caption = richTextToPlain(block.image.caption);
      html.push(`<img src="${escapeHtml(src)}" alt="${escapeHtml(caption || '')}" loading="lazy">`);
    } else if (type === 'divider') {
      flushList();
      html.push('<hr>');
    }
    // 其他 block 類型暫不處理，需要的話之後再擴充
  }
  flushList();
  return html.join('');
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 用 Notion page id（去掉連字號）當作穩定不變的 post id，
// 這樣同一篇文章每次同步都會產生一樣的錨點，選單連結不會失效。
function postIdFromPageId(pageId) {
  return 'post-' + pageId.replace(/-/g, '');
}

// 從 tagStart（<div 開始的位置）用括號深度比對，找出它真正對應的 </div>
// 回傳 [開始位置, 結束位置)，結束位置是 </div> 之後
function findMatchingDivRangeAt(html, tagStart) {
  const openEnd = html.indexOf('>', tagStart) + 1;
  const tagRe = /<div\b[^>]*>|<\/div>/g;
  tagRe.lastIndex = openEnd;
  let depth = 1;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m[0] === '</div>') depth -= 1;
    else depth += 1;
    if (depth === 0) {
      return [tagStart, tagRe.lastIndex];
    }
  }
  throw new Error('找不到區塊結尾（div 未正確配對）');
}

// 用 needle 找到第一個符合的 <div ...> 開頭位置，再交給 findMatchingDivRangeAt
function findMatchingDivRange(html, startNeedle) {
  const start = html.indexOf(startNeedle);
  if (start === -1) throw new Error(`找不到區塊: ${startNeedle}`);
  return findMatchingDivRangeAt(html, start);
}

async function main() {
  console.log('讀取 Notion 文章清單...');
  const pages = await queryPublishedArticles();
  console.log(`共 ${pages.length} 篇已發佈文章`);

  const articles = [];
  for (const page of pages) {
    const props = page.properties;
    const title = richTextToPlain(props['標題']?.title) || '(未命名)';
    const category = props['分類']?.select?.name || '';
    const dateStr = props['發佈日期']?.date?.start || page.created_time;
    const group = CATEGORY_TO_GROUP[category];
    if (!group) {
      console.warn(`文章「${title}」的分類「${category}」無法對應到選單，先略過`);
      continue;
    }
    console.log(`  抓取內文: ${title}`);
    const blocks = await fetchBlocks(page.id);
    const bodyHtml = blocksToHtml(blocks);
    articles.push({
      id: postIdFromPageId(page.id),
      title,
      group,
      date: dateStr,
      dateLabel: formatDateLabel(dateStr),
      bodyHtml,
    });
  }

  // 新文章排前面
  articles.sort((a, b) => new Date(b.date) - new Date(a.date));

  let html = fs.readFileSync(INDEX_PATH, 'utf-8');

  // 1) 重建 #articleStore
  const articleStoreHtml = articles
    .map(
      (a) =>
        `<article class="post" id="${a.id}"><h1 class="post-title editable">${escapeHtml(a.title)}</h1><div class="post-date editable">${escapeHtml(a.dateLabel)}</div><div class="post-body editable">${a.bodyHtml}</div></article>`
    )
    .join('');
  {
    const [s, e] = findMatchingDivRange(html, '<div id="articleStore"');
    const openTagEnd = html.indexOf('>', html.indexOf('<div id="articleStore"')) + 1;
    html = html.slice(0, openTagEnd) + articleStoreHtml + '</div>' + html.slice(e);
  }

  // 2) 重建每個分類選單(menu-sublist)裡的文章連結
  for (const group of Object.values(CATEGORY_TO_GROUP)) {
    const groupArticles = articles.filter((a) => a.group === group);
    const linksHtml = groupArticles
      .map(
        (a) =>
          `<a href="#${a.id}" target="_blank" rel="noopener" class="menu-sub-link"><span class="editable">${escapeHtml(a.title)}</span></a>`
      )
      .join('');
    const groupNeedle = `data-group="${group}"`;
    const groupPos = html.indexOf(groupNeedle);
    if (groupPos === -1) {
      console.warn(`找不到選單分類: ${group}`);
      continue;
    }
    const sublistNeedle = 'class="menu-sublist';
    const sublistPos = html.indexOf(sublistNeedle, groupPos);
    const sublistTagStart = html.lastIndexOf('<div', sublistPos);
    const [s, e] = findMatchingDivRangeAt(html, sublistTagStart);
    const openTagEnd = html.indexOf('>', sublistTagStart) + 1;
    html = html.slice(0, openTagEnd) + linksHtml + '</div>' + html.slice(e);
  }

  fs.writeFileSync(INDEX_PATH, html, 'utf-8');
  console.log('index.html 已更新');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
