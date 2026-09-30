/* ============================================================
   云海之上 · /clouds/ 交互逻辑
   零依赖，零外部库（WebGL 用原生 API 手写）

   与 profile.js 的关系：
     · 结构与时序机制（逐行上推 / 入场观察器 / 遮罩 / 滚动条 / 光标 /
       音乐圆钮）是**同一套做法**，这里从头写而不是共享文件，
       因为两个场景的"节奏参数"完全不同（云海要慢、要轻）。
     · 雨夜那套 shader 留给了 /profile/，本文件是一支全新的 GLSL。

   共 8 段：
     1. 天空读数加载    2. 入场解锁
     3. WebGL 云海场景  4. 滚动进度
     5. 逐行遮罩上推    6. 入场观察器 + 滚动叙事
     7. 光标跟随        8. 音乐控件 + 彩蛋
   ============================================================ */
(function () {
  'use strict';

  var root = document.getElementById('clouds-root');
  if (!root) return;

  /* 告诉 CSS「脚本已经接管」。必须同步、尽早执行。 */
  root.classList.add('js-on');

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var lerp  = function (a, b, t) { return a + (b - a) * t; };
  var clamp = function (v, mi, ma) { return v < mi ? mi : (v > ma ? ma : v); };

  /* ==========================================================
     1. 入场读数
     雨夜那版是"信号在接入"，这版换成"太阳在升起"：
     逐行从随机字符固化，最后一行是高度读数（登山表的感觉）。
     ========================================================== */

  (function preloader() {
    var box = document.getElementById('cl-pre-lines');
    if (!box) return;

    var targets = [
      '··· ——— ···',
      'SEA OF CLOUDS',
      'ASCENDING',
      'ALT 2,860 M'
    ];
    var GLYPHS = '01·—/\\|<>[]{}#*+=~ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    var rows = targets.map(function (t) {
      var el = document.createElement('span');
      el.textContent = t;
      box.appendChild(el);
      return { el: el, target: t, done: false };
    });

    if (reduceMotion) {
      rows.forEach(function (r) { r.done = true; r.el.classList.add('is-done'); });
      return;
    }

    var start = performance.now();
    var DUR = 1400;

    (function tick(now) {
      var p = clamp((now - start) / DUR, 0, 1);
      rows.forEach(function (r, i) {
        if (r.done) return;
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
        if (local >= 1) { r.done = true; r.el.textContent = r.target; r.el.classList.add('is-done'); }
      });
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  })();

  /* ==========================================================
     2. 入场解锁
     ========================================================== */

  var preloaderEl = document.getElementById('cl-preloader');
  var entered = false;

  function enter() {
    if (entered) return;
    entered = true;
    root.classList.add('pf-ready');
    document.body.classList.add('pf-body-lock-off');
    document.dispatchEvent(new CustomEvent('cl:enter'));
  }

  if (preloaderEl) {
    preloaderEl.addEventListener('click', enter);
    preloaderEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); }
    });
    window.setTimeout(function () { if (!entered) enter(); }, 4200);
  } else {
    enter();
  }

  document.body.classList.add('pf-body-lock');

  /* ==========================================================
     3. WebGL 云海场景
     ----------------------------------------------------------
     全部手写 GLSL，没有复用任何现成 example 的参数。

     画面按参考图的实测比例分四带（比例 = 归一化 y，**GL 的 y 轴朝上**，
     而参考图的 y 是从上往下量的，所以下面统一写成 uy = 1 - 实测比例）：

       带名           实测 y%     uy（GL 坐标）
       天空顶         0–15%       0.85–1.00
       天空卷云带     15–33%      0.67–0.85
       天空下+远山    33–57.4%    0.426–0.67
       远山脊线       57.4%       0.426   ← 天空与云海的分界
       云海顶边界     58.8%       0.412
       云海最亮       63.7%       0.363
       云海暗部       76–80.5%    0.195–0.24
       木平台         80.5–100%   0.00–0.195

     ----------------------------------------------------------
     ⚠️ 三个反直觉点（都在雨夜那版踩过，这里直接避掉）：
       ① GL 的 y 轴朝上。参考图的 y 是从上往下量的，
          "往下落"在 GL 里是 **y 减小** → 时间项要配合负的 y 系数。
       ② 每帧位移必须 << 1 个噪声网格，否则是"抽搐"不是"流动"。
          经验阈值 ≤ 0.3 网格/帧（60fps）。本文件的云层位移都按这个校过。
       ③ 横向拉长 = x 频率 **小**、y 频率 **大**。反过来就变成"竖着的雨"。
     ========================================================== */

  (function cloudScene() {
    var canvas = document.getElementById('cl-canvas');
    if (!canvas) return;

    var gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power'
    }) || canvas.getContext('experimental-webgl');

    if (!gl) {
      /* WebGL 不可用 → 只靠 CSS 层（云絮 / 晨光 / 暗角 / 颗粒），依然成立 */
      root.classList.add('pf-no-webgl');
      return;
    }

    var VERT = [
      'attribute vec2 a_pos;',
      'void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }'
    ].join('\n');

    /* ---------- 片段着色器 ---------- */
    var FRAG = [
      'precision highp float;',
      'uniform vec2  u_res;',
      'uniform float u_time;',
      'uniform vec2  u_mouse;',
      'uniform vec2  u_scroll;',   /* (progress, velocity) */
      '',
      /* --- 2D 哈希与值噪声（与 profile 同源，独立一份） --- */
      'float hash(vec2 p){',
      '  p = fract(p * vec2(123.34, 456.21));',
      '  p += dot(p, p + 45.32);',
      '  return fract(p.x * p.y);',
      '}',
      'float vnoise(vec2 p){',
      '  vec2 i = floor(p); vec2 f = fract(p);',
      '  vec2 u = f * f * (3.0 - 2.0 * f);',
      '  float a = hash(i);',
      '  float b = hash(i + vec2(1.0, 0.0));',
      '  float c = hash(i + vec2(0.0, 1.0));',
      '  float d = hash(i + vec2(1.0, 1.0));',
      '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
      '}',
      'float fbm(vec2 p){',
      '  float v = 0.0; float a = 0.5;',
      '  for(int i = 0; i < 5; i++){',
      '    v += a * vnoise(p);',
      '    p *= 2.02; a *= 0.5;',
      '  }',
      '  return v;',
      '}',
      /* 云海专用 FBM：把坐标**先横向压缩**再进噪声。
         这样噪声的特征在屏幕上是"横向拉长的絮"
         —— x 系数小 / y 系数大，是云的形状，不是雨的形状。 */
      'float cloudFbm(vec2 p){',
      '  vec2 q = vec2(p.x * 0.30, p.y * 1.55);',
      '  return fbm(q);',
      '}',
      /* 绘画化：色阶量化。
         照片是连续渐变，油画是"几块颜色"。
         把亮度按 step 切成 N 档，再把每档的边界稍微软一下，
         就得到"笔触色块"的观感（这是本页"绘画化"的核心手段）。 */
      'vec3 posterize(vec3 c, float n){',
      '  return floor(c * n + 0.5) / n;',
      '}',
      '',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / u_res;',
      '  float ar = u_res.x / u_res.y;',
      '  vec2 p = uv; p.x *= ar;',
      '',
      /* 鼠标视差：整幅画面轻微反向平移（幅度很小，避免"整屏在晃"） */
      '  vec2 par = (u_mouse - 0.5) * 0.035;',
      '  p -= par;',
      '',
      /* ---------- 滚动 ----------
         sc 是 0→1 的总进度。三件事同时发生：
           ① 云海整体**下沉**（像人往上飘，云退到脚下去）
           ② 木平台被推出画面（我们离开地面）
           ③ 天空的晨光略微变亮（天在亮）
         注意 ①：云海下沉 = 云海带在屏幕上的 y 减小。
         用 uy 偏移实现时，必须写成 uy -= rise（rise 随滚动变大）。 */
      '  float sc = u_scroll.x;',
      '  float rise = sc * 0.42;',
      '',
      /* ---------- 分带常量（直接对应参考图的实测比例） ---------- */
      '  float RIDGE = 0.426;',   /* 远山脊线 57.4% */
      '  float DECK  = 0.195;',   /* 木平台   80.5% */
      '',
      /* ---------- 天空底色 ---------- */
      /* 三段渐变取自实测色：
           #5577B0 (85,119,176)  → #87A4D0 (135,164,208) → #8BB0DD (139,176,221)
         都在 sRGB 上，先归一化再用。天空顶另加一点深压，
         否则整屏饱和度偏高、看起来"塑料"。 */
      '  vec3 cSkyTop = vec3(0.255, 0.373, 0.612);',   /* 压暗：实测平均 #5476AF */
      '  vec3 cSkyMid = vec3(0.400, 0.545, 0.769);',   /* #668BCA */
      '  vec3 cSkyLow = vec3(0.522, 0.667, 0.855);',   /* #85AADA */
      '  float uy = uv.y;',       /* 屏幕坐标：0 底 1 顶（不受视差影响，天空要稳） */
      '  vec3 col = mix(cSkyLow, cSkyMid, smoothstep(0.30, 0.66, uy));',
      '  col = mix(col, cSkyTop, smoothstep(0.62, 1.02, uy));',
      /* 顶部再压一档深蓝，做出"从高空往下看"的纵深 */
      '  col = mix(col, col * 0.72, smoothstep(0.80, 1.0, uy));',
      '',
      /* ---------- 天空卷云（上层，横向拉长的絮） ---------- */
      /* 卷云要"上疏下密"（参考图 15–33% 最厚），所以按 uy 给权重。
         ⚠️ 位移要同时满足两条互相矛盾的要求：
              · 不能走样：每帧位移 << 1 个噪声网格
                （cloudFbm 内部 x 乘 0.30 → 安全上限约 k ≤ 0.9/60/0.30 ≈ 0.05 s⁻¹ ×2π）
              · 不能不"活"：原来 k=0.34 换算成 0.34*0.30 = 0.0017 网格/帧，
                2.6 秒帧差只有 0.8/255 —— 肉眼几乎看不出在动。
            取 k=1.15：0.0058 网格/帧（安全），2.6 秒约推进 1.5 个网格特征
            → 能明确看到絮在飘，但远不到"抽搐"。 */
      '  float t = u_time * 0.019;',
      '  vec2 cp1 = vec2(p.x + t * 2.6, p.y * 1.0 - t * 0.24);',
      '  float c1 = cloudFbm(vnoise(cp1 * 0.6 + 3.1) * 5.5 + cp1 * 1.4);',
      '  float band1 = smoothstep(0.30, 0.52, uy) * (1.0 - smoothstep(0.84, 1.0, uy));',
      /* 卷云是"被风拉过的丝"，对比度要低、边缘要软 */
      '  float cirrus = smoothstep(0.52, 0.92, c1) * band1;',
      /* 权重从 0.55 降到 0.34：卷云是白雾，铺太多会把天空整体提亮，
         而参考图蓝色天空带就该是"被烟压过的中蓝"，不是浅蓝。 */
      '  col = mix(col, vec3(0.885, 0.918, 0.960), cirrus * 0.34);',
      '',
      /* ---------- 远山脊线 ---------- */
      /* 参考图里这是一条**几乎平直**的深蓝线，只在中段有两个很浅的凹口。
         所以不能用大起伏的噪声当山脊 —— 会变成"锯齿山"，一眼假。
         做法：低频噪声 + 大幅度压扁（*0.035）。 */
      '  float ridgeNoise = fbm(vec2(p.x * 0.55, 7.7));',
      '  float ridgeY = RIDGE + (ridgeNoise - 0.5) * 0.035 - rise * 0.30;',
      /* 云海顶边界（离脊线很近，58.8% vs 57.4%） */
      '  float seaTopY = ridgeY - 0.014;',
      '',
      /* ---------- 云海 ----------
         三个层次叠起来才是"海"而不是"一条白带"：
           ① 底色：从云海顶往下由白渐灰（实测 #B3C0D1 → #868A94）
           ② 絮状纹理：横向拉长的 FBM，越靠近顶越亮、越往下越沉
           ③ 云顶边界线：一条明显的亮线（参考图里云海顶是"硬边"）
         云海**向下沉**：uy 减去 rise（rise 随滚动增大）→ 云海带整体下移。 */
      '  float seaY = uy + rise;',      /* 云海自己的坐标：滚动时内容向下走 */
      '  float inSea = smoothstep(seaTopY - 0.006, seaTopY + 0.010, seaY);',
      '  inSea *= 1.0 - smoothstep(DECK - 0.02, DECK + 0.012, seaY);',
      /* ② 絮状纹理：两层不同尺度的横向拉长噪声
            ⚠️ 这里有个"看起来该动却几乎不动"的陷阱：
               sp1 的 x 已经乘了 p.x*0.85，再进 cloudFbm 又乘 0.30
               → 总系数只有 0.255。给位移 1.05 也只有 0.0045 网格/帧，
               2.6 秒帧差 0.9/255，肉眼完全看不出云在流动。
               所以位移要给得**比直觉大得多**（2.8），换算后
               2.8*0.255 = 0.0119 网格/帧，仍远低于走样阈值 0.3，
               但 2.6 秒能推进约 1.9 个特征 → 明确可见的流动。
            两层速度差（2.8 vs 1.7）+ 方向相反 → 产生"这一团在飘、
            那一团在退"的交错感，比同速平移自然得多。 */
      '  vec2 sp1 = vec2(p.x * 0.85 + t * 2.80, seaY * 3.4 + t * 0.40);',
      '  vec2 sp2 = vec2(p.x * 1.90 - t * 1.70, seaY * 6.2 + t * 0.26);',
      '  float sA = cloudFbm(sp1);',
      '  float sB = fbm(sp2 * vec2(0.45, 1.0));',
      '  float seaTex = sA * 0.68 + sB * 0.32;',
      /* 云海亮部色 / 暗部色（实测）
         ⚠️ 这里必须**比实测更白**：
            实测 #B3C0D1 是"整幅 JPEG 平均"，而云海的最亮处其实到 220+。
            更要紧的是——shader 出来的颜色要再经过 CSS 的
            .cl-haze（白色低透明大团）与 .cl-light（暖白散射）两层叠加，
            它们在云海区域大约再加 8~14 点。所以底色留出这个余量，
            叠加后正好落在 #C8D6EC 附近 = 实测的 #CFDEF1。 */
      '  vec3 cSeaHi = vec3(0.782, 0.822, 0.878);',
      '  vec3 cSeaLo = vec3(0.478, 0.520, 0.596);',
      /* 越靠云海顶越亮（参考图 63.7% 处最亮 220） */
      '  float seaDepth = clamp((seaY - seaTopY) / 0.26, 0.0, 1.0);',
      '  float lum = mix(0.94, 0.52, seaDepth) + (seaTex - 0.5) * 0.62;',
      '  vec3 seaCol = mix(cSeaLo, cSeaHi, clamp(lum, 0.0, 1.0));',
      /* 云丝：把纹理的高频部分切出来当"一缕一缕"的云絮 */
      '  float strands = smoothstep(0.58, 0.94, sA);',
      '  seaCol += vec3(0.10, 0.11, 0.12) * strands * (1.0 - seaDepth * 0.6);',
      /* 云海顶的硬边亮线（参考图这里亮度从 134 跳到 199） */
      '  float edge = 1.0 - smoothstep(0.0, 0.012, abs(seaY - seaTopY));',
      '  seaCol = mix(seaCol, vec3(0.965, 0.980, 0.998), edge * 0.80);',
      /* 合成云海 */
      '  col = mix(col, seaCol, inSea);',
      '',
      /* ---------- 云海对天空的"溢出" ---------- */
      /* 真实云海会在脊线附近往上漫一点点白雾，压住天空与云的分界太硬。
         这就是 CSS .cl-haze 想做的事，这里是 WebGL 里的对应。 */
      '  float spill = smoothstep(ridgeY - 0.075, ridgeY, seaY) * (1.0 - inSea);',
      '  float spillTex = smoothstep(0.42, 0.86, cloudFbm(vec2(p.x * 0.9 + t * 0.10, seaY * 4.0)));',
      '  col = mix(col, vec3(0.900, 0.930, 0.968), spill * spillTex * 0.42);',
      '',
      /* ---------- 木平台（底部） ---------- */
      /* 参考图 80.5% 以下是深褐木地板（#534841，亮度 73）。
         这里刻意**做得比参考图更简**：只留横向的木板接缝与一点温度，
         因为往下滚用户会移出这一带 —— 花太多像素不值。
         木平台随滚动被推出画面：deckY 往上收（uy 减小）。 */
      '  float deckTop = DECK - rise * 0.90;',
      '  float onDeck = step(uy, deckTop);',
      /* 木平台实测 #534841（亮度 73）。取 0.185 起 —— 最终还要过晨光
         约 +0.03、再被两道白色 CSS 雾 +0.04，落在 0.255 ≈ 亮度 65，
         与实测（底部 44 / 平均 73）吻合。第一版给 0.245 结果偏亮发灰。 */
      '  vec3 cDeck = vec3(0.185, 0.156, 0.134);',
      '  vec3 cDeckWarm = vec3(0.300, 0.232, 0.174);',
      /* 木板接缝：横向的细线，按 uv.y 的周期切 */
      '  float plank = fract(uv.y * 88.0 + 0.5);',
      '  float joint = smoothstep(0.0, 0.16, plank) * (1.0 - smoothstep(0.84, 1.0, plank));',
      '  vec3 deckCol = mix(cDeck, cDeckWarm, joint * 0.85);',
      /* 平台内侧（更靠近画面底部）更暗，做出"往自己脚边收"的纵深 */
      '  deckCol *= mix(1.0, 0.55, smoothstep(deckTop, 0.0, uy));',
      '  col = mix(col, deckCol, onDeck * 0.96);',
      /* 木平台与云海之间那条亮线（参考图 y=1015 处亮度 127 的受光边） */
      '  float deckEdge = 1.0 - smoothstep(0.0, 0.006, abs(uy - deckTop));',
      '  col = mix(col, vec3(0.620, 0.556, 0.470), deckEdge * 0.55);',
      '',
      /* ---------- 晨光 ---------- */
      /* 光来自右上方（参考图的亮部集中在云海中段偏右）。
         做法同雨夜那盏灯：核心 + 光晕 + 弥散三段，d2 的系数控制半径。
         ⚠️ 系数越大 = 半径越小。这里刻意做得**很宽**（云海是被整片照亮的，
            不是被聚光灯打的），所以系数比雨夜那版小一个量级。 */
      '  vec2 lp = vec2(0.70, 0.40);',
      '  vec2 dv = vec2((p.x / ar - lp.x) * 1.0, (uv.y - lp.y) * 1.25);',
      '  float d2 = dot(dv, dv);',
      '  float core = 1.0 / (1.0 + d2 * 26.0);',
      '  float halo = 1.0 / (1.0 + d2 * 5.2);',
      '  float wide = 1.0 / (1.0 + d2 * 1.15);',
      '  float sun = core * 0.34 + halo * 0.16 + wide * 0.074;',
      '  vec3 cSun = vec3(1.000, 0.952, 0.870);',
      /* sunFall：晨光随高度衰减 —— 光是照在云海上的，
         不该把底部的木地板也一起洗白（那会让平台发灰发假）。
         用 smoothstep(0.06, 0.34, uy) 把光限制在云海及以上。 */
      '  float sunFall = smoothstep(0.06, 0.34, uy);',
      '  float sunMask = (inSea * 0.62 + spill * 0.26 + 0.16) * sunFall;',
      '  col += cSun * sun * sunMask * 0.48;',
      '',
      /* ---------- 绘画化：色块量化 + 笔触噪点 ---------- */
      /* ① 量化：把连续渐变压成有限几档颜色（油画的第一特征）
            天空 22 档比较细（大面积平滑区太粗会出色带），
            云海 14 档（云的层次本来就少而硬）。
            mix 0.35 而不是 1.0 —— 全量量化会显脏，留 35% 的柔和。 */
      '  vec3 qCol = mix(col, posterize(col, 22.0), 0.35);',
      /* ② 云海单独再量化一次，档数更粗 → 云的"块"更明显 */
      '  qCol = mix(qCol, mix(seaCol, posterize(seaCol, 14.0), 0.5), inSea * 0.55);',
      '  col = qCol;',
      '',
      /* ③ 笔触噪点：用**低频**噪声（不是雨夜那种高频胶片颗粒）当"画笔痕迹"，
          ！关键：这个噪声必须极慢地动，否则整幅画会"沸腾"（油画最忌讳）。
          位移 t*0.09 → 0.0009 网格/帧，安全；但改了 t 的量纲后要重算：
          uv.x*160 * 0.09/60 ≈ 0.24 网格/帧 —— 有点接近走样阈值了，
          所以这里给 0.05（≈0.13 网格/帧），肉眼刚好能看到"笔触在微微游动"，
          又不会沸。 */
      '  float stroke = fbm(vec2(uv.x * 160.0, uv.y * 108.0) + t * 0.05) - 0.5;',
      '  col += stroke * 0.042;',
      /* ④ 极细颗粒，只用来打散色带（比雨夜淡，白天提亮会显脏） */
      '  float grain = hash(gl_FragCoord.xy + fract(u_time) * 91.7) - 0.5;',
      '  col += grain * 0.010;',
      '',
      /* ---------- 天在亮：随滚动提升整体亮度（像日出） ---------- */
      '  col *= 1.0 + sc * 0.07;',
      '',
      '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
      '}'
    ].join('\n');

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        /* 把编译日志打到控制台 —— 否则 shader 出错时画面全黑，无从下手 */
        if (window.console) console.error('[clouds] shader:', gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    }

    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { root.classList.add('pf-no-webgl'); return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (window.console) console.error('[clouds] link:', gl.getProgramInfoLog(prog));
      root.classList.add('pf-no-webgl');
      return;
    }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);

    var aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var uRes    = gl.getUniformLocation(prog, 'u_res');
    var uTime   = gl.getUniformLocation(prog, 'u_time');
    var uMouse  = gl.getUniformLocation(prog, 'u_mouse');
    var uScroll = gl.getUniformLocation(prog, 'u_scroll');

    /* ---- 状态 ---- */
    var mouseT = 0.62, mouseTY = 0.58;   /* 开场光位偏右上，像清晨的太阳 */
    var mouseC = 0.62, mouseCY = 0.58;
    var scrollC = 0, scrollT = 0, scrollPrev = 0, vel = 0;
    var DPR_CAP = 1.5;

    function resize() {
      var w = canvas.clientWidth || window.innerWidth;
      var h = canvas.clientHeight || window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      /* 全屏 FBM，像素越少越流畅；云海的边缘本来就软，降分辨率观感几乎无差 */
      var scale = reduceMotion ? 0.5 : 0.70;
      var W = Math.max(2, Math.floor(w * dpr * scale));
      var H = Math.max(2, Math.floor(h * dpr * scale));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
        gl.viewport(0, 0, W, H);
      }
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });

    window.addEventListener('pointermove', function (e) {
      mouseT  = e.clientX / window.innerWidth;
      mouseTY = 1 - e.clientY / window.innerHeight;   /* GL 的 y 轴朝上 */
    }, { passive: true });

    function onScroll() {
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollT = clamp(window.scrollY / max, 0, 1);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    var start = performance.now();
    var running = true;

    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) loop(performance.now());
    });

    function loop(now) {
      if (!running) return;
      resize();

      var t = (now - start) / 1000;

      mouseC  = lerp(mouseC,  mouseT,  0.040);
      mouseCY = lerp(mouseCY, mouseTY, 0.040);
      scrollC = lerp(scrollC, scrollT, 0.075);

      /* 滚动速度：平滑后的进度差，供将来做"动得越快云越糊"之类的效果 */
      vel = lerp(vel, (scrollC - scrollPrev) * 60, 0.2);
      scrollPrev = scrollC;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouseC, mouseCY);
      gl.uniform2f(uScroll, scrollC, vel);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  })();

  /* ==========================================================
     4. 滚动进度（右侧自绘滚动条）
     ========================================================== */

  (function scrollProgress() {
    var thumb = document.getElementById('cl-scrollbar-thumb');
    var track = document.querySelector('.cl-scrollbar .pf-scrollbar-track');
    var bar = document.getElementById('cl-scrollbar');
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
      thumb.style.transform = 'translate3d(0,' + smoothing.toFixed(2) + 'px,0)';
      if (bar) bar.classList.toggle('is-visible', window.scrollY > 40);
      requestAnimationFrame(tick);
    })();
  })();

  /* ==========================================================
     5. 逐行遮罩上推（split-line-up-effect）
     ----------------------------------------------------------
     与 profile.js 同一套做法（两页各一份，不共享文件 —— 便于各自调参）。

     原理：
       ① 按"视觉行"切开文字，每行包一层 overflow:hidden 的壳
       ② 壳里放 .pf-line-in，初始 translateY(105%) —— 藏在壳下面
       ③ 激活时推回 0，文字像从下一行升上来
       ④ 行间错开延迟，形成"逐行浮现"的节奏

     ⚠️ 中文自动折行必须靠**逐字测量 getBoundingClientRect().top** 才能切准，
        按字数切会在不同屏宽下错位。
     ========================================================== */

  (function splitLines() {
    var targets = Array.prototype.slice.call(root.querySelectorAll('.pf-split'));
    if (!targets.length) return;

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
          nodes.push(null);   /* 段间强制断行 */
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

      var lines = [], cur = [], lastTop = null;
      nodes.forEach(function (n) {
        if (!n) {
          if (cur.length) { lines.push(cur); cur = []; }
          lastTop = null;
          return;
        }
        var top = Math.round(n.getBoundingClientRect().top);
        if (lastTop === null || top === lastTop) cur.push(n);
        else { if (cur.length) lines.push(cur); cur = [n]; }
        lastTop = top;
      });
      if (cur.length) lines.push(cur);

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

    var allInners = [];
    targets.forEach(function (el) {
      splitEl(el).forEach(function (inner, i) {
        inner.style.setProperty('--li', i);
        allInners.push(inner);
      });
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
     6a. 入场观察器（非文字类元素）
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
     6b. 滚动叙事：每幕随滚动做视差 / 淡出
     ----------------------------------------------------------
     云海版比雨夜版**更慢更稳**（视差幅度 26 → 18），
     因为画面本身已经在动，文字再动得厉害会两边抢注意力。
     ========================================================== */

  (function scrollNarrative() {
    if (reduceMotion) return;
    var secs = Array.prototype.slice.call(root.querySelectorAll('.pf-sec'));
    if (!secs.length || !window.requestAnimationFrame) return;

    var meta = secs.map(function (sec) {
      var inner = sec.querySelector('.pf-sec-inner') || sec.querySelector('.pf-hero-inner');
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
        var p = (sy + vh - m.top) / (vh + m.height);
        p = clamp(p, 0, 1);
        cur[i] = lerp(cur[i], p, 0.12);

        var local = cur[i] - 0.5;
        var ty = local * -18;
        var fade = 1;
        if (i > 0) {
          var off = Math.abs(local);
          fade = 1 - clamp((off - 0.30) / 0.30, 0, 1) * 0.50;
        }
        m.inner.style.transform = 'translate3d(0,' + ty.toFixed(2) + 'px,0)';
        m.inner.style.opacity = fade.toFixed(3);
      });

      requestAnimationFrame(tick);
    })();
  })();

  /* ==========================================================
     7. 光标跟随
     ========================================================== */

  (function cursor() {
    var ring = document.getElementById('cl-cursor');
    var dot = document.getElementById('cl-cursor-dot');
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

    var hoverSel = 'a, button, input, .pf-about-card, .pf-feat-item';
    document.addEventListener('pointerover', function (e) {
      if (e.target.closest && e.target.closest(hoverSel)) ring.classList.add('is-hover');
    }, { passive: true });
    document.addEventListener('pointerout', function (e) {
      if (e.target.closest && e.target.closest(hoverSel)) ring.classList.remove('is-hover');
    }, { passive: true });
  })();

  /* ==========================================================
     8. 音乐控件（圆钮 + canvas 7 根跳动竖条，无音量滑块）
     ----------------------------------------------------------
     ⚠️ 占位方案：data-src 为空时不加载任何音频文件，
        但播放/暂停、竖条动画、aria 状态全部真实可用。
        换成真音频只需填 clouds.yml 的 music.src，本文件不用改。
     ========================================================== */

  (function music() {
    var box = document.getElementById('cl-music');
    if (!box) return;

    var btn    = document.getElementById('cl-music-btn');
    var cvs    = document.getElementById('cl-snd-canvas');
    var src    = box.getAttribute('data-src') || '';
    var type   = box.getAttribute('data-type') || 'audio/mpeg';
    var loopOn = box.getAttribute('data-loop') === '1';
    var isPlaceholder = !src;

    if (isPlaceholder) box.classList.add('is-placeholder');

    var audio = null;
    var playing = false;
    var pendingPlay = false;
    var wantVolume = clamp(parseFloat(box.getAttribute('data-volume')) || 0.32, 0, 1);

    if (!isPlaceholder) {
      audio = document.createElement('audio');
      audio.loop = loopOn;
      audio.volume = 0;
      audio.preload = 'none';
      var s = document.createElement('source');
      s.src = src;
      s.type = type;
      audio.appendChild(s);
      audio.style.display = 'none';
      box.appendChild(audio);

      audio.addEventListener('ended', function () { if (!loopOn) setPlaying(false); });
      audio.addEventListener('error', function () { setPlaying(false); });
    }

    var D = 20;
    var L = Math.min(window.devicePixelRatio || 1, 2);
    var ctx = null;
    if (cvs) {
      cvs.width  = D * L;
      cvs.height = D * L;
      ctx = cvs.getContext('2d');
    }

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
      /* 播放时用晨光的暖（深一点，白底上才看得见），暂停时压成灰蓝 */
      ctx.fillStyle = playing ? '#C77E3C' : 'rgba(110,128,152,.62)';
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
      if (isPlaceholder) { setPlaying(true); return; }
      var pr = audio.play();
      if (pr && pr.then) {
        pr.then(function () { setPlaying(true); fadeTo(wantVolume, 900); })
          .catch(function () { setPlaying(false); });
      } else {
        setPlaying(true); fadeTo(wantVolume, 900);
      }
    }

    function doPause() {
      if (isPlaceholder) { setPlaying(false); return; }
      fadeTo(0, 420);
      window.setTimeout(function () { audio.pause(); setPlaying(false); }, 430);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (playing) doPause(); else doPlay();
    });

    /* 入场后（已有用户手势）自动开播 */
    document.addEventListener('cl:enter', function () {
      if (isPlaceholder || !audio) return;
      doPlay();
    });

    document.addEventListener('visibilitychange', function () {
      if (playing) lastT = performance.now();
      if (!audio) return;
      if (document.hidden && playing) {
        audio.pause(); pendingPlay = true; playing = false; box.classList.add('is-playing');
      } else if (!document.hidden && pendingPlay) {
        pendingPlay = false; doPlay();
      }
    });
  })();

  /* ==========================================================
     9. 控制台彩蛋
     ========================================================== */

  (function easterEgg() {
    if (!window.console) return;
    var css = 'color:#C77E3C;font-family:Georgia,serif;font-size:13px;';
    try {
      console.log('%c云在脚下。', css);
      console.log('%c—— 尚谦 · ' + new Date().toLocaleDateString('zh-CN'), css);
    } catch (e) {}
  })();

})();
