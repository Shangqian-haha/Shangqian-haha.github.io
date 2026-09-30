/* ============================================================
   音乐控件 · 共用模块（服务 /profile/ 极光页；逻辑、样式各自独立成文件）
   ------------------------------------------------------------
   形态：一个圆钮 + 20×20 canvas 画 7 根跳动的竖条。
   没有音量滑块 —— 音量在 source/_data/profile.yml 的 music.volume 里配。

   ⚠️ 为什么抽成独立文件（2026-09-28）：
      当初两张全屏页要用同一个控件。与其各写一遍（两份逻辑必然分叉），
      把原来藏在 profile.js 里的那段**原样**搬到这里。
      （2026-09-29 雨夜伦敦页已删除，本文件现只服务 /profile/ 极光页。）

   ⚠️ 样式不在本文件：全部来自 profile.css 的 .pf-music / .pf-snd。
      profile.css 由本页加载（见 head.ejs），圆钮、竖条、悬停/播放态都由它定。
      ⚠️ 但 --pf-* 变量是定义在 .pf 上的（原雨夜伦敦页的根元素，现已删除），
         本页的根是 .cl，取不到 → 由 clouds.css 补一份同名令牌。

   ⚠️ 音频来源：source/_data/profile.yml 的 music.src
      （现为 Mitski《My Love Mine All Mine》，文件在主题 source/audio/）。
      src 为空时自动退化成「静音占位」：不加载音频，
      但播放/暂停、竖条动画、aria 状态全部真实可用。

   ⚠️ 自动起播（2026-09-28 加固）：
      正常路径 —— 'pf:enter' 事件（自定义）：
        由 clouds.js 的入场闸门派发（旧版第二个派发点随雨夜伦敦页删除）。
        这里通常都是「访客点一下」触发，带用户手势，play() 合规。
      兜底路径 —— 若闸门是定时自动放行（访客没点过任何地方），
        浏览器会以自动播放策略拒掉带声 play()。此时挂一次性手势监听：
        访客随便动一下（点/滚/按键/触摸）就补播一次。
        ⚠️ 只在「被策略拒绝」后补播；访客主动点过暂停就不再打扰。

   零依赖、零外部库。
   ============================================================ */
