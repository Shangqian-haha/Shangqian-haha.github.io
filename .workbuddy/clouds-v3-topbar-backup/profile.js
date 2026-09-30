/* ============================================================
   个人主页 · /profile/  v2 交互逻辑
   ------------------------------------------------------------
   共 10 段：
     1. 字符乱码加载        2. 入场解锁
     3. 场景切换器（核心）   4. 顶部条随滚动收起 + 首屏淡出
     5. 滚动进度            6. 逐行遮罩上推
     7. 入场观察器          8. 光标跟随
     9. 音乐控件（已抽到共用模块 js/music.js）  10. 控制台彩蛋

   ⚠️ 2026-09-28：第 9 段原实现已**原样**搬到 js/music.js，因为 /clouds/
      也要用同一个控件。两个页面都在 page.ejs 里加载 music.js，本文件不再
      包含音乐逻辑（避免两份实现分叉）。样式仍在 profile.css。

   ⚠️ 2026-09-28：原 4b「移动端全屏菜单」已随顶栏导航一起移除
      （顶栏不再放任何导航，见 profile.ejs / profile-london.css）。

   零依赖、零外部库。

   ⚠️ v1 这里是 750 行的 WebGL/GLSL（手写伦敦雨景）。
      v2 改成"真实照片 + CSS 天气层"，因此整段替换为场景切换器。
      v1 的备份在 .workbuddy/profile-v1-backup/profile.js

   ⚠️ 切换器的冷却时间必须 >= CSS 里 --ld-xfade（1000ms），
      否则连点会让两层同时处于"渐显中"，出现短暂重影。
   ============================================================ */
