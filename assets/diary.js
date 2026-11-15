/* =========================================================
   enchiang.com 日記本首頁（2026-11）
   資料全部來自後台（_data/site.yml、文章 collections、_data/business），
   由 index.html 用 Liquid 輸出成 #diary-data，這支程式只負責「排版成一本日記」。
   ========================================================= */
(function () {
  'use strict';
  var dataEl = document.getElementById('diary-data');
  var root = document.getElementById('diary');
  if (!dataEl || !root) return;
  var RAW;
  try { RAW = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var BASE = RAW.baseurl || '';

  /* ---------- 小工具 ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function lines(s) {
    return String(s || '').split(/\r?\n/).map(function (x) { return x.trim(); });
  }
  function nonEmpty(arr) { return arr.filter(function (x) { return x; }); }
  function cleanId(id) { return String(id || '').split('?')[0].split('&')[0].trim(); }
  function src(s) {
    s = String(s || '').trim();
    if (!s) return '';
    if (/^https?:\/\//.test(s)) return s;
    return BASE + (s.charAt(0) === '/' ? s : '/' + s);
  }
  function ytThumb(id) { return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; }
  function svg(path, size) {
    var ns = 'http://www.w3.org/2000/svg';
    var s = document.createElementNS(ns, 'svg');
    s.setAttribute('width', size || 20); s.setAttribute('height', size || 20); s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.7');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    path.split('|').forEach(function (d) {
      var p;
      if (d.indexOf('r:') === 0) { var r = d.slice(2).split(','); p = document.createElementNS(ns, 'rect'); p.setAttribute('x', r[0]); p.setAttribute('y', r[1]); p.setAttribute('width', r[2]); p.setAttribute('height', r[3]); p.setAttribute('rx', r[4]); }
      else if (d.indexOf('fc:') === 0) { var q = d.slice(3).split(','); p = document.createElementNS(ns, 'circle'); p.setAttribute('cx', q[0]); p.setAttribute('cy', q[1]); p.setAttribute('r', q[2]); p.setAttribute('fill', 'currentColor'); p.setAttribute('stroke', 'none'); }
      else if (d.indexOf('c:') === 0) { var a = d.slice(2).split(','); p = document.createElementNS(ns, 'circle'); p.setAttribute('cx', a[0]); p.setAttribute('cy', a[1]); p.setAttribute('r', a[2]); }
      else if (d.indexOf('f:') === 0) { p = document.createElementNS(ns, 'path'); p.setAttribute('d', d.slice(2)); p.setAttribute('fill', 'currentColor'); p.setAttribute('stroke', 'none'); }
      else { p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); }
      s.appendChild(p);
    });
    return s;
  }

  /* ---------- 頻道 icon（跟舊版商業頁同一組圖示） ---------- */
  var ICONS = {
    youtube: ['r:2.5,5.5,19,13,3.5', 'f:M10.3 9.4L15 12L10.3 14.6Z'],
    instagram: ['r:3,3,18,18,5', 'c:12,12,4.2', 'fc:17.2,6.8,1.1'],
    tiktok: ['M14 4v10.2a3.3 3.3 0 1 1-2.6-3.23', 'M14 4c.4 2.2 2 3.7 4 4'],
    facebook: ['c:12,12,9.5', 'M14 8.5h-1.6c-.9 0-1.4.5-1.4 1.5v2h3l-.4 3h-2.6v6'],
    threads: ['c:12,12,9.5', 'M9 8.5c3.5-1 6.2.2 6.2 3.6 0 2.6-1.7 4.1-4 4.1-1.6 0-2.6-.8-2.6-1.9 0-1.5 1.7-2 3.6-2 1.9 0 3.2.6 3.2 2.3']
  };
  var NAMES = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', threads: 'Threads' };
  function socialLinks(list) {
    return (list || []).filter(function (l) { return l && l.url && String(l.url).trim(); })
      .map(function (l) { return { platform: String(l.platform || '').toLowerCase(), url: String(l.url).trim() }; });
  }
  function linkRow(links, cls) {
    var row = el('div', cls);
    links.forEach(function (l) {
      var a = el('a'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener';
      a.setAttribute('aria-label', (NAMES[l.platform] || l.platform || '連結') + '（另開新視窗）');
      a.appendChild(svg((ICONS[l.platform] || ['c:12,12,9.5']).join('|'), 18));
      row.appendChild(a);
    });
    return row;
  }

  /* ---------- 整理資料：相簿、影片都變成「記憶金球」 ---------- */
  var ALBUMS = {};
  var albumSeq = 0;
  function makeAlbum(title, items, links) {
    items = items.filter(function (it) { return it && (it.src || it.yt); });
    if (!items.length) return null;
    var id = 'm' + (albumSeq++);
    var imgs = items.filter(function (i) { return i.src; }).length;
    var vids = items.length - imgs;
    var first = items[0];
    var count = imgs && vids ? imgs + ' 張・影片 ' + vids + ' 支' : imgs ? imgs + ' 張' : (vids > 1 ? '影片 ' + vids + ' 支' : '影片');
    links = links || [];
    ALBUMS[id] = { title: title, items: items, links: links };
    return { id: id, title: title, cover: first.src || ytThumb(first.yt), video: !first.src, count: count, links: links };
  }
  function albumOrb(a) {
    var items = [];
    (a.photos || []).forEach(function (p) {
      var v = cleanId(p.video_id);
      if (v) items.push({ yt: v });
      else if (p.src) items.push({ src: src(p.src) });
    });
    if (cleanId(a.video_id)) items.push({ yt: cleanId(a.video_id) });
    return makeAlbum(a.title || '相簿', items, socialLinks(a.social_links));
  }
  var chapters = (RAW.chapters || []).map(function (ch) {
    return {
      name: ch.name, en: ch.en, tagline: ch.tagline, desc: nonEmpty(lines(ch.desc)),
      articles: (ch.articles || []).map(function (a) {
        var orbs = [];
        if (cleanId(a.video_id)) orbs.push(makeAlbum(a.title, [{ yt: cleanId(a.video_id) }]));
        (a.albums || []).forEach(function (al) { var o = albumOrb(al); if (o) orbs.push(o); });
        (a.videos || []).forEach(function (v) {
          var id = cleanId(v.youtube_id); if (!id) return;
          var parts = String(v.caption || '影片').split('·');
          var o = makeAlbum(parts[0].trim(), [{ yt: id }]);
          if (o && parts[1]) o.count = '影片・' + parts[1].trim();
          orbs.push(o);
        });
        return { title: a.title, date: a.date || '', body: nonEmpty(lines(a.body)), orbs: orbs.filter(Boolean) };
      })
    };
  });
  var QUOTE = { text: RAW.quote && RAW.quote.text, lines: lines(RAW.quote && RAW.quote.desc) };
  while (QUOTE.lines.length && !QUOTE.lines[QUOTE.lines.length - 1]) QUOTE.lines.pop();
  var CONTACT = RAW.contact || {};

  /* ---------- 把一頁的資料畫成 DOM ---------- */
  var S = { mode: 'single', pages: [], idx: 0, sp: 0, turning: null, amb: false, closed: false };

  function renderPage(pg, side) {
    var page = el('section', 'dp' + (side === 'left' ? ' left' : '') + (pg.type === 'blank' ? ' blank' : ''));
    page.style.backgroundPosition = ((pg.i * 37) % 100) + '% ' + ((pg.i * 61) % 100) + '%';
    var inner = el('div', 'dp-inner');
    page.appendChild(inner);
    fillPage(inner, pg);
    if (pg.type !== 'blank') page.appendChild(el('div', 'dp-no', String(pg.i + 1)));
    if (pg.type !== 'toc' && pg.type !== 'blank') {
      var t = el('button', 'dp-toc', '目錄');
      t.type = 'button'; t.setAttribute('data-go', '1');
      page.appendChild(t);
    }
    return page;
  }
  function rowBtn(t, p, target) {
    var b = el('button', 'row'); b.type = 'button'; b.setAttribute('data-go', String(target));
    b.appendChild(el('span', '', t)); b.appendChild(el('span', 'dots')); b.appendChild(el('span', 'pg', p));
    return b;
  }
  function fillPage(inner, pg) {
    if (pg.type === 'quote') {
      var q = el('div', 'quote');
      q.appendChild(el(pg.i === 0 ? 'h1' : 'div', 'about', 'ABOUT EN'));
      q.appendChild(el('p', 'ln q', QUOTE.text));
      QUOTE.lines.forEach(function (l) { q.appendChild(el('p', 'ln', l)); });
      inner.appendChild(q);
    } else if (pg.type === 'toc') {
      inner.appendChild(el('h2', 'h1', '目錄'));
      inner.appendChild(el('div', 'gap'));
      pg.items.forEach(function (it) { inner.appendChild(rowBtn(it.t, String(it.target + 1), it.target)); });
    } else if (pg.type === 'chapter') {
      inner.appendChild(el('div', 'pencil', pg.en));
      inner.appendChild(el('h2', 'h1', pg.name));
      if (pg.tagline) inner.appendChild(el('p', 'ln tag', pg.tagline));
      pg.desc.forEach(function (l) { inner.appendChild(el('p', 'ln', l)); });
      inner.appendChild(el('div', 'gap'));
      pg.items.forEach(function (it) { inner.appendChild(rowBtn(it.t, String(it.target + 1), it.target)); });
    } else if (pg.type === 'article') {
      if (pg.first) {
        if (pg.date) inner.appendChild(el('div', 'pencil date', pg.date));
        inner.appendChild(el('h2', 'h2', pg.title));
      }
      pg.paras.forEach(function (l) { inner.appendChild(el('p', 'ln', l)); });
      // 「下頁繼續」放在頁面底部留白區，不佔內文空間，才不會被切掉
      if (pg.cont) (inner.parentNode || inner).appendChild(el('div', 'cont', '（下頁繼續）'));
    } else if (pg.type === 'orbs') {
      inner.appendChild(el('div', 'pencil', pg.title));
      inner.appendChild(el('h2', 'h2', '記憶金球｜圖像紀錄'));
      var grid = el('div', 'orbs');
      pg.orbs.forEach(function (o) {
        var item = el('div', 'orb-item');
        var b = el('button', 'orb-btn'); b.type = 'button';
        b.setAttribute('data-album', o.id); b.setAttribute('aria-label', '打開：' + o.title);
        var orb = el('span', 'orb');
        var img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        img.addEventListener('error', function () { img.style.visibility = 'hidden'; });
        img.src = o.cover;
        orb.appendChild(img);
        if (o.video) { var pl = el('span', 'play'); var c = el('span'); c.appendChild(svg('f:M9 7l9 5-9 5z', 22)); c.style.color = '#f2d79b'; pl.appendChild(c); orb.appendChild(pl); }
        b.appendChild(orb);
        b.appendChild(el('span', 'orb-title', o.title));
        b.appendChild(el('span', 'orb-count', o.count));
        item.appendChild(b);
        if (o.links && o.links.length) item.appendChild(linkRow(o.links, 'orb-links'));
        grid.appendChild(item);
      });
      inner.appendChild(grid);
    } else if (pg.type === 'contact') {
      var box = el('div', 'contact');
      var ig = el('a'); ig.href = CONTACT.ig_link || '#'; ig.target = '_blank'; ig.rel = 'noopener';
      ig.appendChild(el('span', 'pencil', 'Instagram')); ig.appendChild(el('span', 'val', CONTACT.ig || ''));
      var em = el('a'); em.href = 'mailto:' + (CONTACT.email || '');
      em.appendChild(el('span', 'pencil', 'Email')); em.appendChild(el('span', 'val', CONTACT.email || ''));
      box.appendChild(ig); box.appendChild(em);
      inner.appendChild(box);
    }
  }

  /* ---------- 分頁：依「這台裝置實際的頁面大小」量字數 ---------- */
  function measureSlot() {
    var m = el('div', 'slot ' + (S.mode === 'spread' ? 'slot-r' : 'slot-main'));
    m.style.visibility = 'hidden'; m.style.pointerEvents = 'none'; m.setAttribute('aria-hidden', 'true');
    root.querySelector('.stage').appendChild(m);
    return m;
  }
  function paginate() {
    var pages = [];
    var push = function (p) { p.i = pages.length; pages.push(p); return p.i; };
    var slot = measureSlot();
    function probe(pg) { slot.innerHTML = ''; var page = renderPage(pg, 'right'); slot.appendChild(page); return page.querySelector('.dp-inner'); }
    function overflows(inner) { return inner.scrollHeight > inner.clientHeight + 2; }

    // 一頁放幾顆金球：放兩顆量一列的高度
    var orbProbe = probe({ type: 'orbs', i: 0, title: '量', orbs: [{ id: 'x', title: '量測', cover: '', count: '1 張', links: [{ platform: 'youtube', url: '#' }] }, { id: 'y', title: '量測', cover: '', count: '1 張' }] });
    var grid = orbProbe.querySelector('.orbs');
    var rowH = grid.offsetHeight + 18;
    var rows = Math.max(1, Math.floor((orbProbe.clientHeight - grid.offsetTop + 18) / rowH));
    var orbsPer = rows * 2;

    push({ type: 'quote' });
    var toc = push({ type: 'toc', items: [] });
    var chapIdx = [];
    chapters.forEach(function (ch) {
      var ci = push({ type: 'chapter', name: ch.name, en: ch.en, tagline: ch.tagline, desc: ch.desc, items: [] });
      chapIdx.push({ t: ch.name, target: ci });
      ch.articles.forEach(function (a) {
        var first = null;
        if (a.body.length) {
          var cur = { type: 'article', title: a.title, date: a.date, first: true, paras: [] };
          var inner = probe(cur);
          a.body.forEach(function (par) {
            var p = el('p', 'ln', par); inner.appendChild(p);
            if (overflows(inner) && cur.paras.length) {
              cur.cont = true; var k = push(cur); if (first === null) first = k;
              cur = { type: 'article', title: a.title, first: false, paras: [] };
              inner = probe(cur); inner.appendChild(el('p', 'ln', par));
            }
            cur.paras.push(par);
          });
          var k2 = push(cur); if (first === null) first = k2;
        }
        for (var s = 0; s < a.orbs.length; s += orbsPer) {
          var k3 = push({ type: 'orbs', title: a.title, orbs: a.orbs.slice(s, s + orbsPer) });
          if (first === null) first = k3;
        }
        if (first !== null) pages[ci].items.push({ t: a.title, target: first });
      });
    });
    var cti = push({ type: 'contact' });
    pages[toc].items = chapIdx.concat([{ t: '聯繫方式', target: cti }]);
    slot.parentNode.removeChild(slot);
    return pages;
  }

  /* ---------- 畫面骨架 ---------- */
  var stage = el('div', 'stage');
  root.appendChild(stage);
  var musicBtn = el('button', 'music'); musicBtn.type = 'button'; musicBtn.setAttribute('aria-label', '森林聲'); musicBtn.setAttribute('aria-pressed', 'false');
  musicBtn.appendChild(svg('M9 18V5l11-2v13|c:6,18,3|c:17,16,3', 20)); musicBtn.appendChild(el('span', 'slash'));
  root.appendChild(musicBtn);
  var viewer = buildViewer(); root.appendChild(viewer.node);

  function blank(i) { return { type: 'blank', i: i }; }
  function pg(i) { return S.pages[i] || blank(i); }
  function maxSp() { return Math.floor((S.pages.length - 1) / 2); }

  function slot(cls, page) { var s = el('div', 'slot ' + cls); if (page) s.appendChild(page); return s; }
  function draw() {
    stage.innerHTML = '';
    if (S.mode === 'single') {
      stage.appendChild(slot('slot-main', renderPage(pg(S.idx), 'single')));
      stage.appendChild(el('div', 'spine'));
    } else {
      stage.appendChild(slot('slot-l', renderPage(pg(2 * S.sp), 'left')));
      stage.appendChild(slot('slot-r', renderPage(pg(2 * S.sp + 1), 'right')));
      stage.appendChild(el('div', 'gutter'));
    }
    var ear = el('div', 'ear'); stage.appendChild(ear);
    return ear;
  }

  /* ---------- 翻頁 ---------- */
  function setupTurn(to) {
    var dir;
    var layer = { base: [], leaf: null, shade: null };
    if (S.mode === 'single') {
      var from = S.idx; dir = to > from ? 'next' : 'prev';
      stage.innerHTML = '';
      var basePg = dir === 'next' ? pg(to) : pg(from), leafPg = dir === 'next' ? pg(from) : pg(to);
      stage.appendChild(slot('slot-main', renderPage(basePg, 'single')));
      var shade = el('div', 'base-shade'); stage.appendChild(shade);
      var leaf = el('div', 'leaf');
      var front = el('div', 'face front'); front.appendChild(renderPage(leafPg, 'single'));
      var fs = el('div', 'shade'); front.appendChild(fs);
      var back = el('div', 'face back paper-back');
      leaf.appendChild(front); leaf.appendChild(back); stage.appendChild(leaf);
      stage.appendChild(el('div', 'spine'));
      layer = { dir: dir, leaf: leaf, shade: shade, fshade: fs, start: dir === 'next' ? 0 : -180, end: dir === 'next' ? -180 : 0 };
    } else {
      var f = S.sp; dir = to > f ? 'next' : 'prev';
      stage.innerHTML = '';
      var L, R, FRONT, BACK;
      if (dir === 'next') { L = pg(2 * f); R = pg(2 * to + 1); FRONT = [pg(2 * f + 1), 'right']; BACK = [pg(2 * to), 'left']; }
      else { L = pg(2 * to); R = pg(2 * f + 1); FRONT = [pg(2 * f), 'left']; BACK = [pg(2 * to + 1), 'right']; }
      stage.appendChild(slot('slot-l', renderPage(L, 'left')));
      stage.appendChild(slot('slot-r', renderPage(R, 'right')));
      stage.appendChild(el('div', 'gutter'));
      var sh = el('div', 'base-shade ' + dir); stage.appendChild(sh);
      var lf = el('div', 'leaf ' + dir);
      var fr = el('div', 'face front'); fr.appendChild(renderPage(FRONT[0], FRONT[1]));
      var fsh = el('div', 'shade'); fr.appendChild(fsh);
      var bk = el('div', 'face back'); bk.appendChild(renderPage(BACK[0], BACK[1]));
      lf.appendChild(fr); lf.appendChild(bk); stage.appendChild(lf);
      layer = { dir: dir, leaf: lf, shade: sh, fshade: fsh, start: 0, end: dir === 'next' ? -180 : 180 };
    }
    layer.to = to;
    return layer;
  }
  function paint(t, angle, animate) {
    t.angle = angle;
    t.leaf.style.transition = animate ? 'transform .48s cubic-bezier(.3,.1,.25,1)' : 'none';
    t.leaf.style.transform = 'rotateY(' + angle + 'deg)';
    var k = Math.sin(Math.abs(angle) * Math.PI / 180);
    var progress = S.mode === 'single' ? (t.dir === 'next' ? Math.abs(angle) / 180 : 1 - Math.abs(angle) / 180) : Math.abs(angle) / 180;
    var dirDeg = (S.mode === 'spread' && t.dir === 'prev') ? '270deg' : '90deg';
    t.fshade.style.background = 'linear-gradient(' + dirDeg + ', rgba(40,22,8,0) 40%, rgba(40,22,8,' + (0.38 * k).toFixed(3) + ') 100%)';
    t.shade.style.transition = t.fshade.style.transition = animate ? 'background .48s' : 'none';
    t.shade.style.background = 'linear-gradient(' + dirDeg + ', rgba(30,15,5,' + (0.45 * (1 - progress)).toFixed(3) + ') 0%, rgba(30,15,5,0) 60%)';
  }
  function finishTurn(complete) {
    var t = S.turning; if (!t) return;
    paint(t, complete ? t.end : t.start, true);
    setTimeout(function () {
      if (complete) { if (S.mode === 'single') S.idx = t.to; else S.sp = t.to; save(); }
      S.turning = null; draw();
    }, 500);
  }
  function current() { return S.mode === 'single' ? S.idx : S.sp; }
  function limit() { return S.mode === 'single' ? S.pages.length - 1 : maxSp(); }
  function flipTo(to) {
    if (S.turning || S.closed || to === current() || to < 0 || to > limit()) return;
    if (reduceMotion) { if (S.mode === 'single') S.idx = to; else S.sp = to; save(); draw(); return; }
    var t = setupTurn(to); S.turning = t;
    paint(t, t.start, false);
    rustle();
    requestAnimationFrame(function () { requestAnimationFrame(function () { finishTurn(true); }); });
  }
  function goPage(i) { flipTo(S.mode === 'single' ? i : Math.floor(i / 2)); }
  function save() { try { sessionStorage.setItem('diaryPage', String(S.mode === 'single' ? S.idx : S.sp * 2)); } catch (e) {} }

  /* ---------- 手勢：拖曳翻頁、點左右邊緣、點目錄 ---------- */
  var g = null;
  stage.addEventListener('pointerdown', function (e) {
    if (S.closed || S.turning || (e.button != null && e.button > 0)) return;
    var r = stage.getBoundingClientRect();
    if (e.pointerType !== 'mouse') mark(e.clientX - r.left, e.clientY - r.top);
    g = { x0: e.clientX, y0: e.clientY, t0: Date.now(), r: r, drag: false, target: e.target };
  });
  stage.addEventListener('pointermove', function (e) {
    if (!g) return;
    var dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.drag) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      var to, mid = g.r.left + g.r.width / 2;
      if (S.mode === 'single') to = S.idx + (dx < 0 ? 1 : -1);
      else { if (g.x0 > mid && dx < 0) to = S.sp + 1; else if (g.x0 < mid && dx > 0) to = S.sp - 1; else { g = null; return; } }
      if (to < 0 || to > limit()) { g = null; return; }
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      g.drag = true; S.turning = setupTurn(to); rustle();
      g.w = S.mode === 'single' ? g.r.width : g.r.width;
    }
    var t = S.turning; if (!t) return;
    var p = Math.max(0, Math.min(1, Math.abs(dx) / g.w));
    paint(t, S.mode === 'single' ? (t.dir === 'next' ? -180 * p : -180 * (1 - p)) : (t.dir === 'next' ? -180 : 180) * p, false);
  });
  function endGesture(e) {
    if (!g) return;
    var dx = e.clientX - g.x0, gg = g; g = null;
    if (gg.drag) {
      var v = Math.abs(dx) / Math.max(1, Date.now() - gg.t0);
      finishTurn(Math.abs(dx) / gg.w > 0.28 || v > 0.5);
      return;
    }
    if (e.type === 'pointercancel') return;
    var hit = gg.target && gg.target.closest ? gg.target.closest('[data-go],[data-album],a') : null;
    if (hit) {
      if (hit.hasAttribute('data-go')) goPage(parseInt(hit.getAttribute('data-go'), 10));
      else if (hit.hasAttribute('data-album')) viewer.open(hit.getAttribute('data-album'));
      return;
    }
    var rx = (e.clientX - gg.r.left) / gg.r.width;
    if (S.mode === 'single') { if (rx > 0.66) flipTo(S.idx + 1); else if (rx < 0.34) flipTo(S.idx - 1); }
    else { if (rx > 0.5) flipTo(S.sp + 1); else flipTo(S.sp - 1); }
  }
  stage.addEventListener('pointerup', endGesture);
  stage.addEventListener('pointercancel', endGesture);
  // 用鍵盤操作的人：Enter／空白鍵按在目錄或金球上也能用
  stage.addEventListener('click', function (e) {
    if (e.detail !== 0) return;
    var hit = e.target.closest && e.target.closest('[data-go],[data-album]');
    if (!hit) return;
    if (hit.hasAttribute('data-go')) goPage(parseInt(hit.getAttribute('data-go'), 10));
    else viewer.open(hit.getAttribute('data-album'));
  });
  document.addEventListener('keydown', function (e) {
    if (!viewer.node.hidden) { if (e.key === 'Escape') viewer.close(); else if (e.key === 'ArrowRight') viewer.step(1); else if (e.key === 'ArrowLeft') viewer.step(-1); return; }
    if (e.key === 'ArrowRight' || e.key === 'PageDown') flipTo(current() + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') flipTo(current() - 1);
  });

  function mark(x, y) {
    var d = el('span', 'mark-dot'), q = el('img', 'mark-quill');
    q.src = BASE + '/assets/diary-quill.svg'; q.alt = '';
    d.style.left = q.style.left = x + 'px'; d.style.top = q.style.top = y + 'px';
    root.appendChild(d); root.appendChild(q);
    setTimeout(function () { d.remove(); q.remove(); }, 820);
  }

  /* ---------- 相簿／影片檢視 ---------- */
  function buildViewer() {
    var node = el('div', 'viewer'); node.hidden = true; node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true');
    var head = el('div', 'vh'), title = el('h2', 'vt'), close = el('button', 'vx'), vlinks = el('div', 'vlinks');
    close.type = 'button'; close.setAttribute('aria-label', '關閉'); close.appendChild(svg('M5 5l14 14|M19 5L5 19', 20));
    head.appendChild(title); head.appendChild(vlinks); head.appendChild(close);
    var body = el('div', 'vbody'), track = el('div', 'track');
    var prev = el('button', 'vnav p'), next = el('button', 'vnav n');
    prev.type = next.type = 'button'; prev.setAttribute('aria-label', '上一張'); next.setAttribute('aria-label', '下一張');
    prev.appendChild(svg('M15 5l-7 7 7 7', 20)); next.appendChild(svg('M9 5l7 7-7 7', 20));
    body.appendChild(track); body.appendChild(prev); body.appendChild(next);
    var counter = el('div', 'vc');
    node.appendChild(head); node.appendChild(body); node.appendChild(counter);
    var total = 0, lastFocus = null;
    function update() {
      var n = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      counter.textContent = total > 1 ? (n + 1) + ' / ' + total : '';
      prev.style.visibility = n > 0 ? 'visible' : 'hidden';
      next.style.visibility = n < total - 1 ? 'visible' : 'hidden';
    }
    track.addEventListener('scroll', function () { window.requestAnimationFrame(update); }, { passive: true });
    function step(d) { track.scrollBy({ left: d * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' }); }
    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });
    function closeV() {
      node.hidden = true; track.innerHTML = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    close.addEventListener('click', closeV);
    function open(id) {
      var a = ALBUMS[id]; if (!a) return;
      lastFocus = document.activeElement;
      title.textContent = a.title; node.setAttribute('aria-label', a.title);
      vlinks.innerHTML = '';
      if (a.links && a.links.length) { var row = linkRow(a.links, 'vlinks-row'); while (row.firstChild) vlinks.appendChild(row.firstChild); }
      track.innerHTML = ''; total = a.items.length;
      a.items.forEach(function (it, i) {
        var s = el('div', 'slide');
        if (it.src) {
          var im = el('img'); im.alt = a.title + '（' + (i + 1) + '）'; im.loading = i < 2 ? 'eager' : 'lazy'; im.decoding = 'async'; im.src = it.src;
          s.appendChild(im);
        } else {
          var box = el('div', 'vid');
          var th = el('img'); th.alt = ''; th.loading = 'lazy'; th.addEventListener('error', function () { th.style.visibility = 'hidden'; }); th.src = ytThumb(it.yt);
          var play = el('button'); play.type = 'button'; play.setAttribute('aria-label', '播放影片');
          var circle = el('span'); circle.style.cssText = 'width:64px;height:64px;border-radius:50%;background:rgba(201,154,69,.92);display:flex;align-items:center;justify-content:center;color:#24190d';
          circle.appendChild(svg('f:M9 7l9 5-9 5z', 26)); play.appendChild(circle);
          play.addEventListener('click', function () {
            var f = document.createElement('iframe');
            f.src = 'https://www.youtube-nocookie.com/embed/' + it.yt + '?autoplay=1&playsinline=1&rel=0';
            f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true; f.title = a.title;
            box.innerHTML = ''; box.appendChild(f);
          });
          box.appendChild(th); box.appendChild(play); s.appendChild(box);
        }
        track.appendChild(s);
      });
      node.hidden = false; track.scrollLeft = 0; update(); close.focus();
    }
    return { node: node, open: open, close: closeV, step: step };
  }

  /* ---------- 聲音：全部即時合成，不用下載任何音檔 ---------- */
  var ctx = null, noiseBuf = null, amb = null, birdTimer = null;
  function audio() {
    if (!ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  // iPhone：開著「靜音模式」時，網頁合成的聲音預設會被一起靜音。
  // 1) 新版 Safari 支援 navigator.audioSession：改成「播放媒體」類型，跟 YouTube 一樣不受靜音鍵影響
  // 2) 舊版 Safari：同時播一段無聲的 <audio>，把整個頁面的聲音切成「媒體播放」模式
  var unlockEl = null;
  function silentWavUrl() {
    var rate = 8000, n = rate / 2, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    function str(o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    str(36, 'data'); v.setUint32(40, n, true);
    for (var i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  function unlockMediaPlayback() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    try {
      if (!unlockEl) { unlockEl = new Audio(silentWavUrl()); unlockEl.loop = true; unlockEl.setAttribute('playsinline', ''); }
      var pr = unlockEl.play(); if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  }
  function releaseMediaPlayback() {
    try { if (unlockEl) unlockEl.pause(); } catch (e) {}
  }
  function noise(c) {
    if (noiseBuf) return noiseBuf;
    var len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (noiseBuf = b);
  }
  function ding() {
    var c = audio(); if (!c) return; var t = c.currentTime;
    var g2 = c.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.07, t + 0.006); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500; g2.connect(f); f.connect(c.destination);
    var o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(410, t); o.frequency.exponentialRampToValueAtTime(392, t + 0.05);
    o.connect(g2); o.start(t); o.stop(t + 0.4);
  }
  function rustle() {
    var c = audio(); if (!c) return; var t = c.currentTime;
    var s = c.createBufferSource(); s.buffer = noise(c);
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(1800, t); bp.frequency.linearRampToValueAtTime(3200, t + 0.3); bp.Q.value = 0.7;
    var g3 = c.createGain(); g3.gain.setValueAtTime(0.0001, t); g3.gain.exponentialRampToValueAtTime(0.045, t + 0.06); g3.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    s.connect(bp); bp.connect(g3); g3.connect(c.destination); s.start(t, Math.random()); s.stop(t + 0.45);
  }
  function startAmb() {
    var c = audio(); if (!c) return; var t = c.currentTime;
    var master = c.createGain(); master.gain.setValueAtTime(0.0001, t); master.gain.exponentialRampToValueAtTime(1.0, t + 2); master.connect(c.destination);
    var leaves = c.createBufferSource(); leaves.buffer = noise(c); leaves.loop = true;
    var lf = c.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 900;
    var lg = c.createGain(); lg.gain.value = 0.16;
    var lfo = c.createOscillator(); lfo.frequency.value = 0.08; var lfoG = c.createGain(); lfoG.gain.value = 0.08;
    lfo.connect(lfoG); lfoG.connect(lg.gain); leaves.connect(lf); lf.connect(lg); lg.connect(master); leaves.start(); lfo.start();
    // 溪水：中高頻的流水沙沙聲
    var stream = c.createBufferSource(); stream.buffer = noise(c); stream.loop = true; stream.loopStart = 0.5;
    var sf = c.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1400; sf.Q.value = 0.9;
    var sg = c.createGain(); sg.gain.value = 0.07;
    stream.connect(sf); sf.connect(sg); sg.connect(master); stream.start(t, 0.7);
    // 蟲鳴：高頻、快速顫動
    var bugs = c.createBufferSource(); bugs.buffer = noise(c); bugs.loop = true;
    var bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 4800; bf.Q.value = 14;
    var bg = c.createGain(); bg.gain.value = 0;
    var trem = c.createOscillator(); trem.type = 'square'; trem.frequency.value = 21; var tg = c.createGain(); tg.gain.value = 0.03;
    trem.connect(tg); tg.connect(bg.gain); bugs.connect(bf); bf.connect(bg); bg.connect(master); bugs.start(t, 1.1); trem.start();
    amb = { master: master, nodes: [leaves, lfo, stream, bugs, trem] };
    (function bird() {
      if (!amb) return;
      var now = c.currentTime, n = 2 + Math.floor(Math.random() * 3), base = 2300 + Math.random() * 1500;
      var pan = c.createStereoPanner ? c.createStereoPanner() : null; if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(master); }
      for (var k = 0; k < n; k++) {
        var st = now + k * 0.17, o = c.createOscillator(), gg2 = c.createGain();
        o.frequency.setValueAtTime(base, st); o.frequency.exponentialRampToValueAtTime(base * 1.4, st + 0.07); o.frequency.exponentialRampToValueAtTime(base * 0.92, st + 0.12);
        gg2.gain.setValueAtTime(0.0001, st); gg2.gain.exponentialRampToValueAtTime(0.07, st + 0.02); gg2.gain.exponentialRampToValueAtTime(0.0001, st + 0.13);
        o.connect(gg2); gg2.connect(pan || master); o.start(st); o.stop(st + 0.15);
      }
      birdTimer = setTimeout(bird, 1200 + Math.random() * 3200);
    })();
  }
  function stopAmb() {
    clearTimeout(birdTimer); var a = amb; amb = null; if (!a || !ctx) return;
    var t = ctx.currentTime; a.master.gain.setValueAtTime(Math.max(a.master.gain.value, 0.0001), t); a.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    setTimeout(function () { a.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} }); }, 700);
  }
  musicBtn.addEventListener('click', function () {
    S.amb = !S.amb;
    if (S.amb) { unlockMediaPlayback(); audio(); startAmb(); }
    else { stopAmb(); releaseMediaPlayback(); }
    musicBtn.classList.toggle('on', S.amb); musicBtn.setAttribute('aria-pressed', S.amb ? 'true' : 'false');
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && S.amb) { S.amb = false; stopAmb(); releaseMediaPlayback(); musicBtn.classList.remove('on'); musicBtn.setAttribute('aria-pressed', 'false'); } });

  /* ---------- 啟動、轉向／縮放時重新排版 ---------- */
  function pickMode() { return window.innerWidth >= 900 && window.innerWidth > window.innerHeight ? 'spread' : 'single'; }
  function layout(keepPage) {
    var pageNo = keepPage != null ? keepPage : (S.mode === 'single' ? S.idx : S.sp * 2);
    S.mode = pickMode();
    root.classList.toggle('is-spread', S.mode === 'spread'); root.classList.toggle('is-single', S.mode === 'single');
    S.pages = paginate();
    pageNo = Math.max(0, Math.min(pageNo, S.pages.length - 1));
    S.idx = pageNo; S.sp = Math.floor(pageNo / 2);
    return draw();
  }
  var resizeTimer = null, lastSize = window.innerWidth + 'x' + window.innerHeight;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var size = window.innerWidth + 'x' + window.innerHeight;
      if (size === lastSize || S.turning) return; lastSize = size;
      layout();
    }, 250);
  });

  function start() {
    document.documentElement.classList.add('diary-ready');
    var saved = null; try { saved = sessionStorage.getItem('diaryPage'); } catch (e) {}
    var ear = layout(saved ? parseInt(saved, 10) : 0);
    var seen = false; try { seen = sessionStorage.getItem('diaryCover') === '1'; } catch (e) {}
    if (reduceMotion || seen) return;
    try { sessionStorage.setItem('diaryCover', '1'); } catch (e) {}
    S.closed = true; root.classList.add('closed');
    var cover = el('div', 'cover'); cover.setAttribute('aria-hidden', 'true');
    cover.appendChild(el('div', 'band')); cover.appendChild(el('div', 'label', 'ABOUT EN'));
    root.appendChild(cover);
    setTimeout(function () { cover.classList.add('open'); root.classList.remove('closed'); }, 800);
    setTimeout(function () { cover.remove(); S.closed = false; var e2 = stage.querySelector('.ear'); if (e2) e2.classList.add('hint'); }, 1950);
  }
  // 點擊回饋：滑鼠點下去羽毛筆變金色，再分段褪回原色；手指點則在點的位置淡入淡出金色光點
  var qTimers = [], qRoot = document.documentElement;
  function setQ(c) { qRoot.classList.remove('q-on', 'q-mid', 'q-end'); if (c) qRoot.classList.add(c); }
  document.addEventListener('pointerdown', function (e) {
    if (e.button && e.button !== 0) return;
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      qTimers.forEach(clearTimeout);
      setQ('q-end');
      qTimers = [
        setTimeout(function () { setQ('q-mid'); }, 40),
        setTimeout(function () { setQ('q-on'); }, 90),
        setTimeout(function () { setQ('q-mid'); }, 380),
        setTimeout(function () { setQ('q-end'); }, 520),
        setTimeout(function () { setQ(null); }, 660)
      ];
      return;
    }
    var fx = document.createElement('span');
    fx.className = 'tap-fx' + (reduceMotion ? ' still' : '');
    fx.style.left = e.clientX + 'px'; fx.style.top = e.clientY + 'px';
    document.body.appendChild(fx);
    setTimeout(function () { fx.remove(); }, 700);
  }, { passive: true, capture: true });

  var fontsReady = document.fonts && document.fonts.load ? document.fonts.load('20px "EN Hand"', '日記') : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 2500); })]).then(start, start);
})();