(function () {
  'use strict';

  var box = document.getElementById('pf-music');
  if (!box) return;

  var btn = document.getElementById('pf-music-btn');
  var cvs = document.getElementById('pf-snd-canvas');
  if (!btn) return;

  var clamp = function (v, mi, ma) { return v < mi ? mi : (v > ma ? ma : v); };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };

  var src    = box.getAttribute('data-src') || '';
  var type   = box.getAttribute('data-type') || 'audio/mpeg';
  var loopOn = box.getAttribute('data-loop') === '1';
  var isPlaceholder = !src;

  if (isPlaceholder) box.classList.add('is-placeholder');

  var audio = null;
  var playing = false;
  var playPending = false;    /* play() 承诺未落地 —— 防重复调用 */
  var userPaused = false;     /* 访客主动点过暂停 —— 之后不再自动补播 */
  var pendingPlay = false;
  var wantVolume = clamp(parseFloat(box.getAttribute('data-volume')) || 0.16, 0, 1);

  if (!isPlaceholder) {
    audio = document.createElement('audio');
    audio.loop = loopOn;
    audio.volume = 0;              /* 淡入用 */
    /* ⚠️ preload 用 auto：闸门（加载条 + 入场动画）有 1.3~3.6s 的空窗，
       正好拿来缓冲。改 'metadata' 可省流量（代价是起播慢一点）。 */
    audio.preload = 'auto';
    var s = document.createElement('source');
    s.src = src;
    s.type = type;
    audio.appendChild(s);
    audio.style.display = 'none';
    box.appendChild(audio);

    audio.addEventListener('ended', function () {
      if (!loopOn) setPlaying(false);
    });
    audio.addEventListener('error', function () { setPlaying(false); });
  }

  /* ---------- 向入场闸门汇报缓冲进度（2026-09-30 加入） ----------
     为什么要有这块：闸门的进度条原来只是一段 1.3s 的计时动画，与真实加载
     无关；背景音乐（mp3，未压缩时 5.5MB）往往还没下完就提示「点击任意处
     进入」，访客点进去，歌是哑的、过几秒才响。
     现在 clouds.js 的 loadTick 会读 window.__pfAudio：只要音频没就绪，
     闸门进度条就不过 100%，并在提示语里显示「正在缓冲音乐」。
       · ready  —— 可顺畅通播（缓冲到接近片尾 / canplaythrough）
       · ratio  —— 0~1 缓冲比例（duration 拿不到时保持 0，靠 ready 放行）
       · failed —— 加载出错，闸门不再等
       · t0     —— 起算时刻，clouds.js 用它做 20s 超时放行兜底
     ⚠️ ratio 只增不减：网络抖动时 buffered 窗口会缩回去，进度条往回退
        会让人以为卡死了。 */
  var AP = window.__pfAudio = {
    ready: isPlaceholder,
    ratio: isPlaceholder ? 1 : 0,
    failed: false,
    duration: 0,
    buffered: 0,
    t0: Date.now()
  };

  if (audio) {
    var probeAudio = function () {
      if (AP.failed) return;
      var d = audio.duration;
      /* ⚠️ hexo server 对静态文件不发 Content-Length / Accept-Ranges
         （实测 200 + chunked），duration 有可能拿不全；本曲带 Xing/Info
         帧头，正常情况 metadata 一到就有 137.8s。拿不到就只靠 readyState。 */
      if (d && isFinite(d) && d > 0) {
        var end = 0;
        try {
          if (audio.buffered && audio.buffered.length) {
            end = audio.buffered.end(audio.buffered.length - 1);
          }
        } catch (e) { end = 0; }
        AP.duration = d;
        AP.buffered = end;
        var r = end / d;
        if (r > AP.ratio) AP.ratio = Math.min(1, r);
        if (end >= d - 0.4) AP.ready = true;     /* 离片尾 0.4s 内 = 整首就绪 */
      }
      if (audio.readyState >= 4) AP.ready = true; /* HAVE_ENOUGH_DATA */
    };
    ['loadedmetadata', 'loadeddata', 'durationchange', 'progress',
     'canplay', 'canplaythrough', 'suspend', 'stalled', 'timeupdate']
      .forEach(function (ev) { audio.addEventListener(ev, probeAudio); });
    audio.addEventListener('error', function () {
      AP.failed = true;                      /* 资源坏了也别把访客卡在闸门里 */
      AP.ready = true;
      AP.ratio = 1;
    });
    probeAudio();
  }

  /* canvas 竖条：7 根，正弦相位错开。
     ⚠️ 画在 20×20 的逻辑坐标里，用 dpr 放大 backing store，
        否则 retina 上是糊的。 */
  var D = 20;
  var L = Math.min(window.devicePixelRatio || 1, 2);
  var ctx = null;
  if (cvs) {
    cvs.width  = D * L;
    cvs.height = D * L;
    ctx = cvs.getContext('2d');
  }

  /* A 是"时间累加器"（秒），只在播放时推进 —— 暂停时竖条自然停住 */
  var A = 0;
  var lastT = performance.now();

  function drawBars() {
    if (!ctx) return;
    var now = performance.now();
    var dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    if (playing) A += dt;
    var amp = playing ? 1 : 0;

    ctx.save();
    ctx.scale(L, L);
    ctx.clearRect(0, 0, D, D);
    ctx.fillStyle = playing
      ? getComputedStyle(box).getPropertyValue('--pf-lamp').trim() || '#E8A85C'
      : 'rgba(160,172,190,.55)';
    for (var f = 0; f < 7; f++) {
      var wave = 0.5 * Math.sin(-6 * A + 0.6 * f) + 0.5;
      var h = 3 + 8 * wave * amp;
      ctx.fillRect(3 * f, D - h, 1, h);
    }
    ctx.restore();
  }

  (function tick() {
    drawBars();
    requestAnimationFrame(tick);
  })();

  function setPlaying(on) {
    playing = on;
    box.classList.toggle('is-playing', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? '暂停背景音乐' : '播放背景音乐');
    btn.setAttribute('title', on ? '暂停背景音乐' : '播放背景音乐');
  }

  function fadeTo(target, ms) {
    if (!audio) return;
    var from = audio.volume;
    var t0 = performance.now();
    (function step(now) {
      var p = clamp((now - t0) / ms, 0, 1);
      var eased = p * p * (3 - 2 * p);
      audio.volume = clamp(lerp(from, target, eased), 0, 1);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  function doPlay() {
    if (playPending) return;
    /* 占位模式：没有音频，但状态与竖条动画照常 —— 交互逻辑完整 */
    if (isPlaceholder) { setPlaying(true); return; }
    playPending = true;
    /* ⚠️ 乐观 UI（2026-09-29）：点了就**立即**亮播放态并开始淡入 ——
       不等 play() 的 promise（大音频缓冲时它可能迟 1s 以上，
       期间按钮点了没反应，真实用户会觉得「失灵」）。
       若随后被自动播放策略拒绝（catch），再回落到暂停态。 */
    setPlaying(true);
    fadeTo(wantVolume, 900);
    var pr = audio.play();
    if (pr && pr.then) {
      pr.then(function () {
        playPending = false;
      }).catch(function () {
        /* 多半是自动播放策略拒绝 —— 回落暂停态，交回给手势补播兜底 */
        playPending = false;
        setPlaying(false);
      });
    } else {
      playPending = false;
    }
  }

  function doPause() {
    if (isPlaceholder) { setPlaying(false); return; }
    fadeTo(0, 420);
    window.setTimeout(function () { audio.pause(); setPlaying(false); }, 430);
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (playing) { userPaused = true; doPause(); }
    else { userPaused = false; doPlay(); }
  });

  /* 入场后自动开播 —— "点击进入即起音乐" */
  document.addEventListener('pf:enter', function () {
    if (isPlaceholder || !audio) return;
    doPlay();
  });

  /* 兜底：闸门若由定时器自动放行（访客没点过页面），play() 会被拒。
     挂一次性手势监听，访客第一次交互就补播。
     ⚠️ 用户主动暂停过（userPaused）就不自动起，尊重用户。 */
  function onFirstGesture(e) {
    if (isPlaceholder || !audio) return;
    if (userPaused || playing || playPending) return;
    /* ⚠️ 手势若落在音乐钮上，交给按钮自己的 click 逻辑 ——
       否则 pointerdown 会抢先把状态乐观地切成「播放」，
       随后的 click 看到播放态又被当成「暂停」，
       一次点击的净效果变成「没播」（2026-09-29 修） */
    if (e && e.target && btn.contains(e.target)) return;
    doPlay();
  }
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) {
    document.addEventListener(ev, onFirstGesture, { passive: true });
  });

  /* 页面隐藏时暂停，回来时恢复 */
  document.addEventListener('visibilitychange', function () {
    if (playing) lastT = performance.now();
    if (!audio) return;
    if (document.hidden && playing) {
      audio.pause(); pendingPlay = true; playing = false;
      box.classList.add('is-playing');
    } else if (!document.hidden && pendingPlay) {
      pendingPlay = false; doPlay();
    }
  });
})();
