(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- 主题切换 ---------- */
  var themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      updateThemeColor();
    });
  }
  function updateThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    var dark = root.getAttribute('data-theme') === 'dark';
    if (meta) meta.setAttribute('content', dark ? '#16181e' : '#f2f3f6');
  }
  updateThemeColor();

  /* ---------- 移动端菜单 ---------- */
  var menuToggle = document.getElementById('menu-toggle');
  var nav = document.getElementById('header-nav');
  if (menuToggle && nav) {
    menuToggle.addEventListener('click', function () {
      nav.classList.toggle('open');
      var icon = menuToggle.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-bars');
        icon.classList.toggle('fa-xmark');
      }
    });
  }

  /* ---------- 滚动进度条 ---------- */
  var progress = document.getElementById('scroll-progress');
  function updateProgress() {
    if (!progress) return;
    var h = document.documentElement;
    var scrolled = h.scrollTop || document.body.scrollTop;
    var max = h.scrollHeight - h.clientHeight;
    var pct = max > 0 ? (scrolled / max) * 100 : 0;
    progress.style.width = pct + '%';
  }

  /* ---------- 返回顶部 ---------- */
  var backTop = document.getElementById('back-top');
  function updateBackTop() {
    if (!backTop) return;
    var scrolled = document.documentElement.scrollTop || document.body.scrollTop;
    backTop.classList.toggle('show', scrolled > 320);
  }
  if (backTop) {
    backTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  window.addEventListener('scroll', function () {
    updateProgress();
    updateBackTop();
  }, { passive: true });
  updateProgress();
  updateBackTop();

  /* ---------- 目录高亮当前标题 ---------- */
  var tocLinks = document.querySelectorAll('.post-toc a[href^="#"]');
  if (tocLinks.length) {
    var headings = [];
    tocLinks.forEach(function (a) {
      var el = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
      if (el) headings.push({ el: el, link: a });
    });
    function onScrollToc() {
      var pos = (document.documentElement.scrollTop || document.body.scrollTop) + 90;
      var current = null;
      headings.forEach(function (h) {
        if (h.el.offsetTop <= pos) current = h.link;
      });
      tocLinks.forEach(function (a) { a.style.color = ''; a.style.borderColor = ''; });
      if (current) { current.style.color = 'var(--accent)'; current.style.borderColor = 'var(--accent)'; }
    }
    window.addEventListener('scroll', onScrollToc, { passive: true });
    onScrollToc();
  }

  /* ---------- 关于页极光鼠标跟随 ---------- */
  var auroraMouse = document.querySelector('[data-aurora-mouse]');
  var auroraHero = document.querySelector('[data-aurora-hero]');
  if (auroraMouse && auroraHero) {
    auroraHero.addEventListener('mousemove', function (e) {
      var rect = auroraHero.getBoundingClientRect();
      auroraMouse.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
      auroraMouse.style.setProperty('--my', (e.clientY - rect.top) + 'px');
      auroraMouse.style.opacity = '1';
    });
    auroraHero.addEventListener('mouseleave', function () {
      auroraMouse.style.opacity = '0';
    });
  }

  // 动态更新「最后更新时间 X 天前」
  var lastBuild = document.getElementById('webinfo-last-build');
  if (lastBuild) {
    var ts = parseInt(lastBuild.getAttribute('data-build-timestamp'), 10);
    if (!isNaN(ts)) {
      var days = Math.floor((Date.now() - ts) / 86400000);
      lastBuild.textContent = days <= 0 ? '今天' : (days === 1 ? '1天前' : days + '天前');
    }
  }

  /* ---------- 站内搜索（基于 /search.json） ---------- */
  var searchBtn = document.getElementById('nav-search-btn');
  var searchDialog = document.getElementById('search-dialog');
  var searchMask = document.getElementById('search-mask');
  var searchInput = document.getElementById('search-input');
  var searchClose = document.getElementById('search-close');
  var searchResults = document.getElementById('search-results');
  var searchCount = document.getElementById('search-count');
  var searchTip = document.getElementById('search-tip');

  if (searchBtn && searchDialog && searchMask) {
    var searchData = null;
    var activeIndex = -1;
    function loadSearchData(cb) {
      if (searchData) { cb(searchData); return; }
      fetch('/search.json').then(function (r) { return r.json(); }).then(function (d) { searchData = d; cb(d); }).catch(function () { searchData = []; cb([]); });
    }
    function openSearch() {
      loadSearchData(function () { /* 提前缓存 */ });
      searchDialog.classList.add('open'); searchMask.classList.add('open');
      searchDialog.setAttribute('aria-hidden', 'false');
      setTimeout(function () { searchInput.focus(); }, 80);
    }
    function closeSearch() {
      searchDialog.classList.remove('open'); searchMask.classList.remove('open');
      searchDialog.setAttribute('aria-hidden', 'true');
      searchInput.value = ''; renderResults([]);
      activeIndex = -1;
    }
    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function highlight(text, kw) {
      if (!kw) return escapeHtml(text);
      var safe = escapeHtml(text);
      try {
        var re = new RegExp('(' + escapeRe(kw) + ')', 'gi');
        safe = safe.replace(re, '<em>$1</em>');
      } catch (e) {}
      return safe;
    }
    function snippet(text, kw) {
      if (!text) return '';
      if (!kw) return text.slice(0, 120);
      var lower = text.toLowerCase(), k = kw.toLowerCase();
      var i = lower.indexOf(k);
      if (i < 0) return text.slice(0, 120);
      var start = Math.max(0, i - 40), end = Math.min(text.length, i + kw.length + 80);
      return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
    }
    function renderResults(items, kw) {
      if (!items.length) {
        searchResults.innerHTML = '<div class="search-empty">' + (kw ? ('未找到与 “' + escapeHtml(kw) + '” 相关的文章') : '') + '</div>';
        searchCount.textContent = '';
        searchTip && (searchTip.style.display = kw ? 'none' : '');
        activeIndex = -1;
        return;
      }
      var html = items.slice(0, 12).map(function (it, idx) {
        var tags = (it.tags || []).slice(0, 3).map(function (t) { return '<span>' + escapeHtml(t.name) + '</span>'; }).join('');
        return '<a class="search-result-item" href="' + escapeHtml(it.url) + '" data-idx="' + idx + '">' +
          '<div class="search-result-title">' + highlight(it.title || '(无标题)', kw) + '</div>' +
          '<div class="search-result-content">' + highlight(snippet(it.content || '', kw), kw) + '</div>' +
          (tags ? '<div class="search-result-meta">' + tags + '</div>' : '') +
          '</a>';
      }).join('');
      searchResults.innerHTML = html;
      searchCount.textContent = '共 ' + items.length + ' 条结果';
      searchTip && (searchTip.style.display = 'none');
      activeIndex = 0;
      updateActive();
    }
    function updateActive() {
      var list = searchResults.querySelectorAll('.search-result-item');
      list.forEach(function (el, i) {
        el.classList.toggle('active', i === activeIndex);
        if (i === activeIndex) { el.scrollIntoView({ block: 'nearest' }); }
      });
    }
    function runSearch() {
      var kw = (searchInput.value || '').trim();
      if (!kw) { renderResults([]); return; }
      loadSearchData(function (data) {
        var k = kw.toLowerCase();
        var matches = [];
        data.forEach(function (it) {
          var title = (it.title || '').toLowerCase();
          var content = (it.content || '').toLowerCase();
          var tagStr = (it.tags || []).map(function (t) { return t.name; }).join(' ').toLowerCase();
          var catStr = (it.categories || []).map(function (c) { return c.name; }).join(' ').toLowerCase();
          var ti = title.indexOf(k), ci = content.indexOf(k), tgi = tagStr.indexOf(k), cai = catStr.indexOf(k);
          if (ti < 0 && ci < 0 && tgi < 0 && cai < 0) return;
          var score = (ti >= 0 ? 100 : 0) + (tgi >= 0 ? 50 : 0) + (cai >= 0 ? 40 : 0) + (ci >= 0 ? (1 - ci / Math.max(content.length, 1)) * 30 : 0);
          matches.push({ it: it, score: score });
        });
        matches.sort(function (a, b) { return b.score - a.score; });
        renderResults(matches.map(function (m) { return m.it; }), kw);
      });
    }
    searchBtn.addEventListener('click', openSearch);
    searchClose.addEventListener('click', closeSearch);
    searchMask.addEventListener('click', closeSearch);
    searchInput.addEventListener('input', function () { runSearch(); });
    searchInput.addEventListener('keydown', function (e) {
      var list = searchResults.querySelectorAll('.search-result-item');
      if (e.key === 'Escape') { closeSearch(); return; }
      if (!list.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = (activeIndex + 1) % list.length; updateActive(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = (activeIndex - 1 + list.length) % list.length; updateActive(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var target = list[activeIndex]; if (target) { window.location.href = target.href; closeSearch(); }
      }
    });
    document.addEventListener('keydown', function (e) {
      var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      var cmd = isMac ? e.metaKey : e.ctrlKey;
      if (cmd && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); searchDialog.classList.contains('open') ? closeSearch() : openSearch(); }
    });
  }

  /* ---------- 本站已运行时间 ---------- */
  var runtimeEl = document.getElementById('site-runtime');
  if (runtimeEl) {
    var startRaw = runtimeEl.getAttribute('data-start');
    var startTs = startRaw ? Date.parse(startRaw) : Date.now();
    function tick() {
      var diff = Math.max(0, Date.now() - startTs);
      var s = Math.floor(diff / 1000);
      var day = Math.floor(s / 86400); s %= 86400;
      var h = Math.floor(s / 3600); s %= 3600;
      var m = Math.floor(s / 60); s %= 60;
      runtimeEl.textContent = day + ' 天 ' + h + ' 时 ' + m + ' 分 ' + s + ' 秒';
    }
    tick(); setInterval(tick, 1000);
  }
})();
