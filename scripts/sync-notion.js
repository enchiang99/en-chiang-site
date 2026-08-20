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
 *
 * 重要：這支腳本會保留每篇文章內文下方、由網站編輯模式手動新增的
 * 「相簿」區塊（class="biz-albums post-albums" 與其後的 biz-album-actions）。
 * 因為這些相簿不是存在 Notion 裡，而是直接存在 index.html 裡，
 * 每次同步都要把它們從「舊版 index.html」裡讀出來、原封不動接回新文章後面，
 * 否則自動同步一跑就會把手動加的相簿洗掉。
 */

const fs = require('fs');
const path = require('path');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ARTICLES_DB_ID = process.env.ARTICLES_DB_ID;
const NOTION_VERSION = '2022-06-28';
const INDEX_PATH = path.join(__dirname, '..', 'index.html');

// 每次呼叫 Notion API 的逾時秒數，超過就視為失敗（避免卡住整個 workflow）
const FETCH_TIMEOUT_MS = 15000;
// 失敗或逾時時最多重試幾次
const MAX_RETRIES = 2;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notionFetch(url, options = {}, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
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
    return await res.json();
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    const reason = isTimeout ? `逾時（超過 ${FETCH_TIMEOUT_MS / 1000} 秒未回應）` : err.message;
    if (attempt <= MAX_RETRIES) {
      console.warn(`Notion API 呼叫失敗（第 ${attempt} 次），原因：${reason}，準備重試...`);
      await sleep(2000 * attempt);
      return notionFetch(url, options, attempt + 1);
    }
    throw new Error(`Notion API 呼叫失敗，已重試 ${MAX_RETRIES} 次仍失敗：${reason}\nURL: ${url}`);
  } finally {
    clearTimeout(timer);
  }
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
// Notion 文字顏色 -> 網站用的 CSS 色碼(取跟 Notion 介面相近的顏色)
const NOTION_TEXT_COLORS = {
  gray: '#787774',
  brown: '#976A46',
  orange: '#CC782F',
  yellow: '#C29343',
  green: '#548164',
  blue: '#487CA5',
  purple: '#8A6BAB',
  pink: '#B75283',
  red: '#C4554D',
};

// Notion 螢光筆底色 -> 網站用的 CSS 色碼
const NOTION_BG_COLORS = {
  gray_background: '#F1F1EF',
  brown_background: '#F3EEEE',
  orange_background: '#FAEBDD',
  yellow_background: '#FBF3DB',
  green_background: '#EDF3EC',
  blue_background: '#E7F3F8',
  purple_background: '#F6F3F9',
  pink_background: '#FAF1F5',
  red_background: '#FDEBEC',
};

