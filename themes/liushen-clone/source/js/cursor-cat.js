/* ==============================================
   打嗝猫鼠标指针 —— 点击状态切换（2026-09-29）
   规则：左键按下 → <html class="cat-click">（CSS 切张嘴指针），
   松开 / 窗口失焦 / 开始拖拽 → 恢复闭嘴。
   捕获阶段监听：主题里的 clouds.js / music.js 等可能在
   冒泡阶段 stopPropagation，不能用冒泡。
   无 DOM 依赖、无配置，随 head.ejs 全站加载。
   ============================================== */
(function () {
  var root = document.documentElement;

  function down(e) {
    if (e.button !== 0) return; /* 只认左键 */
    root.classList.add('cat-click');
  }

  function up() {
    root.classList.remove('cat-click');
  }

  window.addEventListener('mousedown', down, true);
  window.addEventListener('mouseup', up, true);
  window.addEventListener('blur', up);
  window.addEventListener('dragstart', up);
})();
