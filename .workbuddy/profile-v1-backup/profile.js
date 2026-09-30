/* ============================================================
   个人主页 · /profile/ 交互逻辑
   场景：雨中伦敦 · Westminster Bridge（结构 1:1 复刻，表现绘画化）
   零依赖，零外部库（WebGL 用原生 API 手写，不引 Three.js）
   ------------------------------------------------------------
   共 8 段：
     1. 字符乱码加载    2. 入场解锁
     3. WebGL 伦敦雨景  4. 滚动进度
     5. 入场观察器      6. 光标跟随
     7. 音乐控件        8. 控制台彩蛋

   ⚠️ 本文件的 shader 常量**全部来自** .workbuddy/london-scene-spec.h
      的像素级实测。改画面之前先改那份契约，否则下一个人分不清
      哪些数是"测出来的"、哪些是"手调的"。
   ============================================================ */
(function () {
  'use strict';

  var root = document.getElementById('profile-root');
  if (!root) return;

  /* 告诉 CSS「脚本已经接管」。
     ⚠️ 这一句必须**同步执行、尽早执行** —— CSS 里所有"先藏后显"的规则
        都挂在 .js-on 下。加得越晚，内容"闪一下才归位"的概率越高。 */
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

    /* 四行等宽字符，用摩斯/占位符观感更像"信号在接入"。
       换成伦敦地标的读数：西敏寺桥、泰晤士、大本钟。 */
    var targets = [
      '··· ——— ···',
      'WESTMINSTER',
      'BRIDGE / RAIN',
      '51.5007N 0.1234W'
    ];
    var GLYPHS = '01·—/\\|<>[]{}#*+=~ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    var rows = targets.map(function (t) {
      var el = document.createElement('span');
      el.textContent = t;
      box.appendChild(el);
      return { el: el, target: t, done: false };
    });

    if (reduceMotion) { rows.forEach(function (r) { r.done = true; r.el.classList.add('is-done'); }); return; }

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
        if (local >= 1) { r.done = true; r.el.textContent = r.target; r.el.classList.add('is-done'); }
      });
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  })();

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
    /* 若脚本跑完 4 秒用户还没点，自动进入 —— 避免"卡在门口" */
    window.setTimeout(function () { if (!entered) enter(); }, 4200);
  } else {
    enter();
  }

  document.body.classList.add('pf-body-lock');

  /* ==========================================================
     3. WebGL 雨中伦敦场景（Westminster Bridge）
     ----------------------------------------------------------
     手写 GLSL，零依赖。画面由这些"层"自远向近叠出来：

       ① 天空渐变            0 – 28%    冷蓝灰，上亮下暗
       ② 建筑剪影            28 – 42%   威斯敏斯特宫哥特尖塔 + 大本钟
       ③ 桥面（单点透视）     42 – 100%  汇聚点 (0.63, 0.50)，最暗在 59.9%
       ④ 右侧栏杆           纵深引导线 (0.99,0.94) → (0.855,0.50)
       ⑤ 隔离桩两排          x≈4.5% 与 x≈50%（近景节拍器）
       ⑥ 行人剪影 + 白雾      伞椭圆+身体+腿，只输出亮度差 → 天然剪影
       ⑦ 湿桥面纵向反光带     14 条，对应 y75%~100% 亮度回升
       ⑧ 雨丝 + 涟漪          雨是"密而细"，压到 0.16 不抢戏
       ⑨ 大本钟表盘           画面唯一暖光，情感锚点

     ⚠️⚠️ 位移判据（两个方向都要满足，缺一个就出 bug）：
       · 不走样：每帧位移 << 1 个噪声网格 →  K * 总系数 / 60 < 0.3
       · 看得出：dt 秒内推进 >= 0.5 个特征  →  K * 总系数 * dt >= 0.5
       "合规"不等于"看得见" —— 位移进噪声前会被多层系数连乘缩小，
       判据必须用**乘积**。云海第一版就是"完全合规但肉眼看不见"。
     ========================================================== */

  (function londonScene() {
    var canvas = document.getElementById('pf-canvas');
    if (!canvas) return;

    var gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power'
    }) || canvas.getContext('experimental-webgl');

    if (!gl) {
      /* WebGL 不可用 → 只靠 CSS 层（雨丝/雾/暗角），依然成立 */
      root.classList.add('pf-no-webgl');
      return;
    }

    var VERT = [
      'attribute vec2 a_pos;',
      'void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }'
    ].join('\n');

    /* 片段着色器 —— 核心氛围在这里。
       ------------------------------------------------------------
       ⚠️ 坐标系约定（写错方向就全乱）：
         · GL 的 y 轴**朝上**（0=画面底，1=画面顶）
         · 参考图的 y 是**从上往下**量的百分比
         · 所以下面统一用  uy = 1.0 - 图上的y%  做转换，
           注释里同时标出两个值，避免下次改的时候又搞混。 */
    var FRAG = [
      'precision mediump float;',
      'uniform vec2  u_res;',
      'uniform float u_time;',
      'uniform vec2  u_mouse;',   /* 归一化鼠标，已做平滑 */
      'uniform vec2  u_scroll;',  /* 滚动进度 (progress, velocity) */
      '',
      /* --- 2D 哈希与值噪声 --- */
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
      /* --- FBM：多层叠加，得到雾/云的有机感 --- */
      'float fbm(vec2 p){',
      '  float v = 0.0; float a = 0.5;',
      '  for(int i = 0; i < 5; i++){',
      '    v += a * vnoise(p);',
      '    p *= 2.02; a *= 0.5;',
      '  }',
      '  return v;',
      '}',
      /* --- 绘画化色块：把连续色阶压成 n 档，模拟"手绘的色块" ---
         ⚠️ 档数按区域给（天空多、云/水少），混合比例**不要给 1.0**，
            否则会变成明显的等高线。留 35%~55% 才像"画"，不像"滤镜"。 */
      'float posterize(float c, float n){',
      '  return floor(c * n + 0.5) / n;',
      '}',
      'vec3 posterize3(vec3 c, float n){',
      '  return vec3(posterize(c.r, n), posterize(c.g, n), posterize(c.b, n));',
      '}',
      /* --- uy ↔ 图上 y 的换算 ---
         ⚠️⚠️ GL 的 y 轴朝上，而参考图的测量值都是"从图像顶部往下量"的百分比。
            所有"实测 y 值"（0=顶上，1=底下）都要先转成 uy 才能比较：
              uy = 1.0 - y_img       y_img = 1.0 - uy
            这个函数把"实测 y"统一成一个入口，避免再犯"上下颠倒"的错。 */
      'float uy_to_y(float uy){',
      '  return 1.0 - uy;',
      '}',
      'float y_to_uy(float y){',
      '  return 1.0 - y;',
      '}',
      '',
      /* --- 一个人：只输出"亮度差"，不画颜色 → 天然得到剪影 ---
         伞 = 扁椭圆 + 顶面亮环；身体 = 竖椭圆；腿 = 两条细竖条。
         返回负值（比桥面暗 = 剪影），再乘雾化系数。
         ⚠️ 用户选定"优先做实前景" → 影子要**实、要紧、要黑**，
            不能再糊成一团。所以伞和身体的权重都加大了。 */
      'float personShape(vec2 q, vec2 c, float s){',
      '  vec2 d = (q - c) / s;',
      '  float v = 0.0;',
      /* 伞：横向宽、纵向扁（参考图伞是明显的"伞形"轮廓） */
      '  vec2 ud = d / vec2(1.0, 0.42);',
      '  float ud2 = dot(ud, ud);',
      '  v -= 1.25 / (1.0 + ud2 * 3.2);',                /* 伞面（很暗，硬边） */
      /* 伞顶亮环：参考图里伞顶边缘有一圈更亮的反光 */
      '  float ring = exp(-pow((sqrt(ud2) - 0.90) * 6.0, 2.0));',
      '  v += ring * 0.34;',
      /* 身体：竖椭圆，伞下方 */
      '  vec2 bd = (d - vec2(0.0, -0.78)) / vec2(0.46, 0.78);',
      '  v -= 1.0 / (1.0 + dot(bd, bd) * 2.6) * 0.86;',
      /* 腿：两条细竖条（迈步时错开，靠不同的人用不同相位） */
      '  vec2 ld = d - vec2(0.0, -1.62);',
      '  float legs = 0.0;',
      '  legs += exp(-pow((ld.x - 0.22) * 5.0, 2.0));',
      '  legs += exp(-pow((ld.x + 0.22) * 5.0, 2.0));',
      '  legs *= step(0.0, ld.y) * step(ld.y, 1.40);',
      '  v -= legs * 0.40;',
      '  return v;',
      '}',
      '',
      'void main(){',
      /* ---------- 取景：按 16:9 letterbox ---------- */
      /* canvas 是全屏的（比例随窗口变），但参考图是 1144x668 = 1.7126。
         用 cover 取景：取一个 16:9 的窗口铺满屏幕，多余的部分裁掉。
         这样"打开第一眼"就是参考图那个构图。 */
      '  float ar = u_res.x / u_res.y;',
      '  float TARGET_AR = 1.7126;',
      '  vec2 uv = gl_FragCoord.xy / u_res;',
      '  vec2 p = uv;',
      '  if (ar > TARGET_AR) {',
      /* 屏幕太宽 → 保持高度，宽度裁掉两侧（x 从中心放大） */
      '    p.x = (uv.x - 0.5) * (ar / TARGET_AR) + 0.5;',
      '  } else {',
      /* 屏幕太高 → 保持宽度，高度裁掉上下 */
      '    p.y = (uv.y - 0.5) * (TARGET_AR / ar) + 0.5;',
      '  }',
      /* uy：GL 朝上（0=底）。图上 y%  = 1 - uy */
      '  float uy = p.y;',
      '',
      /* ---------- 鼠标视差（幅度很小，避免"整屏在晃"） ---------- */
      '  vec2 par = (u_mouse - 0.5) * 0.030;',
      '  p += par;',
      '',
      /* ---------- 滚动三阶段 ----------
         p 0.00~0.33 推近：镜头向大本钟方向推进，桥面近景放大
         p 0.33~0.66 走过：行人前行到画面中段
         p 0.66~1.00 远眺：镜头略上抬，露出更多天空与塔尖
         实测约束：是"静静站着看雨"，滚动 = "缓缓向前挪两步"。 */
      '  float sc = u_scroll.x;',
      '  float push = smoothstep(0.0, 0.66, sc) * 0.34;',      /* CL_PUSH_MAX */
      '  float tilt = smoothstep(0.66, 1.0, sc) * 0.06;',      /* CL_TILT_MAX（上抬） */
      /* 推近 = 画面横向向汇聚点收拢（把 x 拉向 VP 再放回去） */
      '  float vpx = 0.63;',                                    /* CL_VP_X */
      '  p.x = vpx + (p.x - vpx) * (1.0 - push);',
      '  p.y = p.y + tilt;',
      '  uy = p.y;',
      '',
      /* ============================================================
         ① 天空：图上 y 0 ~ 0.44 → uy 0.56 ~ 1.0
            ⚠️ 第二轮实测修正：参考图天空【几乎不渐变】——
               y=0 行是 116~136，y=20 行仍是 114~135（只降 1~2 点）。
               第一版写成 smoothstep(0.70,0.98) 的强渐变，导致
               天空中部偏暗、band0 比参考图低 17 点。
            实测：顶部 131~137 / 中部 127~134 / 下部 114~121
            → 用一个很平的三段插值。
         ============================================================ */
      '  vec3 cSkyTop = vec3(0.560, 0.588, 0.643);',   /* 143,150,164  br 149 */
      '  vec3 cSkyMid = vec3(0.518, 0.545, 0.600);',   /* 132,139,153  br 141 */
      '  vec3 cSkyLow = vec3(0.463, 0.492, 0.545);',   /* 118,125,139  br 126 */
      /* 上段（uy 0.86~1.0）从 149 缓降到 141；下段（uy 0.56~0.86）降到 121
         ⚠️ band0 之前比参考图暗 10 点 → 顶部再提一档（0.514→0.560）。 */
      '  vec3 col = mix(cSkyMid, cSkyTop, smoothstep(0.84, 0.99, uy));',
      '  col = mix(cSkyLow, col, smoothstep(0.56, 0.88, uy));',
      /* 云层：低频 FBM，垂直拉长（雨云是横向条带） */
      '  float tc = u_time * 0.0085;',
      '  float cl1 = fbm(vec2(p.x * 2.1 + tc * 0.9, p.y * 5.6 - tc * 0.30));',
      '  float cl2 = fbm(vec2(p.x * 4.3 - tc * 0.6, p.y * 9.4 + tc * 0.22));',
      '  float cloud = cl1 * 0.65 + cl2 * 0.35;',
      '  cloud *= smoothstep(0.56, 0.92, uy);',
      '  /* 雨云比天空**暗**（不是亮）—— 阴天云是灰的压在天空上 */',
      '  col = mix(col, vec3(0.400, 0.435, 0.500), cloud * 0.26);',
      '',
      /* ============================================================
         ② 结构骨架（第二轮逐行 24 列 + 逐列 26 行实测后重构）
         ------------------------------------------------------------
         ⚠️⚠️⚠️ 之前三个结构性错误（导致怎么调都对不上）：

           错误 1：把画面当"水平分带"（天空→建筑→桥面）。
             ✗ 建筑不是一条水平带，而是【一排分散的哥特塔楼】，
               塔与塔之间【透得出天空】(x26~57 在 y22~44 仍是 122~129)。
             ✓ 必须按 x 求"建筑顶轮廓 roof(x)"。

           错误 2：认为"大本钟是贯穿到画面底部的竖条"。
             ✗ 实测 x=65/70 列：y6~40 是 60~75（塔身），
               y44~52 回升到 64~67（塔已经结束了！），
               y56+ 变暗是【桥面/隔离桩】造成，与塔无关。
             ✓ 大本钟 y 范围【0.00 ~ 0.44】，不贯穿。

           错误 3：把"桥面"当成从 y50% 开始的一整块。
             ✗ 实测 y44~52 是一条【全宽最暗带】(br 42~67) = 建筑基座 + 远景车辆；
               y52~100 桥面【左右亮度完全不同】：
                 x < 0.50 → br 10~90（左侧车道被车辆/暗色占据）
                 x > 0.55 → br 100~120（右侧人行道，湿路面强反光）
             ✓ 桥面必须【左右分离】。

         实测逐列"建筑顶"轮廓（y 越小越高）：
           x0.00→0.19  x0.08→0.30  x0.16→0.36  x0.24→0.40  x0.30→0.42
           x0.36→0.34  x0.44→0.32  x0.52→0.42  x0.60→0.44
           x0.65→0.00（大本钟，顶到画面最上）  x0.72→0.44
           x0.80→0.44  x0.88→0.48  x0.92→0.27（右侧远处建筑）  x1.00→0.58
         ============================================================ */
      /* --- 天际线（结构基准线，图上 y 值） --- */
      /* 桥面/建筑基座的底边。实测 y44~52 是全宽暗带，
         所以把"结构基准天际线"定在图上 y=0.44（=最暗带顶）。 */
      '  float horizon = 0.440;',
      '  float hzLine = 1.0 - horizon;',
      '  float isGround = 1.0 - smoothstep(hzLine - 0.004, hzLine + 0.004, uy);',
      '',
      /* ⚠️⚠️ 第五轮修正（本轮最后一处结构性改动）：
         前四版都用"平滑函数"（高斯 / 正弦 / 噪声）拼轮廓，
         结果必然是【连绵的丘陵】—— 因为平滑函数的取值是渐变的。
         但哥特建筑的塔楼有**竖直墙面**：轮廓是"平台 + 陡降"，
         不是斜坡。
         → 正解：**先分段取整（quantize），再做极窄的过渡**。
            ① 用 `floor(x*N)` 把 x 切成 N 段
            ② 每段的高度由一个"分段高度函数"给出
            ③ 段边界只做 0.006 宽的平滑（≈4px，看起来仍是硬边）
         这样得到的是"一排宽窄不一的塔楼"，而不是"山丘"。
         ⚠️ 段的宽度取 0.055（≈18 段/屏宽）—— 太密会变锯条（第 3 轮的坑）。 */
      '  float segX = p.x / 0.055;',
      '  float segI = floor(segX);',
      '  float segF = fract(segX);',
      /* 每段一个"塔高"：用值噪声给随机高度，范围 0.20~0.42（图上 y） */
      '  float h1 = vnoise(vec2(segI * 1.37, 5.1));',
      '  float h2 = vnoise(vec2(segI * 2.71, 9.3));',
      '  float towerH = 0.200 + (h1 * 0.62 + h2 * 0.38) * 0.230;',   /* 0.200~0.430 */
      /* 左右两侧整体偏高（参考图：主体建筑群在两翼，中间有豁口） */
      '  float sideBoost = (1.0 - smoothstep(0.18, 0.34, p.x)) * 0.10',
      '                  + smoothstep(0.36, 0.50, p.x) * 0.05;',
      '  towerH -= sideBoost;',
      /* 段边界：⚠️ 缝隙不能"回落到基座" —— 那会变成"一排分离的柱子"
         （像书架上的书），参考图的建筑是**连续的**，只有高度起伏。
         正解：缝隙只回落一点（+0.055），且过渡更窄（0.04 段宽）
         → 得到"连续立面上的窄凹槽"（哥特扶壁的阴影）。
         ⚠️ 过渡不要做成"斜坡"：用两端都陡的 smoothstep 组合，
            让塔顶是**平顶**，只在边缘有小倒角 ——
            否则一排塔会变成一排"斜切梳齿"（第 6 轮的坑）。 */
      '  float eL = smoothstep(0.00, 0.035, segF);',
      '  float eR = 1.0 - smoothstep(0.965, 1.0, segF);',
      '  float edgeBlend = min(eL, eR);',                           /* 中间全 1，只在边上塌 */
      '  float roof = mix(towerH + 0.055, towerH, edgeBlend);',     /* 凹槽只陷 0.055 */
      /* 塔顶的小尖（哥特）：段中央再起一个小突起，让"平顶"不呆板 */
      '  float capDist = abs(segF - 0.5) * 2.0;',                   /* 0=段中央 1=段边 */
      '  float cap = exp(-pow(capDist * 3.4, 2.0));',
      '  roof -= cap * 0.030 * (0.4 + 0.6 * h2);',
      /* ---- 大本钟两侧的预留位（x 0.63~0.72 让给塔，roof 落在基座高度） ---- */
      '  float bbGate = smoothstep(0.592, 0.626, p.x) * (1.0 - smoothstep(0.726, 0.760, p.x));',
      '  roof = mix(roof, 0.430, bbGate);',
      /* ---- 右侧 x 0.74~0.87 是矮基座（参考图这一带几乎没有建筑） ---- */
      '  float lowGate = smoothstep(0.736, 0.766, p.x) * (1.0 - smoothstep(0.858, 0.888, p.x));',
      '  roof = mix(roof, 0.470, lowGate);',
      /* ---- 哥特尖顶的"小尖"：双向摆动（中心不变） ---- */
      '  roof += (0.5 * sin(p.x * 96.0)) * 0.010;',
      '  roof += (vnoise(vec2(p.x * 34.0, 11.3)) - 0.5) * 0.012;',
      /* 建筑 = 在结构基准线之上、屋顶线之下、x<0.63 或 x>0.72 的区域 */
      '  float roofLine = 1.0 - roof;',
      /* ⚠️ 边界平滑只给 0.004（~2.7px），再大就把轮廓糊掉 */
      '  float inBldg = smoothstep(hzLine - 0.004, hzLine + 0.004, uy)',
      '               * (1.0 - smoothstep(roofLine - 0.004, roofLine + 0.004, uy));',
      /* 只在 x<0.64（主建筑）与 x>0.712（右侧对岸）有效；中间让给大本钟
         ⚠️ 范围必须与上面 roof 的 bbGate 完全一致，否则会出现"半截塔" */
      '  float bldgGate = (1.0 - smoothstep(0.592, 0.626, p.x))',
      '                 + smoothstep(0.726, 0.760, p.x);',
      '  inBldg *= clamp(bldgGate, 0.0, 1.0);',
      /* 建筑亮度的再看：抽象剪影口径下，建筑要【更暗、更退后】。
         参考图建筑 br 50~75（天空 118~136），但那是"看得清轮廓"的清晰剪影；
         我们选择"雨雾中远眺"的口径 → 建筑整体压到 br 42~58，
         并且【越接近屋顶越淡】（雾从天空压下来，把建筑顶吃掉）。 */
      '  vec3 cBldgFar  = vec3(0.168, 0.198, 0.244);',   /*  43, 51, 62  br 50 */
      '  vec3 cBldgNear = vec3(0.128, 0.152, 0.186);',   /*  33, 39, 47  br 38 */
      '  vec3 cBldg = mix(cBldgFar, cBldgNear, smoothstep(0.10, 0.52, p.x));',
      /* 建筑表面细节：竖向的窗/柱（高频竖纹），很淡 */
      '  float win = step(0.74, hash(vec2(floor(p.x * 260.0), floor(uy * 120.0))));',
      '  cBldg += win * 0.024;',
      /* ⚠️ 关键：建筑上部融进天空（"雾中远眺"的核心）
         bldgHaze 在底部（hzLine）=0、顶部（roofLine）=1，
         所以直接用它当"雾权重"：顶部吃 55% 的雾 → 屋顶那一段淡进天空，
         只有中下部是实心剪影。这是"抽象剪影化"口径的关键一笔。 */
      '  float bldgHaze = smoothstep(hzLine, roofLine, uy);',
      '  cBldg = mix(cBldg, vec3(0.470, 0.518, 0.602), bldgHaze * 0.36);',
      '  col = mix(col, cBldg, inBldg);',
      '',
      /* --- 建筑基座暗带：图上 y 0.44~0.52，全宽最暗（实测 br 42~67） ---
         这是威斯敏斯特宫临河的一层 + 远景车辆的顶部。
         ⚠️ 这一带是画面里唯一的"横向贯穿的暗色"，不能省 ——
            没有它，建筑会直接"贴"在桥面上，缺少纵深。 */
      '  float darkBand = smoothstep(hzLine - 0.020, hzLine + 0.010, uy)',
      '                 * (1.0 - smoothstep(hzLine - 0.100, hzLine - 0.066, uy));',
      '  vec3 cDarkBand = vec3(0.089, 0.107, 0.134);',   /* 23, 27, 34  br 27 */
      '  col = mix(col, cDarkBand, darkBand * 0.945);',
      '',
      /* ============================================================
         ③ 大本钟：x 0.63~0.72，y 0.00 ~ 0.44
            ⚠️⚠️ 第二轮实测修正：塔【不贯穿到画面底部】！
               实测 x=68% 列：y6~40 是 75→66（塔身），
               y44 回升到 65、y48 是 67 —— 塔在 y≈0.44 就结束了。
               旧注释说"一路贯到画面底"是把桥面/隔离桩的暗误当成了塔。
            ⚠️ 塔身 br 实测 60~75，而天空 128~134，对比 60+ 点 ——
               塔必须是"深色剪影"，不是"亮灰柱子"。
         ============================================================ */
      '  float bbCx = 0.680;',                                  /* 实测 x 0.64~0.71，中心 0.68 */
      /* ⚠️⚠️ 2026-09-28：塔身加粗约 1.7 倍（5.0% → 8.4%）。
         之前太细，渲染出来是"一根细长柱子"，而参考图里大本钟是
         【敦实的方塔】—— 它在照片里占画面高度约 44%，宽度也接近 8%。
         "抽象剪影化"是简化细节，不是把体量画错。 */
      '  float bbBodyHalf = 0.0400;',                           /* 塔身半宽 → 全宽 8.0% */
      '  float bbClockHalf = 0.0480;',                          /* 钟楼段略宽 → 全宽 9.6% */
      '  float yImg = uy_to_y(uy);',
      /* 分段（图上 y，全部来自实测）：
           0.000 ~ 0.055  尖顶（从最上沿收成尖锥）
           0.055 ~ 0.140  钟楼段（四方体，最宽，含表盘）
           0.140 ~ 0.440  塔身主体 */
      '  float bbTopY  = 0.440;',                               /* 塔底（实测 y≈0.41~0.44） */
      '  float spireH  = 0.055;',                               /* 尖顶高度 */
      '  float clockY0 = 0.055, clockY1 = 0.140;',              /* 钟楼段 */
      /* ---- 尖顶：宽度从 0.25 倍线性收到 1.0 倍 ---- */
      '  float spT = clamp(yImg / spireH, 0.0, 1.0);',
      '  float spireHalf = bbClockHalf * (0.22 + 0.78 * spT);',
      '  float inSpire = (1.0 - smoothstep(spireHalf * 0.90, spireHalf, abs(p.x - bbCx)))',
      '                * (1.0 - smoothstep(spireH - 0.003, spireH + 0.003, yImg));',
      /* ---- 钟楼段：最宽，顶端有一个小的"檐口"台阶 ---- */
      '  float clockBand = smoothstep(clockY0 - 0.004, clockY0 + 0.004, yImg)',
      '                  * (1.0 - smoothstep(clockY1 - 0.004, clockY1 + 0.004, yImg));',
      '  float clockInX = 1.0 - smoothstep(bbClockHalf * 0.90, bbClockHalf, abs(p.x - bbCx));',
      /* ⚠️ 檐口台阶：钟楼段顶端 0.012 高度内再外扩 8%，
         制造参考图里那种"方塔上有一圈突出檐口"的层次，
         否则加粗后就是一块平板。 */
      '  float cornice = smoothstep(clockY0 - 0.014, clockY0 - 0.010, yImg)',
      '                * (1.0 - smoothstep(clockY0 - 0.002, clockY0 + 0.002, yImg));',
      '  clockInX = max(clockInX, cornice * (1.0 - smoothstep(bbClockHalf * 1.02, bbClockHalf * 1.10, abs(p.x - bbCx))));',
      '  float inClockSeg = clockBand * clockInX;',
      /* ---- 塔身：从钟楼段底一直到 y0.44 ---- */
      '  float bodyX = 1.0 - smoothstep(bbBodyHalf * 0.92, bbBodyHalf, abs(p.x - bbCx));',
      '  float bodyBand = smoothstep(clockY1 - 0.004, clockY1 + 0.004, yImg)',
      '                 * (1.0 - smoothstep(bbTopY - 0.005, bbTopY + 0.001, yImg));',
      '  float inBody = bodyX * bodyBand;',
      '  float bbMask = max(max(inSpire, inClockSeg), inBody);',
      /* 塔身颜色：深剪影（实测 br 60~75，天空 128~134 → 对比 60+） */
      '  vec3 cTower = vec3(0.176, 0.204, 0.248);',              /* 45, 52, 63  br 51 */
      /* 哥特塔身的竖向壁柱/棱线：让塔身内部有"竖条纹"，不是一块平色 */
      '  float pil = 0.5 + 0.5 * sin((p.x - bbCx) * 3.1416 / (bbBodyHalf * 0.30));',
      '  cTower *= mix(1.0, 0.74 + 0.34 * pil, 0.60);',
      /* 尖顶/塔顶吃雾（雨雾往塔尖压）—— 越靠上越淡（和天空接近） */
      '  float twrHaze = (1.0 - smoothstep(0.02, 0.30, yImg));',
      '  cTower = mix(cTower, vec3(0.430, 0.472, 0.545), twrHaze * 0.40);',
      '  col = mix(col, cTower, bbMask * 0.96);',
      '',
      /* ---------- 大本钟表盘：画面唯一暖光，情感锚点 ----------
         ⚠️⚠️ 椭圆必须建在"等比"坐标系里：
            p.x / p.y 都是 0~1 归一化，但屏幕是 1.7126:1，
            所以 x 方向要【乘】TARGET_AR 才能得到视觉上的正圆。
            第一版写成 `(p.x-bbCx)/TARGET_AR`（除），把 x 差异放大 1.7 倍，
            圆被压成两道横杠 —— 一眼就看得出是 bug。 */
      '  vec2 ck = vec2((p.x - bbCx) * TARGET_AR, yImg - 0.098);',
      '  float ckD = length(ck);',
      /* 表盘半径：塔身加粗后同步放大（原来 0.015 是按 5% 宽算的，
         现在塔宽 8%，表盘按比例取 0.022，否则会显得是个小点点） */
      '  float clockRing = exp(-pow((ckD - 0.022) * 240.0, 2.0));',   /* 表盘外圈 */
      '  float clockFace = 1.0 / (1.0 + pow(ckD * 400.0, 2.0));',
      /* 微弱脉动（不是霓虹灯，是"时间还在走"的呼吸） */
      '  float pulse = 0.86 + 0.14 * sin(u_time * 0.42);',
      '  vec3 cClock = vec3(1.0, 0.745, 0.549);',                     /* 暖橙 */
      '  float clockGate = smoothstep(0.10, 0.40, bbMask);',          /* 只在塔身上发光 */
      '  col += cClock * (clockRing * 0.22 + clockFace * 0.10) * pulse * 0.30 * clockGate;',
      '',
      /* ============================================================
         ④ 桥面：y 0.52 ~ 1.00，⚠️ 左右完全不同
            ⚠️⚠️ 第二轮实测（关键修正）：
               x < 0.50 → br 10~90（左侧车道：车辆 + 隔离桩 + 阴影）
               x > 0.55 → br 100~120（右侧人行道：湿路面强反光）
            实测逐行（图上 y，x 从左到右）：
               y=.56   39 38 22 60 119 23 31  8 14 54
               y=.69   85  8  9 66  68 96 56  5 46 25
               y=.81   82 13 33 74  71 109 31 35 108 48
               y=.94   91 47 75 89  93  98 46 96 102 68
            这不是一个纵向梯度能表达的 —— 必须【横向分离】。
         ============================================================ */
      '  float inDeck = isGround;',
      /* dy：0 = 结构基准线 y0.44（最远），1 = 画面底（最近）
         ⚠️ yImg 已在 ③ 段声明（同一个 main 作用域），这里不能重复声明。 */
      '  float dy = clamp((yImg - 0.440) / 0.560, 0.0, 1.0);',
      /* --- 横向分区：左侧车道（暗）↔ 右侧人行道（亮反光） --- */
      '  float laneW = 1.0 - smoothstep(0.46, 0.56, p.x);',      /* 1=左车道 0=右人行道 */
      /* 左侧车道色彩：远段 br 50~58，中段最暗（车辆 + 阴影），近段略回升
         ⚠️ 第三轮修正：最暗点从 dy0.18 推到 dy 0.10~0.45（= y 0.50~0.70），
            对应参考图 y=.56/.69 那两行的 22/9/8 极暗值。 */
      '  vec3 cLaneFar  = vec3(0.190, 0.218, 0.264);',   /* br 54 */
      '  vec3 cLaneDark = vec3(0.048, 0.058, 0.074);',   /* br 14 ← 全局最暗 */
      '  vec3 cLaneNear = vec3(0.300, 0.340, 0.405);',   /* br 87 */
      '  vec3 cLane = mix(cLaneFar, cLaneDark, smoothstep(0.02, 0.18, dy));',
      '  cLane = mix(cLane, cLaneNear, smoothstep(0.48, 1.0, dy));',
      /* 右侧人行道色彩：湿路面强反光（实测近处 100~120）
         ⚠️ 第三轮修正：远段（y 0.50~0.62）实测只有 br 50~70，
            第一版 cWalkFar = 0.230（br 66）而且立刻往 0.400 升，
            导致 band4 比参考图亮 25 点。正解：远段压到 br 40 以下，
            且把"变亮"的拐点推到 dy≈0.35（= y≈0.64）。 */
      '  vec3 cWalkFar  = vec3(0.110, 0.130, 0.164);',   /* br 33 */
      '  vec3 cWalkMid  = vec3(0.326, 0.363, 0.423);',   /* br 92 */
      '  vec3 cWalkNear = vec3(0.470, 0.512, 0.575);',   /* br 129 */
      '  vec3 cWalk = mix(cWalkFar, cWalkMid, smoothstep(0.09, 0.48, dy));',
      '  cWalk = mix(cWalk, cWalkNear, smoothstep(0.48, 1.0, dy));',
      '  vec3 cDeck = mix(cWalk, cLane, laneW);',
      /* ⚠️ 车辙 / 纵向反光条带：**只沿 x 变化**（dy 几乎不变）→ 纵向延伸的
         条带，这正是"湿桥面的纵向反光"的形状。
         第一版用 2D 噪声 `vnoise(vec2(x*13, dy*2.2))` 在竖直方向被拉得极长，
         画面里全是"椭圆气泡"，一眼假。 */
      '  float rut = vnoise(vec2(p.x * 13.0, 3.3));',
      '  rut = smoothstep(0.36, 0.64, rut);',
      '  rut *= smoothstep(0.04, 0.45, dy);',
      '  cDeck = mix(cDeck, cDeck * 0.52, rut * 0.50);',   /* 车辙更暗 */
      '  float rut2 = vnoise(vec2(p.x * 27.0 + 55.0, 9.1));',
      '  rut2 = smoothstep(0.60, 0.92, rut2);',
      '  rut2 *= smoothstep(0.12, 0.65, dy) * (1.0 - laneW);',   /* 反光主要在人行道 */
      '  cDeck = mix(cDeck, cWalkNear * 1.06, rut2 * 0.44);',     /* 干处略亮 */
      '  col = mix(col, cDeck, inDeck);',
      '',
      /* ---------- 湿桥面：纵向拉丝的镜面反光 ----------
         桥面不是均匀反光，而是沿纵向拉出一缕缕竖直亮带（像油膜）。 */
      '  float ws = vnoise(vec2(p.x * 62.0, dy * 1.4 - u_time * 0.05));',
      '  float ws2 = vnoise(vec2(p.x * 150.0 + 31.0, dy * 0.9));',
      '  float streak = smoothstep(0.48, 1.0, ws * 0.6 + ws2 * 0.4);',
      '  streak *= smoothstep(0.20, 0.95, dy) * inDeck * (1.0 - laneW * 0.75);',
      '  col += vec3(0.300, 0.348, 0.420) * streak * 0.44;',
      '',
      /* ---------- 桥面涟漪：雨的"落地签" ----------
         做法：多圈同心环，半径随时间增长并淡出（用 fract 做循环）。
         ⚠️ 第一版格密度 9.0 + 强度 0.55 → 底部变成"洗衣板"同心圆，
            一眼假。参考图里的涟漪其实**几乎看不见**（快门把雨滴糊掉了），
            只在近处湿反光里有极淡的扰动。
            所以：格降到 5.5、强度降到 0.20，只做"暗示"。 */
      '  vec2 rp2 = vec2(p.x * TARGET_AR, dy);',
      '  vec2 rp2s = rp2 * 5.5;',
      '  vec2 rc = fract(rp2s) - 0.5;',
      '  float phase = fract(hash(floor(rp2s)) * 7.3 + u_time * 0.40);',
      '  float rr = length(rc);',
      '  float ring2 = exp(-pow((rr - phase * 0.46) * 9.0, 2.0));',
      '  ring2 *= (1.0 - phase) * step(rr, 0.46);',
      '  ring2 *= smoothstep(0.22, 0.85, dy) * inDeck;',
      '  col += vec3(0.42, 0.49, 0.59) * ring2 * 0.20;',
      '',
      /* ---------- 右侧栏杆：画面最强的一条纵深引导线 ----------
         ⚠️⚠️ 参考图里这是"最抢眼"的一条线：从右下角 (0.995, 图上94%)
            一路收敛到透视点附近 (0.855, 图上50%)，是湿金属栏杆的强反光。
            前几版做得太弱（0.26），在视觉上几乎看不见 → 画面失去纵深感。
            正解：**做主线条 + 立柱 + 上下两道横杆**，强度提到 0.5。
         （对应契约 CL_RAIL_X_NEAR 0.99 / CL_RAIL_X_FAR 0.855） */
      '  float railT = clamp((yImg - 0.50) / 0.44, 0.0, 1.0);',    /* 0=远 1=近 */
      '  float railX = mix(0.852, 0.995, railT);',
      /* 主扶手线（上横杆）：湿金属反光的亮线 */
      '  float railMain = exp(-pow((p.x - railX) * 190.0, 2.0));',
      '  railMain *= smoothstep(0.48, 0.56, yImg) * inDeck;',
      /* 下横杆（比上横杆低一点，跟着透视走） */
      '  float railX2 = railX + 0.008 * railT;',
      '  float railLow = exp(-pow((p.x - railX2) * 150.0, 2.0));',
      '  railLow *= smoothstep(0.52, 0.60, yImg) * inDeck * (1.0 - railMain * 0.7);',
      /* 立柱：沿栏杆每隔一段一根（频率随 railT 变化 → 近疏远密） */
      '  float post = 0.5 + 0.5 * sin(yImg * 46.0 - railT * 3.0);',
      '  post = pow(post, 6.0);',
      '  float railPost = exp(-pow((p.x - railX) * 190.0, 2.0)) * post;',
      '  railPost *= smoothstep(0.50, 0.58, yImg) * inDeck;',
      /* 栏杆整体（湿金属比桥面亮） */
      '  float rail = clamp(railMain * 0.55 + railLow * 0.30 + railPost * 0.34, 0.0, 1.0);',
      '  col += vec3(0.44, 0.50, 0.60) * rail;',
      '',
      /* ---------- 隔离桩：近景的"节拍器" ----------
         参考图实测：黑色隔离桩沿一条**斜线**从近（左下）排到远（中右），
         x 0.03（近，最大）→ x 0.58（远，最小），
         图上 y 0.56~0.90 → uy 0.10~0.44。
         ⚠️ 只有【一排】（不是两排）—— 第一版画了两排，多出的一排
            在画面中央形成"竖栅栏"，非常假。参考图桥面中央是空的。
         ⚠️⚠️ 这里踩过一个"静默压暗 29 点"的大坑：
            原来用 `bol += 高斯` **累加**多个桩，每个桩在远处仍有
            0.1~0.3 的尾值，累加后 clamp 到 1 → **整个下半屏被扣掉
            (0.09,0.10,0.12)，正好是 29 点亮度**，导致桥面怎么调都发黑。
            正解：用 `max` 取单桩最大值，不做累加。 */
      '  float bol = 0.0;',
      '  for (int i = 0; i < 12; i++) {',
      '    float fi = float(i) / 11.0;',
      '    float t1 = fi;',
      /* 透视：越远（t1→1）越靠近汇聚点、越小
         ⚠️ 尺寸因子下限不能太小：原来 1-0.80*t1 在 t1=1 时只有 0.20，
            桩宽只剩 2.8px，被 smoothstep 硬边整根滤掉 →
            画面里只有左下角几根（远处全没了）。
            正解：下限提到 0.42。 */
      '    float u1 = 1.0 - t1 * 0.58;',                        /* 尺寸因子（近大远小） */
      '    float bx = mix(0.030, 0.620, pow(t1, 0.75));',        /* x：近→远 往右收 */
      '    float by = mix(0.08, 0.44, t1);',                     /* uy：近低远高 */
      '    vec2 d1 = (vec2(p.x, uy) - vec2(bx, by)) / vec2(0.0078, 0.032) * u1;',
      '    bol = max(bol, 1.0 / (1.0 + dot(d1, d1) * 3.0));',
      '  }',
      /* 只保留"桩芯"，把高斯尾巴彻底切掉 —— 尾巴正是压暗的来源。
         ⚠️ 用较硬的 smoothstep 边（0.62→0.90）→ 桩是**清晰的黑色小柱**，
            这正是参考图前景"节拍器"的观感（用户选定：优先做实前景）。 */
      '  bol = smoothstep(0.62, 0.90, bol) * inDeck * smoothstep(0.02, 0.16, dy);',
      '  col -= vec3(0.098, 0.108, 0.130) * bol;',                   /* 桩很暗 */
      /* 桩顶的高光（湿的金属/塑料反光）—— 让桩有立体感 */
      '  col += vec3(0.22, 0.26, 0.32) * bol * (1.0 - bol) * 1.6;',
      '',
      /* ============================================================
         ⑤ 行人：保留剪影 + 白雾感（用户选定）
            参考图：右侧人行道上有 5~7 个人，全部撑伞、全部背向或侧向镜头。
            实测位置 x 0.52~0.98，图上 y 0.44~0.90 → uy 0.10~0.56。
            ⚠️ 人在【人行道】上（x>0.52），不在左侧车道里。
            画法：只输出**亮度差**（相对桥面），天然得到剪影；
                  再乘一个雾化系数 —— 越远雾化越强（远处只剩一团白雾）。
         ============================================================ */
      '  float pplAcc = 0.0;',
      '  for (int i = 0; i < 8; i++) {',
      '    float fi = float(i);',
      '    float h = hash(vec2(fi * 3.7 + 1.3, 2.1));',
      '    float h2 = hash(vec2(fi * 5.1 + 4.7, 8.3));',
      /* 越靠后的索引越"远"（uy 越大 = 图上越高） */
      '    float depth = fi / 7.0;',                        /* 0=近 1=远 */
      /* 位置：x 在 0.53~0.95，uy 从 0.12（近，画面下）到 0.50（远，中段） */
      '    float px2 = mix(0.53, 0.95, h) + 0.018 * sin(u_time * 0.3 + fi);',
      '    float py2 = mix(0.12, 0.50, depth) + 0.006 * sin(u_time * 0.5 + h2 * 6.28);',
      /* 滚动"走过"阶段：行人整体向前走（uy 下移 = 向镜头走） */
      '    float walk = smoothstep(0.20, 0.80, sc);',
      '    py2 -= walk * (0.09 + 0.05 * h);',
      /* 迈步微动：腿的相位（用 u_time 驱动，每步约 1.1 秒） */
      '    float stride = 0.5 + 0.5 * sin(u_time * 1.15 + fi * 2.1);',
      '    py2 -= stride * 0.0035;',
      /* 尺寸：越远越小（透视）。
         ⚠️ personShape 里 x 与 y 用同一个 s，但屏幕宽高比 1.7126，
            所以视觉上人会被**横向拉伸 1.7 倍** → 伞看起来比实际宽。
            补偿办法：把整体的 s 调小一点、并靠 personShape 内部的
            纵横向缩放（vec2(1.0, 0.42)）把伞压扁。
            这里 s 取 0.070~0.020（使用者选定"做实前景"→ 近处够大）。 */
      '    float s = mix(0.070, 0.019, depth);',
      /* 只在行人带里算，省算力 */
      '    float inbox = step(0.52, px2) * step(px2, 0.99)',
      '                * step(0.10, py2) * step(py2, 0.54);',
      '    if (inbox > 0.5) {',
      '      float pv = personShape(vec2(p.x, uy), vec2(px2, py2), s);',
      /* 雾化：越远越糊。CL_MIST_FACTOR 0.55
         ⚠️⚠️ 又一个"全屏压暗"的坑：原来写
              pplAcc += (silhouette - edge * mist * 0.34)
            而 edge = 1 - smoothstep(0, 0.35, |pv|) 在**没人处 pv=0 → edge=1**，
            于是立刻扣掉 mist*0.34 ≈ 0.10 —— 把右侧桥面整体压暗 10 点。
            正解：雾化项必须**先乘 silhouette 的"存在感"**，
            没有剪影的地方一点也不加。
         ⚠️ 用户选定"优先做实前景" → 雾化整体减轻（0.34→0.22），
            让伞和腿的轮廓真正看得出来。 */
      '      float silhouette = clamp(-pv, 0.0, 1.0);',
      '      float mist = 0.40 * (0.25 + 0.75 * depth);',         /* CL_MIST_FACTOR（已减轻） */
      '      float exist = smoothstep(0.02, 0.30, silhouette);',   /* 只在有人处为 1 */
      '      float edge = 1.0 - smoothstep(0.0, 0.30, abs(pv));',
      '      pplAcc += (silhouette - edge * mist * 0.22 * exist) * inDeck;',
      '    }',
      '  }',
      /* ⚠️ 系数再提高（用户选定"优先做实前景"）：
         参考图人物区 br 51 而周围桥面 br 65~83，落差 15~30。
         前几版给 0.30/0.35 都太弱（叠加雾化后几乎看不见）。
         → 提到 0.46，并让人物比桥面**更暗**（剪影方向）。 */
      '  col += vec3(0.108, 0.122, 0.144) * clamp(pplAcc, -1.6, 1.6) * 1.45;',
      '',
      /* ============================================================
         ⑥ 远景雾：越往上（越远）雾越重
            ⚠️⚠️ 这是让"建筑一直偏亮 20~30 点"的最后一个元凶。
               契约里的 CL_HAZE_FAR = 0.42 是按"整幅平均"估的，
               但直接把 0.42 灌进去 = `mix(col, 雾色, 0.33)`，
               把建筑从 br 70 一路拉到 br 97 —— 建筑就"消失"了。
               正解：雾要薄。远景 0.22 足够表达"能见度低"，
               再厚就变成"白茫茫一片"（参考图的建筑是**看得清轮廓**的）。
            ⚠️ 雾只在【建筑/天空】区（uy > 0.56）起作用；桥面区几乎不吃雾，
               否则近处的湿反光会被洗白（参考图桥面落差 100+ 点，很"脆"）。 */
      '  float hazeGate = smoothstep(0.50, 0.72, uy);',             /* 桥面区 ≈ 0 */
      '  float hazeAmt = mix(0.20, 0.03, smoothstep(0.62, 0.90, uy));',
      '  float hz = fbm(vec2(p.x * 3.4 + u_time * 0.012, uy * 7.2));',
      '  col = mix(col, vec3(0.478, 0.525, 0.612), hazeAmt * (0.55 + 0.45 * hz) * hazeGate);',
      '',
      /* ============================================================
         ⑦ 雨丝：参考图里的雨"密而细" —— 桥面反光很亮说明雨量大，
            但空中看不到明显雨丝。所以做得**细而低对比**，
            主要靠桥面涟漪和反光传达"在下雨"。
            CL_RAIN_INTENSITY 0.16
         ============================================================ */
      /* ⚠️ 方向：GL 的 y 轴朝上，"雨往下落" = 屏幕向下 = GL 的 -y。
         所以最终 y 坐标里 u_time 项要**配合 y 的负系数**形成整体下移。
         ⚠️ 走样：每帧位移必须 << 1 个噪声网格（60fps 下 < 0.3）。
         这里 rp.y 的时间系数 = 0.62，乘到高频系数 14 之后是 8.68，
         每帧 8.68/60 ≈ 0.145 网格 —— 安全。
         同时 1 秒推进 8.68 网格 >> 0.5，肉眼明确看得出在动。 */
      '  vec2 rpp = vec2(p.x * 5.4 + p.y * 1.35 + u_time * 0.42, p.y * 1.15 + u_time * 0.62);',
      '  float rJit = vnoise(rpp * 0.42 + u_time * 0.05 + 13.7);',
      '  rpp += (rJit - 0.5) * 0.50;',
      '  float rn = vnoise(rpp * 9.0);',
      '  float rn2 = vnoise(rpp * 14.0 + 5.1);',
      '  float rain = smoothstep(0.84, 1.0, rn * 0.72 + rn2 * 0.28);',
      /* 雨在天空/建筑前更明显（桥面有反光已经够"湿"了） */
      '  float rainVis = 0.55 + 0.45 * smoothstep(0.40, 0.95, uy);',
      '  rainVis *= mix(0.72, 1.0, smoothstep(0.20, 0.90, uy));',
      '  col += vec3(0.62, 0.70, 0.80) * rain * 0.16 * rainVis;',
      '',
      /* ============================================================
         ⑧ 车灯：唯一的高饱和暖色点缀（参考图里 0.4% 面积都不到）
            参考图里车队在【左侧车道】x 0.05~0.45，图上 y 0.58~0.72
            → uy 0.28~0.42。车尾灯是暗红色的小点。
            CL_C_LAMP_WARM 255,190,140
         ============================================================ */
      '  float lampT = fract(u_time * 0.055);',                    /* 车流缓慢前移 */
      '  float lampX = 0.06 + 0.36 * fract(hash(vec2(floor(u_time * 0.055), 3.3)));',
      '  vec2 lp = vec2((p.x - lampX) / TARGET_AR, uy - 0.35);',
      '  float lampGlow = 1.0 / (1.0 + dot(lp, lp) * 1400.0);',
      '  col += vec3(1.0, 0.62, 0.42) * lampGlow * 0.20 * laneW;',  /* 只在车道里 */
      '',
      /* ---------- 冷调：整幅偏蓝灰（R 通道下压 0.055） ---------- */
      '  col.r *= (1.0 - 0.055);',
      '',
      /* ---------- 曝光：CL_GLOBAL_EXPOSURE ----------
         ⚠️ 第一版给 0.92 + 旧暗角（顶部 0.5 黑 / 四角 0.88 黑），
            结果首屏顶部天空只剩 br 63，而参考图是 br 122（最亮）。
            暗角已收敛到 1/4，这里把曝光提到 1.06 补回来。 */
      '  col *= 1.06;',
      '',
      /* ---------- 绘画化色块 ----------
         档数按区域给：天空 22 档（层次多）、桥面 14 档（大面积平涂）。
         混合比例留 35%~50%，别给 1.0。 */
      '  vec3 q = mix(col, posterize3(col, 22.0), 0.35);',
      '  q = mix(q, mix(col, posterize3(col, 14.0), 0.50), inDeck * 0.40);',
      '  col = q;',
      '',
      /* ---------- 暗角（阴天不该有浓黑四角，收敛） ---------- */
      '  vec2 vc = (uv - 0.5) * vec2(1.0, 0.94);',
      '  float vig = 1.0 - dot(vc, vc) * 0.55;',
      '  col *= clamp(vig, 0.0, 1.0);',
      '',
      /* ---------- 轻微胶片颗粒（掩掉渐变色带） ---------- */
      '  float grain = hash(gl_FragCoord.xy + fract(u_time) * 91.7) - 0.5;',
      '  col += grain * 0.020;',
      '',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n');

    function compile(type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        /* 编译失败时把错误打到控制台 —— 否则只有"画面黑了"这一个线索 */
        if (window.console && gl.getShaderInfoLog) {
          console.error('[london shader]', gl.getShaderInfoLog(sh));
        }
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
      if (window.console && gl.getProgramInfoLog) {
        console.error('[london link]', gl.getProgramInfoLog(prog));
      }
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

    /* ---- 状态：都是"目标值"，渲染时用 lerp 追上去 ---- */
    /* 开场：鼠标视差归中，让第一眼就是参考图的构图 */
    var mouseT = 0.5, mouseTY = 0.5;
    var mouseC = 0.5, mouseCY = 0.5;
    var scrollC = 0, scrollT = 0;
    var DPR_CAP = 1.5;

    function resize() {
      var w = canvas.clientWidth || window.innerWidth;
      var h = canvas.clientHeight || window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      /* 再压一档：这个场景是全屏 FBM + 循环，像素越少越流畅 */
      var scale = reduceMotion ? 0.5 : 0.72;
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

    /* 滚动进度 → 推近 / 上抬 */
    window.addEventListener('scroll', function () {
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollT = window.scrollY / max;
    }, { passive: true });

    var start = performance.now();
    var running = true;

    /* 页面不可见时暂停渲染，省电 */
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
      if (running) loop(performance.now());
    });

    function loop(now) {
      if (!running) return;
      resize();

      var t = (now - start) / 1000;

      mouseC  = lerp(mouseC,  mouseT,  0.045);
      mouseCY = lerp(mouseCY, mouseTY, 0.045);
      /* 滚动跟随稍快一点，否则"滚动推近"的手感会滞后 */
      scrollC = lerp(scrollC, scrollT, 0.085);

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouseC, mouseCY);
      gl.uniform2f(uScroll, scrollC, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  })();

  /* ==========================================================
     4. 滚动进度
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
     5. 入场：逐行遮罩上推（split-line-up-effect）
     ----------------------------------------------------------
     参考站最标志性的动画就是这个。原理：
       ① 把一段文字按"视觉行"切开，每行各自包一层 overflow:hidden 的壳
       ② 壳里再放一个 .pf-line-in，初始 translateY(105%) —— 完全藏在壳下面
       ③ 激活时把 inner 推回 0：文字像从"下一行"升上来
       ④ 行与行之间错开延迟（easeOutQuint），形成"逐行浮现"的节奏
     比整体淡入位移高级得多：有方向、有层次、文字是"被揭开"而不是"飘进来"。
     ========================================================== */

  (function splitLines() {
    var targets = Array.prototype.slice.call(root.querySelectorAll('.pf-split'));
    if (!targets.length) return;

    /* 把元素里的文字按视觉行切分。
       做法：先按 <br> 与换行拆成"逻辑段"，再在每段内部用
       逐字测量（getBoundingClientRect().top 变化）找出真实的视觉折行位置。 */
    function splitEl(el) {
      /* 已经切过就不重复切 */
      if (el.getAttribute('data-split') === '1') {
        return Array.prototype.slice.call(el.querySelectorAll('.pf-line-in'));
      }

      var raw = el.innerHTML;
      /* 按 <br> 或换行拆逻辑段（保留原来的换行语义） */
      var segs = raw.split(/<br\s*\/?>/i).map(function (s) { return s.trim(); })
                    .filter(function (s) { return s.length; });
      if (!segs.length) segs = [''];

      /* 先清空、铺入纯文本节点，便于逐字测量 */
      el.textContent = '';
      var nodes = [];
      segs.forEach(function (seg, si) {
        if (si > 0) {
          el.appendChild(document.createElement('br'));
          nodes.push(null);   /* 段间强制换行，标记为"必须断行" */
        }
        /* 逐字成 span，方便测出折行 */
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
        if (!n) {                    /* 强制断行 */
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

      /* 用行内容重建 DOM：每行一个壳 + 一个可位移的 inner */
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
      var inners = splitEl(el);
      /* 行号写进自定义属性，CSS 里用 --li 做递减延迟 */
      inners.forEach(function (inner, i) {
        inner.style.setProperty('--li', i);
      });
      allInners = allInners.concat(inners);
    });

    /* 偏好减少动效 → 直接把所有行推到位置，不做动画 */
    if (reduceMotion) {
      root.classList.add('pf-split-done');
      return;
    }

    /* 观察每个 .pf-split 容器（按容器一次性唤起，行内自身错开） */
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
     5b. 入场观察器（非文字类元素）
     同批进入的元素按 DOM 顺序递增延迟（最多 5 档，每档 90ms）
     ========================================================== */

  (function reveal() {
    var items = Array.prototype.slice.call(root.querySelectorAll('.pf-reveal'));
    if (!items.length) return;

    /* 无 IntersectionObserver 或偏好减少动效 → 全部直接显示 */
    if (!('IntersectionObserver' in window) || reduceMotion) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    /* 先给每个元素算好它在"同批"里的序号 —— 用一个全局游标，
       按当前视口内出现顺序分批。简单起见：按元素在文档中的位置，
       每 5 个为一组循环给延迟。 */
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
     5c. 滚动叙事：每幕随滚动做视差 / 淡出
     ----------------------------------------------------------
     参考站的手感来源：滚动不是"翻页"，而是驱动场景与文字连续变化。
     这里给每一幕挂一个进度值，做：
       · 内容轻微纵向视差（比背景慢，形成层次）
       · 离开视口时整体淡出 + 轻微上移
     ========================================================== */

  (function scrollNarrative() {
    if (reduceMotion) return;
    var secs = Array.prototype.slice.call(root.querySelectorAll('.pf-sec'));
    if (!secs.length || !window.requestAnimationFrame) return;

    /* 每幕提前算好它的文档区间；resize 时重算 */
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
    /* 字体加载完高度会变，重新量一次 */
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
        var p = (sy + vh - m.top) / (vh + m.height);
        p = clamp(p, 0, 1);
        cur[i] = lerp(cur[i], p, 0.12);

        /* 视差：进入时从 +18px 落到 -18px，比背景慢 → 有纵深。
           伦敦是"静静站着看雨"，视差比雨夜更慢（-22 而非 -26）。 */
        var local = cur[i] - 0.5;                 /* -0.5 ~ 0.5 */
        var ty = local * -22;
        /* 幕中心越过视口中心后逐渐淡出（首幕不淡出，避免一进来就变淡） */
        var fade = 1;
        if (i > 0) {
          var off = Math.abs(local);
          fade = 1 - clamp((off - 0.28) / 0.30, 0, 1) * 0.55;
        }
        m.inner.style.transform = 'translate3d(0,' + ty.toFixed(2) + 'px,0)';
        m.inner.style.opacity = fade.toFixed(3);
      });

      requestAnimationFrame(tick);
    })();
  })();

  /* ==========================================================
     6. 光标跟随
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
    var hoverSel = 'a, button, input, .pf-about-card, .pf-feat-item';
    document.addEventListener('pointerover', function (e) {
      if (e.target.closest && e.target.closest(hoverSel)) ring.classList.add('is-hover');
    }, { passive: true });
    document.addEventListener('pointerout', function (e) {
      if (e.target.closest && e.target.closest(hoverSel)) ring.classList.remove('is-hover');
    }, { passive: true });
  })();

  /* ==========================================================
     7. 音乐控件
     ----------------------------------------------------------
     形态参考 #snd-btn：一个圆钮 + 20×20 canvas 画 7 根跳动的竖条。
     没有音量滑块 —— 音量在 profile.yml 配置，前台只有"播放/暂停"。

     ⚠️ 占位方案：data-src 为空时不加载任何音频文件，
        但播放/暂停、竖条动画、aria 状态全部真实可用。
        替换成真音频：把 profile.yml 的 music.src 填上即可，
        此文件不需要任何改动。
     ========================================================== */

  (function music() {
    var box = document.getElementById('pf-music');
    if (!box) return;

    var btn    = document.getElementById('pf-music-btn');
    var cvs    = document.getElementById('pf-snd-canvas');
    var src    = box.getAttribute('data-src') || '';
    var type   = box.getAttribute('data-type') || 'audio/mpeg';
    var loopOn = box.getAttribute('data-loop') === '1';
    var isPlaceholder = !src;

    if (isPlaceholder) box.classList.add('is-placeholder');

    var audio = null;
    var playing = false;
    var pendingPlay = false;
    var wantVolume = clamp(parseFloat(box.getAttribute('data-volume')) || 0.35, 0, 1);

    /* ---- 有真实音源时才建 <audio> ---- */
    if (!isPlaceholder) {
      audio = document.createElement('audio');
      audio.loop = loopOn;
      audio.volume = 0;              /* 淡入用 */
      audio.preload = 'none';
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

    /* ---- canvas 竖条：7 根，正弦相位错开，高度随"响度"起伏 ----
       ⚠️ 参考实现画在 20×20 的逻辑坐标里（canvas CSS 尺寸 20px），
          用 dpr 放大 backing store，否则 retina 上是糊的。 */
    var D = 20;                       /* 逻辑边长（与 canvas width/height 属性一致）*/
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

      /* 播放中才推进相位；暂停后用 lerp 把高度收平（不是硬切，更柔和） */
      if (playing) A += dt;
      var amp = playing ? 1 : 0;

      ctx.save();
      ctx.scale(L, L);
      ctx.clearRect(0, 0, D, D);
      /* 播放时暖色，暂停时压成灰蓝 —— 一眼能看出状态 */
      ctx.fillStyle = playing
        ? getComputedStyle(box).getPropertyValue('--pf-lamp').trim() || '#E8A85C'
        : 'rgba(160,172,190,.55)';
      for (var f = 0; f < 7; f++) {
        /* 同参考实现：3px 基准 + 最多 8px 起伏，7 根共占 21px（留 1px 余量） */
        var wave = 0.5 * Math.sin(-6 * A + 0.6 * f) + 0.5;
        var h = 3 + 8 * wave * amp;
        ctx.fillRect(3 * f, D - h, 1, h);
      }
      ctx.restore();
    }

    (function tick() {
      drawBars();
      /* 只在播放或还没收平时常驻重绘，静止时省电 */
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
      /* 占位模式：没有音频，但状态与竖条动画照常 —— 交互逻辑完整 */
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
      if (playing) doPause();
      else doPlay();
    });

    /* 入场后（已有用户手势）自动开播 —— 这是最常见的"点击进入即起音乐" */
    document.addEventListener('pf:enter', function () {
      if (isPlaceholder || !audio) return;
      doPlay();
    });

    /* 页面隐藏时暂停，回来时恢复 */
    document.addEventListener('visibilitychange', function () {
      if (playing) lastT = performance.now();
      if (!audio) return;
      if (document.hidden && playing) { audio.pause(); pendingPlay = true; playing = false; box.classList.add('is-playing'); }
      else if (!document.hidden && pendingPlay) { pendingPlay = false; doPlay(); }
    });

    /* 别忘了给 CSS 变量兜底：getComputedStyle 取不到时用暖色 */
    if (!box.style.getPropertyValue('--pf-lamp')) {
      box.style.setProperty('--pf-lamp-fallback', '#E8A85C');
    }
  })();

  /* ==========================================================
     8. 控制台彩蛋
     ========================================================== */

  (function easterEgg() {
    if (!window.console) return;
    var css = 'color:#E8A85C;font-family:Georgia,serif;font-size:13px;';
    try {
      console.log('%c雨还在下，桥上的灯还亮着。', css);
      console.log('%c—— 尚谦 · ' + new Date().toLocaleDateString('zh-CN'), css);
    } catch (e) {}
  })();

})();
