/**
 * 讓 /admin/ 後台右邊的預覽畫面，長得跟前台真正的頁面一樣（套用同一份 CSS、同樣的排版），
 * 不再只是一排「欄位名稱：內容」的純文字列表。
 *
 * 這份檔案在 admin/index.html 裡、decap-cms.js 載入「之後」被引入，
 * 用的是 Decap CMS 官方文件裡「不用建置工具（no-bundler）」的寫法：
 * 直接用全域的 createClass / h（等同 React.createClass / React.createElement）。
 */
(function () {
  var h = window.h;
  var createClass = window.createClass;

  if (!h || !createClass || !window.CMS) {
    // decap-cms.js 還沒準備好，直接放棄（不影響後台正常編輯功能，只是沒有客製化預覽）
    return;
  }

  CMS.registerPreviewStyle("/assets/main.css");
  CMS.registerPreviewStyle(
    "https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500;600&family=Noto+Sans+TC:wght@300;400;500&display=swap"
  );

  function getAssetUrl(props, value) {
    if (!value) return "";
    try {
      var asset = props.getAsset(value);
      return asset ? asset.toString() : value;
    } catch (e) {
      return value;
    }
  }

  function toJS(immutableValue) {
    if (immutableValue && typeof immutableValue.toJS === "function") {
      return immutableValue.toJS();
    }
    return immutableValue || null;
  }

  // ---------- 首頁內容（site.yml）----------
  var SitePreview = createClass({
    render: function () {
      var props = this.props;
      var data = toJS(props.entry.get("data")) || {};
      var hero = data.hero || {};
      var quote = data.quote || {};
      var aboutDaily = data.about_daily || {};
      var recent = data.recent_shoots || {};

      return h(
        "div",
        { style: { background: "#e9e5dd" } },
        h(
          "section",
          { className: "hero", style: { position: "relative" } },
          hero.image &&
            h("img", {
              src: getAssetUrl(props, hero.image),
              style: { width: "100%", height: "50vh", objectFit: "cover", filter: "grayscale(1) contrast(1.05)" },
            }),
          h(
            "div",
            { className: "hero-text", style: { position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 8vw 6vh", color: "#e9e5dd" } },
            h("div", { className: "label" }, hero.label),
            h("h1", {}, hero.title_line1, h("div", {}, hero.title_line2))
          )
        ),
        h(
          "section",
          { className: "quote-section" },
          h("blockquote", {}, quote.text),
          h(
            "div",
            { className: "desc" },
            (quote.desc || "")
              .split("\n")
              .map(function (l) {
                return l.trim();
              })
              .filter(function (l) {
                return l !== "";
              })
              .map(function (line, i) {
                return h("div", { key: i }, line);
              })
          )
        ),
        h(
          "section",
          { id: "about-daily" },
          h(
            "div",
            { className: "section-head" },
            h("div", { className: "label" }, aboutDaily.label),
            h("h2", {}, aboutDaily.heading)
          ),
          h(
            "div",
            { className: "service-grid" },
            (aboutDaily.services || []).map(function (item, i) {
              return h(
                "div",
                { className: "service", key: i },
                h("div", { className: "num" }, item.num),
                item.category && h("div", { className: "label" }, item.category),
                h("h3", {}, item.title),
                h("div", { className: "tagline" }, item.tagline)
              );
            })
          )
        ),
        h(
          "section",
          {},
          h(
            "div",
            { className: "section-head" },
            h("div", { className: "label" }, recent.label),
            h("h2", {}, recent.heading)
          ),
          h(
            "div",
            { className: "recent-shoots-grid" },
            (recent.items || []).map(function (item, i) {
              return h(
                "figure",
                { className: "recent-shoots-item", key: i },
                item.image && h("img", { src: getAssetUrl(props, item.image) }),
                h("figcaption", {}, item.caption)
              );
            })
          )
        )
      );
    },
  });
  CMS.registerPreviewTemplate("site", SitePreview);

  // ---------- 關於 EN／關於日常／關於愛：子文章 ----------
  var ArticlePreview = createClass({
    render: function () {
      var props = this.props;
      var data = toJS(props.entry.get("data")) || {};
      var albums = data.albums || [];

      return h(
        "div",
        { className: "article-inner", style: { background: "#e9e5dd", minHeight: "100vh", paddingTop: "30px" } },
        h("h1", {}, data.title),
        h("div", { className: "article-date" }, data.date_label || data.date),
        data.cover_image &&
          h("img", { className: "article-cover", src: getAssetUrl(props, data.cover_image) }),
        h("div", { className: "article-body" }, props.widgetFor("body")),
        albums.length > 0 &&
          h(
            "div",
            { className: "article-albums", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" } },
            albums.map(function (album, ai) {
              return h(
                "div",
                { className: "biz-album", key: ai },
                album.title && h("div", { className: "album-title" }, album.title),
                h(
                  "div",
                  { className: "album-photo-grid" },
                  (album.photos || []).map(function (photo, pi) {
                    return h(
                      "figure",
                      { className: "album-photo", key: pi },
                      h("img", { src: getAssetUrl(props, photo.src) }),
                      photo.caption && h("figcaption", {}, photo.caption)
                    );
                  })
                )
              );
            })
          )
      );
    },
  });
  CMS.registerPreviewTemplate("about_en", ArticlePreview);
  CMS.registerPreviewTemplate("about_daily", ArticlePreview);
  CMS.registerPreviewTemplate("about_love", ArticlePreview);

  // ---------- 關於商業：四個子檔案共用一個 preview，依 slug 分別畫不同版面 ----------
  var BusinessPreview = createClass({
    renderPhotoAlbums: function (albums, props) {
      return h(
        "div",
        { className: "biz-albums", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" } },
        (albums || []).map(function (album, ai) {
          return h(
            "div",
            { className: "biz-album", key: ai },
            h("div", { className: "album-title" }, album.title),
            album.link && h("div", { className: "album-link" }, "立即查看 → " + album.link),
            h(
              "div",
              { className: "album-photo-grid" },
              (album.photos || []).map(function (photo, pi) {
                return h(
                  "figure",
                  { className: "album-photo", key: pi },
                  h("img", { src: getAssetUrl(props, photo.src) })
                );
              })
            )
          );
        })
      );
    },
    renderAiAutomation: function (albums, props) {
      return h(
        "div",
        {},
        (albums || []).map(function (album, ai) {
          var mainPhoto = (album.photos || [])[0];
          return h(
            "div",
            { className: "biz-album biz-album--main-image", key: ai, style: { marginBottom: "30px" } },
            h("div", { className: "album-title" }, album.title),
            mainPhoto &&
              h(
                "figure",
                { className: "album-photo album-photo--main", style: { maxWidth: "320px" } },
                h("img", { src: getAssetUrl(props, mainPhoto.src) })
              ),
            h(
              "div",
              { className: "album-social-links" },
              h("span", { className: "social-hint" }, "點擊 icon 查看"),
              (album.social_links || [])
                .filter(function (sl) {
                  return sl.url;
                })
                .map(function (sl, si) {
                  return h(
                    "span",
                    { className: "social-icon-btn", key: si, style: { fontSize: "10px" } },
                    sl.platform
                  );
                })
            )
          );
        })
      );
    },
    renderVideos: function (videos, categories) {
      return h(
        "div",
        { className: "video-grid" },
        (videos || []).map(function (v, vi) {
          return h(
            "div",
            { className: "video-card", key: vi },
            h(
              "div",
              { className: "video-thumb-frame" },
              h("img", { className: "video-cover", src: "https://img.youtube.com/vi/" + v.youtube_id + "/hqdefault.jpg" })
            ),
            h("div", { className: "video-card-meta" }, v.caption)
          );
        })
      );
    },
    render: function () {
      var props = this.props;
      var slug = props.entry.get("slug");
      var data = toJS(props.entry.get("data")) || {};

      var body;
      if (slug === "ai-automation") {
        body = this.renderAiAutomation(data.albums, props);
      } else if (slug === "video") {
        body = this.renderVideos(data.videos, data.categories);
      } else {
        // brand-design、brand 都是同一種「分類 tabs + 相簿照片牆」版型
        body = this.renderPhotoAlbums(data.albums, props);
      }

      return h(
        "div",
        { className: "business-inner", style: { background: "#e9e5dd", minHeight: "100vh", paddingTop: "30px" } },
        h(
          "div",
          { className: "video-tabs" },
          (data.categories || []).map(function (cat, ci) {
            return h("span", { className: "video-tab", key: ci }, cat.label);
          })
        ),
        body
      );
    },
  });
  CMS.registerPreviewTemplate("business", BusinessPreview);
})();
