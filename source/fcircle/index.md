---
title: 朋友动态
date: 2026-08-14 12:00:00
type: fcircle
aside: false
---

<div id="friend-circle-lite">
  <div class="fcl-header">
    <p>汇聚友链站点的最新文章，看看朋友们最近都写了些什么。</p>
  </div>
  <div id="fcl-content">
    <p style="text-align:center;color:var(--font-color)">正在加载友链动态...</p>
  </div>
  <div style="text-align:center;margin-top:20px">
    <button id="fcl-load-more" style="display:none;padding:8px 24px;border:1px solid var(--btn-default-border);border-radius:8px;background:var(--card-bg);color:var(--font-color);cursor:pointer">再来亿点</button>
  </div>
</div>

<script>
(function(){
  const API_URL = 'https://fcircle-next.vercel.app/api/list';
  const PAGE_SIZE = 10;
  let currentPage = 1;
  let loading = false;

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit'});
  }

  function renderPost(item) {
    return '<div class="fcl-item" style="display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--card-border)">' +
      '<img src="' + (item.avatar || '/img/butterfly-icon.png') + '" style="width:36px;height:36px;border-radius:50%;margin-right:12px;flex-shrink:0" onerror="this.src=\'/img/butterfly-icon.png\'">' +
      '<div style="flex:1;min-width:0">' +
        '<a href="' + (item.link || '#') + '" target="_blank" rel="noopener nofollow" style="font-weight:600;color:var(--text-highlight-color);text-decoration:none;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (item.title || '无标题') + '</a>' +
        '<div style="font-size:.85em;color:var(--card-meta);margin-top:4px">' +
          '<span>' + (item.author || '未知') + '</span>' +
          '<span style="margin:0 8px">·</span>' +
          '<span>' + formatDate(item.created) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function loadPage(page) {
    if (loading) return;
    loading = true;
    fetch(API_URL + '?page=' + page + '&pageSize=' + PAGE_SIZE)
      .then(r => r.json())
      .then(data => {
        const container = document.getElementById('fcl-content');
        if (page === 1) container.innerHTML = '';
        const posts = data.data || data.posts || [];
        if (posts.length === 0 && page === 1) {
          container.innerHTML = '<p style="text-align:center;color:var(--font-color)">暂无动态</p>';
          return;
        }
        posts.forEach(item => {
          container.insertAdjacentHTML('beforeend', renderPost(item));
        });
        const btn = document.getElementById('fcl-load-more');
        if (posts.length >= PAGE_SIZE) {
          btn.style.display = 'inline-block';
          currentPage = page;
        } else {
          btn.style.display = 'none';
        }
      })
      .catch(() => {
        if (page === 1) {
          document.getElementById('fcl-content').innerHTML = '<p style="text-align:center;color:var(--font-color)">加载失败，请稍后再试</p>';
        }
      })
      .finally(() => { loading = false; });
  }

  document.getElementById('fcl-load-more').addEventListener('click', function(){
    loadPage(currentPage + 1);
  });

  loadPage(1);
})();
</script>