(function () {
  'use strict';

  var root = document.getElementById('profile-root');
  if (!root) return;

  /* 告诉 CSS「脚本已经接管」。
     ⚠️ 这一句必须**同步执行、尽早执行** —— CSS 里所有"先藏后显"的规则
        都挂在 .js-on 下。加得越晚，内容"闪一下才归位"的概率越高。
        （profile.ejs 里还有一处内联的更早调用，这里是兜底。） */
  root.classList.add('js-on');

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var clamp = function (v, mi, ma) { return v < mi ? mi : (v > ma ? ma : v); };

  /* ==========================================================
     1. 字符乱码加载
     逐行"解码"：每行从随机字符逐渐固化成目标字符
     ========================================================== */

  (function preloader() {
    var box = document.getElementById('pf-pre-lines');
    if (!box) return;

    /* 三行等宽字符 —— 直接对应页面里的两个场景，读起来像"信号在接入" */
    var targets = [
      '··· ——— ···',
      'WESTMINSTER · LONDON',
      'GASTOWN · VANCOUVER'
    ];
    var GLYPHS = '01·—/\\|<>[]{}#*+=~ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    var rows = targets.map(function (t) {
      var el = document.createElement('span');
      el.textContent = t;
      box.appendChild(el);
      return { el: el, target: t, done: false };
    });

    if (reduceMotion) {
      rows.forEach(function (r) { r.done = true; el_done(r); });
      return;
    }

    var start = performance.now();
    var DUR = 1500;

    (function tick(now) {
      var p = clamp((now - start) / DUR, 0, 1);
      rows.forEach(function (r, i) {
        if (r.done) return;
        /* 行间错开：越靠后的行越晚固化 */
        var local = clamp((p - i * 0.13) / 0.6, 0, 1);
        var keep = Math.floor(local * r.target.length);
        var out = '';
        for (var j = 0; j < r.target.length; j++) {
          var ch = r.target.charAt(j);
          if (j < keep || ch === ' ') out += ch;
          else if (ch === '·' || ch === '—') out += Math.random() > 0.5 ? '·' : '—';
          else out += GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
        }
        r.el.textContent = out;
        if (local >= 1) { r.done = true; r.el.textContent = r.target; el_done(r); }
      });
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  })();

  /* 抽出来：减少动效分支与正常完成时都要打这个标记 */
  function el_done(r) { r.el.classList.add('is-done'); }

  /* ==========================================================
     2. 入场解锁
     点击任意处 / 点按钮 → 收遮罩；同时解锁音频（浏览器要求用户手势）
     ========================================================== */

  var preloaderEl = document.getElementById('pf-preloader');
  var entered = false;

  function enter() {
    if (entered) return;
    entered = true;
    root.classList.add('pf-ready');
    document.body.classList.add('pf-body-lock-off');
    /* 通知音乐模块可以开始播了（由用户手势触发，合规） */
    document.dispatchEvent(new CustomEvent('pf:enter'));
  }

  if (preloaderEl) {
    preloaderEl.addEventListener('click', enter);
    preloaderEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); }
    });
    /* 若脚本跑完 3.6 秒用户还没点，自动放行 —— 避免"卡在门口"。
       （原 4200ms 太长会挡住首屏；2600ms 又读不完两行城市名，取中间值。
         主动访客点一下就走，这个值只是给"挂着不动"的人的兜底。） */
    window.setTimeout(function () { if (!entered) enter(); }, 3600);
  } else {
    enter();
  }

  document.body.classList.add('pf-body-lock');

  /* ==========================================================
     3. 场景切换器（本版核心）
     ----------------------------------------------------------
     三个阶段各自带 tone（文字明暗）与 wx（天气类型），
     点切换器时同时改三处：
       · 图层 .is-on      → 照片 1000ms 交叉淡入
       · data-tone        → 文字色 + 遮罩明暗（两份交叉淡入）
       · data-wx          → 雨丝 / 蒸汽 / 雾 换一套

     ⚠️ tone 的取法：不是"哪个场景好看"，而是**实测该图亮度**决定的。
        两张照片中部 66 / 89 → 暗底，用亮色字。
        （原先的「雨巷」是 198/106 的亮底、需要深色字，已按需求移除。）
        具体数值见 source/_data/profile.yml 的 scenes 注释。
     ========================================================== */

  (function stage() {
    var sws    = Array.prototype.slice.call(root.querySelectorAll('.ld-sw'));
    var layers = Array.prototype.slice.call(root.querySelectorAll('.ld-layer'));
    if (!sws.length || !layers.length) return;

    /* 每个场景的 tone / wx 从图层元素上读。
       EJS 渲染时就写好了 → 即使 JS 崩了，首屏的明暗也是对的。 */
    var meta = layers.map(function (el) {
      return {
        tone: el.getAttribute('data-tone') || 'light',
        wx:   el.getAttribute('data-wx')   || 'rain'
      };
    });

    var cur  = 0;
    var busy = false;
    var timer = null;

    /* ⚠️ 必须与 CSS 的 --ld-xfade 一致（1000ms） */
    var COOLDOWN = 1000;

    function apply(i) {
      if (i < 0 || i >= layers.length) return;
      if (i === cur || busy) return;

      busy = true;
      cur = i;

      layers.forEach(function (el, k) { el.classList.toggle('is-on', k === i); });

      sws.forEach(function (b, k) {
        var on = k === i;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });

      var m = meta[i] || meta[0];
      root.setAttribute('data-tone', m.tone);
      root.setAttribute('data-wx', m.wx);
      root.setAttribute('data-scene', String(i));

      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { busy = false; }, COOLDOWN);
    }

    sws.forEach(function (b) {
      b.addEventListener('click', function () {
        var i = parseInt(b.getAttribute('data-i'), 10);
        if (isNaN(i)) return;
        apply(i);
      });
    });

    /* 键盘左右切换（role=tablist 的常规交互） */
    var box = document.getElementById('ld-switch');
    if (box) {
      box.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        var t = e.target;
        if (!t || !t.classList || !t.classList.contains('ld-sw')) return;
        e.preventDefault();
        var n = (cur + (e.key === 'ArrowRight' ? 1 : sws.length - 1)) % sws.length;
        apply(n);
        sws[n].focus();
      });
    }
  })();

  /* ==========================================================
     4. 顶部条：滚过首屏后转"正文模式"
     ----------------------------------------------------------
     为什么不是把导航藏起来：
       藏起来虽然干净，但下方四幕就没有入口了。
       改成"保持可见、但强制切回亮色字"——
       因为下方正文的底色是自己压暗的深色渐变，
       若场景是亮底（tone=dark，深色字），就会黑字压黑底。
       （当前两场景都是 light，所以这条现在是保险，不是常态。）
     ========================================================== */

  (function topbar() {
    var bar = document.getElementById('ld-top');
    var heroIn = root.querySelector('.ld-hero-in');
    if (!bar) return;

    var last = null;

    function tick() {
      var y  = window.scrollY || window.pageYOffset || 0;
      var vh = window.innerHeight || 1;

      /* 用阈值判定（而不是滚动方向），避免在临界点反复抖 */
      var inBody = y > vh * 0.62;
      if (inBody !== last) {
        last = inBody;
        root.classList.toggle('is-body', inBody);
      }

      /* 首屏内容随滚动轻微上移 + 淡出，给"进入正文"一个过渡 */
      if (heroIn && !reduceMotion) {
        var p = clamp(y / (vh * 0.85), 0, 1);
        heroIn.style.transform = 'translate3d(0,' + (p * -46).toFixed(1) + 'px,0)';
        heroIn.style.opacity = (1 - p * 0.9).toFixed(3);
      }

      requestAnimationFrame(tick);
    }

    tick();
  })();

  /* ==========================================================
     5. 滚动进度
     ========================================================== */

  (function scrollProgress() {
    var thumb = document.getElementById('pf-scrollbar-thumb');
    var track = document.querySelector('.pf-scrollbar-track');
    var bar = document.getElementById('pf-scrollbar');
    if (!thumb || !track) return;

    var smoothing = 0, target = 0;

    function measure() {
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      var p = clamp(window.scrollY / max, 0, 1);
      var th = track.clientHeight;
      var hh = Math.max(22, thumb.offsetHeight || 30);
      target = p * (th - hh);
    }

    measure();
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('scroll', measure, { passive: true });

    (function tick() {
      smoothing = lerp(smoothing, target, 0.12);
      /* 用 transform 而不是 top —— 走合成层，不触发重排 */
      thumb.style.transform = 'translate3d(0,' + smoothing.toFixed(2) + 'px,0)';
      if (bar) bar.classList.toggle('is-visible', window.scrollY > 40);
      requestAnimationFrame(tick);
    })();
  })();

  /* ==========================================================
     6. 入场：逐行遮罩上推（split-line-up-effect）
     ----------------------------------------------------------
     原理：
       ① 把一段文字按"视觉行"切开，每行各自包一层 overflow:hidden 的壳
       ② 壳里再放一个 .pf-line-in，初始 translateY(105%) —— 完全藏在壳下面
       ③ 激活时把 inner 推回 0：文字像从"下一行"升上来
       ④ 行与行之间错开延迟，形成"逐行浮现"的节奏
     ⚠️ 样式在 profile.css 里（与云海页共用），本文件只管切分与观察。
     ========================================================== */

  (function splitLines() {
    var targets = Array.prototype.slice.call(root.querySelectorAll('.pf-split'));
    if (!targets.length) return;

    /* 把元素里的文字按视觉行切分：
       先按 <br> 与换行拆成"逻辑段"，再在段内逐字测量
       （getBoundingClientRect().top 变化）找出真实折行位置。 */
    function splitEl(el) {
      if (el.getAttribute('data-split') === '1') {
        return Array.prototype.slice.call(el.querySelectorAll('.pf-line-in'));
      }

      var raw = el.innerHTML;
      var segs = raw.split(/<br\s*\/?>/i).map(function (s) { return s.trim(); })
                    .filter(function (s) { return s.length; });
      if (!segs.length) segs = [''];

      el.textContent = '';
      var nodes = [];
      segs.forEach(function (seg, si) {
        if (si > 0) {
          el.appendChild(document.createElement('br'));
          nodes.push(null);   /* 段间强制换行 */
        }
        for (var i = 0; i < seg.length; i++) {
          var sp = document.createElement('span');
          sp.textContent = seg.charAt(i);
          sp.style.display = 'inline-block';
          sp.style.whiteSpace = 'pre';
          el.appendChild(sp);
          nodes.push(sp);
        }
      });

      /* 按 top 归组 → 得到视觉行 */
      var lines = [];
      var cur = [];
      var lastTop = null;
      nodes.forEach(function (n) {
        if (!n) {
          if (cur.length) { lines.push(cur); cur = []; }
          lastTop = null;
          return;
        }
        var top = Math.round(n.getBoundingClientRect().top);
        if (lastTop === null || top === lastTop) {
          cur.push(n);
        } else {
          if (cur.length) lines.push(cur);
          cur = [n];
        }
        lastTop = top;
      });
      if (cur.length) lines.push(cur);

      /* 用行内容重建：每行一个壳 + 一个可位移的 inner */
      el.textContent = '';
      var inners = [];
      lines.forEach(function (lineNodes) {
        var text = lineNodes.map(function (n) { return n.textContent; }).join('');
        if (!text.replace(/\s/g, '')) return;

        var shell = document.createElement('span');
        shell.className = 'pf-line';
        var inner = document.createElement('span');
        inner.className = 'pf-line-in';
        inner.textContent = text;
        shell.appendChild(inner);
        el.appendChild(shell);
        inners.push(inner);
      });

      el.setAttribute('data-split', '1');
      return inners;
    }

    targets.forEach(function (el) {
      var inners = splitEl(el);
      /* 行号写进自定义属性，CSS 用 --li 做递减延迟 */
      inners.forEach(function (inner, i) { inner.style.setProperty('--li', i); });
    });

    if (reduceMotion) { root.classList.add('pf-split-done'); return; }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });

    targets.forEach(function (el) { io.observe(el); });
  })();

  /* ==========================================================
     7. 入场观察器（非文字类元素）
     同批进入的元素按顺序递增延迟（最多 5 档，每档 90ms）
     ========================================================== */

  (function reveal() {
    var items = Array.prototype.slice.call(root.querySelectorAll('.pf-reveal'));
    if (!items.length) return;

    if (!('IntersectionObserver' in window) || reduceMotion) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    items.forEach(function (el, i) {
      el.style.setProperty('--rd', (i % 5) * 90);
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    items.forEach(function (el) { io.observe(el); });
  })();

  /* ==========================================================
     7b. 滚动叙事：四幕随滚动做视差 / 淡出
     ⚠️ 只作用于 .pf-sec（下方四幕），不含 .ld-hero ——
        首屏的位移在 topbar() 里单独处理，两者别打架。
     ========================================================== */

  (function scrollNarrative() {
    if (reduceMotion) return;
    var secs = Array.prototype.slice.call(root.querySelectorAll('.pf-sec'));
    if (!secs.length || !window.requestAnimationFrame) return;

    var meta = secs.map(function (sec) {
      var inner = sec.querySelector('.pf-sec-inner');
      return { sec: sec, inner: inner, top: 0, height: 1 };
    });

    function measure() {
      var sy = window.scrollY || window.pageYOffset || 0;
      meta.forEach(function (m) {
        var r = m.sec.getBoundingClientRect();
        m.top = r.top + sy;
        m.height = Math.max(1, r.height);
      });
    }

    measure();
    window.addEventListener('resize', measure, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(function () {});
    }

    var cur = meta.map(function () { return 0; });

    (function tick() {
      var sy = window.scrollY || window.pageYOffset || 0;
      var vh = window.innerHeight;

      meta.forEach(function (m, i) {
        if (!m.inner) return;
        /* p: 0 = 幕顶刚到视口底, 1 = 幕底离开视口顶 */
        var p = clamp((sy + vh - m.top) / (vh + m.height), 0, 1);
        cur[i] = lerp(cur[i], p, 0.12);

        /* 视差：进入时从 +18px 落到 -18px，比背景慢 → 有纵深 */
        var local = cur[i] - 0.5;
        var ty = local * -22;
        var fade = 1 - clamp((Math.abs(local) - 0.28) / 0.30, 0, 1) * 0.55;
        m.inner.style.transform = 'translate3d(0,' + ty.toFixed(2) + 'px,0)';
        m.inner.style.opacity = fade.toFixed(3);
      });

      requestAnimationFrame(tick);
    })();
  })();

  /* ==========================================================
     8. 光标跟随
     外圈延迟跟随（光晕拖尾），内点精确跟随
     ========================================================== */

  (function cursor() {
    var ring = document.getElementById('pf-cursor');
    var dot = document.getElementById('pf-cursor-dot');
    if (!ring || !dot) return;
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;

    var tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    var rx = tx, ry = ty;

    window.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      dot.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)';
    }, { passive: true });

    (function tick() {
      rx = lerp(rx, tx, 0.14);
      ry = lerp(ry, ty, 0.14);
      ring.style.transform = 'translate3d(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px,0)';
      requestAnimationFrame(tick);
    })();

    /* 悬停在可交互元素上时放大外圈 */
    var hoverSel = 'a, button, input, .pf-about-card, .pf-feat-item, .ld-sw, .ld-btn, .ld-btn2';
    document.addEventListener('pointerover', function (e) {
      if (e.target.closest && e.target.closest(hoverSel)) ring.classList.add('is-hover');
    }, { passive: true });
    document.addEventListener('pointerout', function (e) {
      if (e.target.closest && e.target.closest(hoverSel)) ring.classList.remove('is-hover');
    }, { passive: true });
  })();

  /* ==========================================================
     9. 音乐控件 → 已抽成共用模块 js/music.js
     ----------------------------------------------------------
     2026-09-28：/clouds/ 也要放同一个控件。为避免两份逻辑分叉，
     把原来的实现**原样**搬到 themes/liushen-clone/source/js/music.js，
     本文件不再包含音乐逻辑。两个页面都在 page.ejs 里加载 music.js。
     ⚠️ 样式仍在 profile.css（.pf-music / .pf-snd）—— 那份 CSS 两页都会加载，
        但 --pf-* 令牌定义在 .pf 上，/clouds/ 取不到，由 clouds.css 补一份。
     ========================================================== */

  /* ==========================================================
     10. 控制台彩蛋
     ========================================================== */

  (function easterEgg() {
    if (!window.console) return;
    var css = 'color:#E8A85C;font-family:Georgia,serif;font-size:13px;';
    try {
      console.log('%c三座城市都在下雨，而我刚好有一把伞。', css);
      console.log('%c—— 尚谦 · ' + new Date().toLocaleDateString('zh-CN'), css);
    } catch (e) {}
  })();

})();