function richTextToHtml(richText) {
  return (richText || [])
    .map((rt) => {
      let text = escapeHtml(rt.plain_text || '');
      if (rt.annotations?.bold) text = `<strong>${text}</strong>`;
      if (rt.annotations?.italic) text = `<em>${text}</em>`;
      if (rt.annotations?.strikethrough) text = `<s>${text}</s>`;
      if (rt.annotations?.underline) text = `<u>${text}</u>`;
      if (rt.href) text = `<a href="${escapeHtml(rt.href)}" target="_blank" rel="noopener">${text}</a>`;
      // 文字顏色 / 螢光筆底色（外層包一個 span，讓顏色蓋在最外面）
      const color = rt.annotations?.color;
      if (color && color !== 'default') {
        if (color.endsWith('_background')) {
          const bg = NOTION_BG_COLORS[color];
          if (bg) text = `<span style="background-color:${bg}">${text}</span>`;
        } else {
          const c = NOTION_TEXT_COLORS[color];
          if (c) text = `<span style="color:${c}">${text}</span>`;
        }
      }
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

// 從「同步前」的舊版 index.html 裡，把指定文章 post-body 結束後、
// </article> 之前的內容（也就是手動加的相簿區塊）抓出來保留。
// 找不到該文章、或該文章本來就沒有相簿區塊時，回傳空字串。
function extractPreservedExtras(oldHtml, postId) {
  const articleOpenNeedle = `<article class="post" id="${postId}">`;
  const articleStart = oldHtml.indexOf(articleOpenNeedle);
  if (articleStart === -1) return '';

  const articleCloseNeedle = '</article>';
  const articleEnd = oldHtml.indexOf(articleCloseNeedle, articleStart);
  if (articleEnd === -1) return '';

  const articleHtml = oldHtml.slice(articleStart, articleEnd);

  const postBodyNeedle = 'class="post-body';
  const pbNeedlePos = articleHtml.indexOf(postBodyNeedle);
  if (pbNeedlePos === -1) return '';

  const pbDivStart = articleHtml.lastIndexOf('<div', pbNeedlePos);
  if (pbDivStart === -1) return '';

  let pbRange;
  try {
    pbRange = findMatchingDivRangeAt(articleHtml, pbDivStart);
  } catch (err) {
    console.warn(`保留相簿區塊時解析失敗（${postId}）：${err.message}`);
    return '';
  }

  const [, pbEnd] = pbRange;
  return articleHtml.slice(pbEnd); // post-body 結束後、</article> 前的所有內容
}

// 掃描舊版 index.html 的 #articleStore，找出「所有」文章區塊，
// 回傳 { id -> 完整 <article>...</article> HTML } 的對照表。
// 用途：找出哪些文章不是這次從 Notion 抓回來的（=手動在網站上新增、
// 從未寫進 Notion 的文章），這些要原封不動保留，否則會被同步直接砍掉。
function collectAllOldArticles(oldHtml) {
  const map = {};
  const storeNeedle = '<div id="articleStore"';
  const storeStart = oldHtml.indexOf(storeNeedle);
  if (storeStart === -1) return map;
  let range;
  try {
    range = findMatchingDivRangeAt(oldHtml, storeStart);
  } catch (err) {
    return map;
  }
  const [s, e] = range;
  const storeHtml = oldHtml.slice(s, e);

  const articleOpenRe = /<article class="post" id="([^"]+)">/g;
  let m;
  while ((m = articleOpenRe.exec(storeHtml))) {
    const id = m[1];
    const openStart = m.index;
    const closeIdx = storeHtml.indexOf('</article>', openStart);
    if (closeIdx === -1) continue;
    const fullHtml = storeHtml.slice(openStart, closeIdx + '</article>'.length);
    map[id] = fullHtml;
  }
  return map;
}

// 掃描舊版 index.html 裡指定分類(group)選單裡的所有連結，
// 回傳 [{ id, html }]，用來找出「手動加的、不是 Notion 文章」的選單連結，
// 這些也要原封不動保留，否則同步後選單裡會直接不見。
function collectOldSublistLinks(oldHtml, group) {
  const groupNeedle = `data-group="${group}"`;
  const groupPos = oldHtml.indexOf(groupNeedle);
  if (groupPos === -1) return [];
  const sublistNeedle = 'class="menu-sublist';
  const sublistPos = oldHtml.indexOf(sublistNeedle, groupPos);
  const sublistTagStart = oldHtml.lastIndexOf('<div', sublistPos);
  if (sublistTagStart === -1) return [];
  let range;
  try {
    range = findMatchingDivRangeAt(oldHtml, sublistTagStart);
  } catch (err) {
    return [];
  }
  const [s, e] = range;
  const openTagEnd = oldHtml.indexOf('>', sublistTagStart) + 1;
  const inner = oldHtml.slice(openTagEnd, e - '</div>'.length);

  const anchorRe = /<a\b[^>]*>[\s\S]*?<\/a>/g;
  const results = [];
  let m;
  while ((m = anchorRe.exec(inner))) {
    const anchorHtml = m[0];
    const onclickMatch = anchorHtml.match(/showArticle\('(post-[^']+)'\)/);
    const hrefMatch = anchorHtml.match(/href="#(post-[^"]+)"/);
    const id = (onclickMatch && onclickMatch[1]) || (hrefMatch && hrefMatch[1]);
    if (id) results.push({ id, html: anchorHtml });
  }
  return results;
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

  // 文章由舊到新排序
  articles.sort((a, b) => new Date(a.date) - new Date(b.date));

  let html = fs.readFileSync(INDEX_PATH, 'utf-8');
  const oldHtml = html; // 同步前的舊內容，用來找回手動加的相簿區塊、以及手動新增的文章

  const syncedIds = new Set(articles.map((a) => a.id));

  // 1) 重建 #articleStore
  //    - Notion 抓回來的文章：相簿區塊從舊版 index.html 裡原封不動接回來
  //    - 舊版裡「不屬於這次 Notion 同步範圍」的文章（=手動用「＋新增子項目」建立、
  //      從未寫進 Notion 的文章）：整篇原封不動保留，不會被砍掉
  const notionArticlesHtml = articles
    .map((a) => {
      const preservedExtras = extractPreservedExtras(oldHtml, a.id);
      return `<article class="post" id="${a.id}"><h2 class="post-title editable">${escapeHtml(a.title)}</h2><div class="post-date editable">${escapeHtml(a.dateLabel)}</div><div class="post-body editable">${a.bodyHtml}</div>${preservedExtras}</article>`;
    })
    .join('');

  const allOldArticles = collectAllOldArticles(oldHtml);
  const manualArticlesHtml = Object.keys(allOldArticles)
    .filter((id) => !syncedIds.has(id))
    .map((id) => {
      console.log(`  保留手動新增的文章（不在 Notion 裡）: ${id}`);
      return allOldArticles[id];
    })
    .join('');

  const articleStoreHtml = notionArticlesHtml + manualArticlesHtml;
  {
    const [s, e] = findMatchingDivRange(html, '<div id="articleStore"');
    const openTagEnd = html.indexOf('>', html.indexOf('<div id="articleStore"')) + 1;
    html = html.slice(0, openTagEnd) + articleStoreHtml + '</div>' + html.slice(e);
  }

  // 2) 重建每個分類選單(menu-sublist)裡的文章連結
  //    - Notion 抓回來的文章：正常重新產生連結
  //    - 舊版選單裡「不屬於這次 Notion 同步範圍」的連結（=手動新增文章的連結）：
  //      原封不動保留在該分類選單最後面
  for (const group of Object.values(CATEGORY_TO_GROUP)) {
    const groupArticles = articles.filter((a) => a.group === group);
    const notionLinksHtml = groupArticles
      .map(
        (a) =>
          `<a href="#${a.id}" class="menu-sub-link" onclick="if(document.body.classList.contains('edit-access')){ event.preventDefault(); showArticle('${a.id}'); }"><span class="editable">${escapeHtml(a.title)}</span></a>`
      )
      .join('');

    const oldLinks = collectOldSublistLinks(oldHtml, group);
    const manualLinksHtml = oldLinks
      .filter((link) => !syncedIds.has(link.id))
      .map((link) => link.html)
      .join('');

    const linksHtml = notionLinksHtml + manualLinksHtml;

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
