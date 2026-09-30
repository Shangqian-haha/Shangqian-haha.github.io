/* ============================================================
   极地 · 极光冰原 · /clouds/ v5「Aurora in the Sky」
   ------------------------------------------------------------------
   极光的最终形态（参考用户给的极光壁纸 + 挪威实拍视频）：
   **柔和、弯曲、横向舒展的光带** —— 像绸带一样从画面一侧扫到
   另一侧，而不是一根根竖立的帘柱。
   做法：整块铺在天上的远平面（z=-760），fragment 里画 3 条带：
     · 中心线 = 缓慢漂移的弯曲曲线（低频 sin + fbm 起伏）
     · 亮度沿法向高斯衰减（柔边）
     · 沿带方向叠 fbm 丝缕 + 极淡的竖向射线
     · 亮心泛白；冰川在前景（z>-700）自然遮挡光带下缘
   其余：天空穹顶 / 起伏雪原 / 远景冰川群 / 星空 / 雪粒 /
   虚拟滚动 / 四幕相机叙事 / 无 JS 兜底，均与 v2 相同。

   全自研 three.js r112，**零外部模型/贴图**（贴图用 canvas 现画）。
   依赖：three.r112.js（page.ejs 里在本文件之前加载）。
   备份：v1 绘画化云海 → .workbuddy/clouds-v1-backup/
         v2 霓虹隧道奔跑者 → .workbuddy/clouds-v2-backup/
         极地 v1（贴地极光）→ .workbuddy/polar-v1-backup/
         极地 v2（悬空帘柱，已否）→ .workbuddy/polar-v2b-backup/
         v3（顶栏音乐钮 · 二/三幕左中）→ .workbuddy/clouds-v3-topbar-backup/
         v4 = 当前（幕间浮现节奏：进入的幕过半才显字，2026-09-29）
              → .workbuddy/clouds-v4-backup/

   结构：
     0. 渐进增强闸门   —— WebGL 可用才 js-on，否则文档流兜底
     1. 三维场景       —— 极夜雾 / 天空穹顶 / 星空 / 悬空极光幕(合并几何)
                          / 远景冰川群 / 起伏雪原 / 雪面反光 / 雪粒
     2. 虚拟滚动       —— wheel/touch/键盘 → tgt，每帧缓动
     3. 叙事           —— 4 个相机关键帧随进度插值 + 文字层驱动
     4. 闸门时序       —— 进度条 → 自动/点击进入
   ============================================================ */
(function () {
  'use strict';

  var root = document.getElementById('clouds-root');
  var canvas = document.getElementById('cl-canvas');
  var gate = document.getElementById('cl-gate');
  var gateFill = document.getElementById('cl-gate-fill');
  var gateHint = document.getElementById('cl-gate-hint');
  var guide = document.getElementById('cl-guide');
  var bar = document.getElementById('cl-bar');
  var copy = document.getElementById('cl-copy');
  if (!root || !canvas) return;

  var secs = Array.prototype.slice.call(copy.querySelectorAll('.cl-sec'));
  var NSEC = Math.max(1, secs.length);

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  var isMobile = /iPad|iPhone|Android|Mobile/i.test(navigator.userAgent || '');

  /* ================================================================
     0. WebGL 能力检测 —— 失败就不加 js-on，页面退化为文档流兜底
     ================================================================ */
  if (!window.THREE) return;
  var glOK = false;
  try {
    var _t = document.createElement('canvas');
    glOK = !!(_t.getContext('webgl') || _t.getContext('experimental-webgl'));
  } catch (e) { glOK = false; }
  if (!glOK) {
    if (canvas.parentNode) canvas.style.display = 'none';
    return;
  }

  /* js-on：从这一刻起进入「固定叠层 + 虚拟滚动」模式，闸门出现 */
  root.classList.add('js-on');
  document.body.classList.add('cl-lock');

  /* ================================================================
     1. 三维场景
     ================================================================ */

  /* 极光改用「天幕光带」画法后不再需要帘脚高度 ——
     光带直接画在一整块天上（见下方 SKY_BAND 段）。 */

  var COL = {
    bg:     0x03050d,                                   /* 天顶近黑 */
    fog:    0x061324,                                   /* 夜雾（冰蓝黑） */
    green:  new THREE.Color(0.22, 0.95, 0.66),          /* 极光绿 */
    teal:   new THREE.Color(0.18, 0.86, 0.84),
    cyan:   new THREE.Color(0.34, 0.80, 1.00),          /* 冰蓝 */
    violet: new THREE.Color(0.62, 0.42, 1.00),          /* 极光紫 */
    pink:   new THREE.Color(1.00, 0.52, 0.86)
  };

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
  });
  renderer.setClearColor(COL.bg, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));

  var scene = new THREE.Scene();
  /* ⚠️ 雾的远平面 1600：雪原一直铺到 z≈-1400。若还用 v1 的 980，
     主冰川（距离约 690）会被吃掉 58% 只剩一团灰，谈不上「远景冰川」。 */
  scene.fog = new THREE.Fog(COL.fog, 420, 1600);

  var camera = new THREE.PerspectiveCamera(60, 1, 0.5, 2800);
  camera.position.set(0, 24, 66);

  /* ---------- canvas 现画贴图 ---------- */
  function radialTex(inner, outer, tx, ty) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    if (tx || ty) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(tx || 1, ty || 1); }
    return t;
  }
  var softTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  var sheenTex = radialTex('rgba(150,225,255,0.85)', 'rgba(90,170,255,0)');
  var glowTex = radialTex('rgba(140,255,215,0.90)', 'rgba(60,150,180,0)');

  /* ---------- 天空穹顶：天顶近黑 → 地平线深蓝 ---------- */
  (function () {
    var R = 2000;
    var geo = new THREE.SphereBufferGeometry(R, 28, 18);
    var pos = geo.attributes.position;
    var col = new Float32Array(pos.count * 3);
    var cZen = new THREE.Color(0x02040a);
    var cMid = new THREE.Color(0x071527);
    var cHor = new THREE.Color(0x0e2a42);
    var tmp = new THREE.Color();
    for (var i = 0; i < pos.count; i++) {
      /* three r112 默认 LinearEncoding：颜色数值直接进 shader，
         所以这里给的就是最终屏幕亮度，改一个数就能预览明暗。 */
      var t = Math.max(0, Math.min(1, (pos.getY(i) / R + 1) * 0.5));
      if (t < 0.5) tmp.copy(cHor).lerp(cMid, t / 0.5);
      else tmp.copy(cMid).lerp(cZen, (t - 0.5) / 0.5);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false
    }));
    dome.frustumCulled = false;
    dome.renderOrder = -2;      /* 最先画，做底色 */
    scene.add(dome);
  })();

  /* ---------- 起伏雪原 ----------
     一块大平面按多频正弦做顶点位移，**用顶点色画出明暗**：
     雪谷偏夜蓝、雪脊被极光照成冰白。近处几乎平（雪壳），
     越远起伏越大（雪脊），最后没入夜雾。 */
  var SNOW_W = 3000, SNOW_D = 1900, SNOW_CZ = -560;

  /* 雪面高度场（世界坐标 → 高度）。刻意不用随机数，保证可复现。
     ⚠️ 远端必须「下沉」：雪原一直铺到 -1500，若在远处还保持 ±8 的起伏，
     它的不透明山体会把冰川挡得只剩一条窄带（v2c/d 首拍的教训）。
     让 z<-600 起雪面逐渐沉到地平线以下，冰川才能完整立起来。 */
  function sstep(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  function snowHeight(x, z) {
    var far = Math.max(0, Math.min(1, (-z - 80) / 900));       /* 远处起伏大 */
    var a = 0.9 + far * far * 7.5;
    var sink = sstep(520, 1250, -z) * 64;
    return Math.sin(x * 0.0132 + z * 0.0051) * a * 1.00
         + Math.sin(x * 0.0417 - z * 0.0186) * a * 0.46
         + Math.sin(x * 0.1053 + z * 0.0671) * a * 0.18
         + Math.sin(z * 0.0038 + 1.7) * 2.6
         - sink;
  }

  var snowGround = (function () {
    var SEG = isMobile ? 72 : 120;
    /* ⚠️ r112 里 PlaneGeometry/SphereGeometry 还是传统 Geometry（没有
       .attributes），必须用 *BufferGeometry 版本，否则读顶点直接崩 */
    var geo = new THREE.PlaneBufferGeometry(SNOW_W, SNOW_D, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, SNOW_CZ);

    var pos = geo.attributes.position;
    var n = pos.count;
    var col = new Float32Array(n * 3);
    var cGully = new THREE.Color(0x060d1a);   /* 雪谷（背光） */
    var cMid = new THREE.Color(0x0e2036);     /* 雪面（极夜里的大面积雪原必须压暗，
                                                 否则像白天 —— v2a 首拍的教训） */
    var cCrest = new THREE.Color(0x5d90ac);   /* 雪脊（被极光照亮的脊线） */
    var cFar = new THREE.Color(0x1c3d57);     /* 远处偏冰蓝（别比冰川还亮） */
    var tmp = new THREE.Color();

    for (var i = 0; i < n; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      var h = snowHeight(x, z);
      pos.setY(i, h);

      /* 亮度：低洼 → 背光，脊顶 → 亮。亮边只给 hn>0.55 的高脊，
         否则整个雪面糊成一片灰（v2c 首拍就是这样） */
      var hn = Math.max(0, Math.min(1, (h + 1.6) / 9.5));
      tmp.copy(cGully).lerp(cMid, Math.min(1, hn * 1.15));
      tmp.lerp(cCrest, Math.max(0, (hn - 0.55) / 0.45) * 0.9);
      /* 远处补一点冰蓝（大气散射）：z 越负越远 */
      var fk = Math.max(0, Math.min(1, (-z - 300) / 900));
      tmp.lerp(cFar, fk * 0.5);

      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();

    var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, fog: true
    }));
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  })();

  /* ---------- 雪面反光（极光落在雪原上的一层冷光） ---------- */
  var snowSheen = new THREE.Mesh(
    new THREE.PlaneGeometry(2800, 1600),
    new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, opacity: 0.09, fog: false
    })
  );
  snowSheen.rotation.x = -Math.PI / 2;
  snowSheen.position.set(0, 0.4, -430);
  snowSheen.renderOrder = 1;
  scene.add(snowSheen);

  /* ---------- 极光天幕（核心） ----------
     参考用户给的极光壁纸：柔和、弯曲、横向舒展的光带 —— 不是一根根
     竖立的帘柱，而是像绸带一样从画面一侧扫到另一侧。
     做法：整块铺在天上的远平面（z=-760），fragment 里画 3 条带。
     ⚠️ 淡出全部在 fragment 里算（v2 教训：顶点级淡出会整片消失）。
        冰川在前景（z>-700）自然遮挡光带下缘 —— 不用自己画遮挡。 */
  var SKY_BAND = {
    W: 4200, H: 1500, Y: 560, Z: -760    /* 天幕平面尺寸/中心高度/纵深 */
  };

  var auroraVert = [
    'precision highp float;',
    'attribute vec3 position;',
    'attribute vec2 uv;',
    'uniform mat4 projectionMatrix;',
    'uniform mat4 modelViewMatrix;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var auroraFrag = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform float uTime;',
    'uniform float uBoost;',
    'uniform float uAlpha;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
    /* 平滑值噪声：hash 离散取块是方块，必须双线性插值才是连绵丝缕 */
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',
    'float fbm(vec2 p){',
    '  float v = 0.0, a = 0.58;',
    '  for (int k = 0; k < 2; k++) {',
    '    v += a * vnoise(p);',
    '    p = p * 2.3 + vec2(7.3, 3.1);',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    /* 一条光带：p=vUv，seed 区分三条带，yMid/slope/amp 定中心线形状，
       width 定粗细，t 是慢时间。返回 0~1 的强度。 */
    'float band(vec2 p, float seed, float yMid, float slope, float amp, float width, float t){',
    '  float x = p.x;',
    /* 中心线：基础走向 + 两个低频 sin 弯 + fbm 漂移（绸带的「弯曲」来自这里） */
    '  float yc = yMid + slope * (x - 0.5)',
    '    + amp * sin(x * 4.0 + seed * 3.1 + t * 0.9)',
    '    + amp * 0.5 * sin(x * 8.6 - seed * 5.3 - t * 0.6)',
    '    + amp * 1.3 * (fbm(vec2(x * 2.3 + t * 0.4, seed)) - 0.5) * 2.0;',
    '  float d = p.y - yc;',
    /* 柔边：沿法向高斯衰减 */
    '  float body = exp(-d * d / (width * width));',
    /* 沿带方向的丝缕（坐标用 d/width，丝缕才会贴着弯带流动） */
    '  float wisp = 0.55 + 0.45 * vnoise(vec2(x * 6.0 + t * 1.1 + seed * 9.0, d / width * 1.6));',
    /* 极淡的竖向射线（真极光隐约有，但绝不抢戏 —— v2 帘柱版就是抢戏了） */
    '  float ray = 0.86 + 0.14 * vnoise(vec2(x * 34.0 + seed * 17.0, d / width + t * 2.0));',
    /* 两端渐隐 */
    '  float ends = smoothstep(0.0, 0.10, x) * (1.0 - smoothstep(0.90, 1.0, x));',
    '  return body * wisp * ray * ends;',
    '}',
    'void main(){',
    '  float t = uTime * 0.05;',
    /* 主带：亮绿，从左下往右上扫（参考图 2/3 的走向） */
    '  float i1 = band(vUv, 1.0, 0.46, 0.22, 0.09, 0.048, t);',
    /* 次带：青色，更高、与主带大致平行（弯太多会和主带围出「椭圆眼」，
       b1 首拍就犯了这个） */
    '  float i2 = band(vUv, 7.3, 0.66, -0.17, 0.07, 0.060, t) * 0.45;',
    /* 地平线辉光带：宽而低，托住整个天空 */
    '  float i3 = band(vUv, 3.7, 0.24, -0.04, 0.07, 0.115, t) * 0.36;',
    '  float I = i1 + i2 + i3;',
    /* 整体压暗一档（b1 首拍：整个天空糊成亮青色，缺了极夜的黑） */
    '  I *= 0.88;',
    /* 贴地渐入（地平线以下交给冰川），顶端弥散渐隐 */
    '  I *= (0.40 + 0.60 * smoothstep(0.10, 0.32, vUv.y)) * (1.0 - smoothstep(0.84, 1.0, vUv.y));',
    /* 颜色：绿为底、青做次带混色，亮心泛白（实拍特征） */
    '  vec3 col = mix(vec3(0.10, 0.95, 0.62), vec3(0.20, 0.85, 0.85),',
    '                 clamp(i2 / max(I, 0.001), 0.0, 1.0) * 0.55);',
    '  float hot = smoothstep(0.50, 1.0, I);',
    '  col = mix(col, vec3(0.85, 1.00, 0.93), hot * 0.55);',
    '  gl_FragColor = vec4(col * I * uAlpha * (1.0 + uBoost * 0.25), 1.0);',
    '}'
  ].join('\n');

  var auroraMat = (function () {
    /* ⚠️ r112 必须用 *BufferGeometry / PlaneBufferGeometry（传统版无 .attributes） */
    var geo = new THREE.PlaneBufferGeometry(SKY_BAND.W, SKY_BAND.H);
    var mat = new THREE.RawShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBoost: { value: 0 },
        uAlpha: { value: 1.0 }
      },
      vertexShader: auroraVert,
      fragmentShader: auroraFrag,
      transparent: true,
      depthWrite: false,
      depthTest: true,           /* 让前景冰川/雪原自然遮挡光带下缘 */
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, SKY_BAND.Y, SKY_BAND.Z);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return mat;
  })();

  /* ---------- 天空辉光（极光整体的辉光，托住天上的光带） ---------- */
  (function () {
    var g = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, 1000),
      new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending, opacity: 0.16, fog: false
      })
    );
    g.position.set(0, 96, -560);
    g.renderOrder = 1;
    scene.add(g);
  })();

  /* ---------- 星空 ---------- */
  var stars = null;
  (function () {
    var n = isMobile ? 300 : 620;
    var p = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 1700;
      p[i * 3 + 1] = 20 + Math.pow(Math.random(), 0.75) * 340;
      p[i * 3 + 2] = -120 - Math.random() * 900;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    var m = new THREE.PointsMaterial({
      size: 1.6, map: softTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xd6ecff, opacity: 0.85,
      sizeAttenuation: false, fog: false
    });
    stars = new THREE.Points(g, m);
    stars.frustumCulled = false;
    stars.renderOrder = 0;
    scene.add(stars);
  })();

  /* ---------- 远景冰川群 ----------
     v1 是「暗色山脊剪影」，只是一条深蓝的起伏线，没有冰川的质感。
     v2 保持同一条山脊算法，但：
       · 山脊线做**尖化**（|sin|^0.62 保号），出冰峰的锯齿轮廓
       · 三角带用**顶点色**从山脚夜蓝渐变到峰顶冰白 —— 下暗上亮，
         正是雪山的受光方式；离相机越远整体越亮越淡（大气散射）
       · 峰线单独一条亮冰蓝的雪线 */
  function buildGlacier(z, baseY, amp, seed, lum, ridgeHex, lineHex, width) {
    var N = 128;
    var halfW = width || 1600;
    /* 离散冰峰轮廓：nPeak 个尖峰 + 峰间鞍部，包络取最高者。
       v2c/d 用多频正弦 —— 出来的是「波浪」不是「冰峰」；
       尖峰必须显式建模：线性边 + pow 收腰，鞍部沉回山脚。 */
    function rnd(n) {
      var v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
      return v - Math.floor(v);
    }
    var nPeak = 11;
    var saddle = baseY + amp * 0.05;
    var pk = [];
    for (var p2 = 0; p2 < nPeak; p2++) {
      pk.push({
        x: -halfW + (p2 + 0.5) / nPeak * halfW * 2
           + (rnd(p2 * 3.1) - 0.5) * halfW / nPeak * 0.8,
        h: baseY + amp * (0.42 + rnd(p2 * 7.7) * 0.58),
        w: halfW / nPeak * (0.55 + rnd(p2 * 5.3) * 0.5)
      });
    }
    var pts = [];
    for (var i = 0; i <= N; i++) {
      var x = -halfW + i / N * halfW * 2;
      var y = saddle;
      for (var q = 0; q < nPeak; q++) {
        var d = Math.abs(x - pk[q].x);
        if (d < pk[q].w) {
          var t = 1 - d / pk[q].w;                       /* 0 峰脚 → 1 峰顶 */
          var yy = saddle + (pk[q].h - saddle) * Math.pow(t, 1.35);
          if (yy > y) y = yy;
        }
      }
      pts.push([x, Math.max(1.5, y)]);
    }

    var cFoot = new THREE.Color(0x071324).multiplyScalar(lum);
    var cCrest = new THREE.Color(ridgeHex).multiplyScalar(lum);
    var verts = [], cols = [], index = [], k = 0;
    for (var j = 0; j < N; j++) {
      var a = pts[j], b = pts[j + 1];
      /* 每段四个顶点：a 底 / b 底 / a 顶 / b 顶（顶=山脊线上那点） */
      verts.push(a[0], a[1], z,  b[0], b[1], z,  a[0], -70, z,  b[0], -70, z);
      var kA = Math.max(0, Math.min(1, (a[1] - baseY) / Math.max(1, amp)));
      var kB = Math.max(0, Math.min(1, (b[1] - baseY) / Math.max(1, amp)));
      var tA = new THREE.Color().copy(cFoot).lerp(cCrest, Math.pow(kA, 0.72));
      var tB = new THREE.Color().copy(cFoot).lerp(cCrest, Math.pow(kB, 0.72));
      cols.push(tA.r, tA.g, tA.b,  tB.r, tB.g, tB.b,
                cFoot.r, cFoot.g, cFoot.b,  cFoot.r, cFoot.g, cFoot.b);
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      k += 4;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
    g.setIndex(index);
    var mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, fog: true, side: THREE.DoubleSide
    }));
    mesh.frustumCulled = false;
    scene.add(mesh);

    /* 峰线上的雪线高光 */
    var lp = [];
    for (var m2 = 0; m2 <= N; m2++) { lp.push(pts[m2][0], pts[m2][1], z + 1.2); }
    var lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
    var line = new THREE.Line(lg, new THREE.LineBasicMaterial({
      color: new THREE.Color(lineHex).multiplyScalar(lum),
      transparent: true, opacity: 1.0, fog: true
    }));
    line.frustumCulled = false;
    scene.add(line);
  }
  /* 四层纵深。峰顶色必须明显亮于远处雪原（cFar），否则冰川会淹没在
     雪原里（v2a 教训）。极光光带画在 z=-760 的天幕上 —— 冰川在前景
     自然遮挡光带下缘，正是参考图里「山脉剪影切过极光」的构图。 */
  buildGlacier(-620, 34, 50, 0.7, 1.00, 0x9cc8e4, 0xd8f2ff, 1900);
  buildGlacier(-440, 24, 36, 2.4, 0.80, 0x7faed0, 0xbfe2f6, 1700);
  buildGlacier(-285, 15, 24, 5.1, 0.50, 0x5f8fb0, 0x9cc8e2, 1500);
  buildGlacier(-160, 7,  13, 8.3, 0.38, 0x3f6c8c, 0x77a8c8, 1300);

  /* ---------- 雪粒 ---------- */
  var SNOW_N = isMobile ? 320 : 620;
  var snow = null, snowFall = null, snowDrift = null;
  var SNOW_TOP = 78;
  (function () {
    var p = new Float32Array(SNOW_N * 3);
    snowFall = new Float32Array(SNOW_N);
    snowDrift = new Float32Array(SNOW_N);
    for (var i = 0; i < SNOW_N; i++) {
      p[i * 3] = (Math.random() - 0.5) * 230;
      p[i * 3 + 1] = Math.random() * SNOW_TOP;
      p[i * 3 + 2] = -195 + Math.random() * 265;
      snowFall[i] = 1.4 + Math.random() * 3.0;
      snowDrift[i] = 0.5 + Math.random() * 2.2;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    var m = new THREE.PointsMaterial({
      size: 0.34, map: softTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xecf7ff, opacity: 0.75,
      sizeAttenuation: true, fog: false
    });
    snow = new THREE.Points(g, m);
    snow.frustumCulled = false;
    snow.renderOrder = 2;
    scene.add(snow);
  })();

  /* ================================================================
     2. 虚拟滚动
     ================================================================ */
  var scrollTgt = 0, scrollCur = 0;
  var boost = 0;

  function clampScroll(v) { return Math.max(0, Math.min(NSEC - 1, v)); }

  window.addEventListener('wheel', function (e) {
    if (!entered) { e.preventDefault(); return; }
    e.preventDefault();
    scrollTgt = clampScroll(scrollTgt + e.deltaY * 0.0011);
  }, { passive: false });

  var touchY = null;
  window.addEventListener('touchstart', function (e) {
    touchY = e.touches && e.touches[0] ? e.touches[0].clientY : null;
  }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (!entered || touchY === null) return;
    var y = e.touches && e.touches[0] ? e.touches[0].clientY : touchY;
    scrollTgt = clampScroll(scrollTgt + (touchY - y) * 0.0016);
    touchY = y;
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (!entered) return;
    var k = e.key;
    if (k === 'ArrowDown' || k === 'PageDown' || k === ' ') {
      scrollTgt = clampScroll(Math.floor(scrollTgt + 1.0001));
      e.preventDefault();
    } else if (k === 'ArrowUp' || k === 'PageUp') {
      scrollTgt = clampScroll(Math.ceil(scrollTgt - 1.0001));
      e.preventDefault();
    }
  });

  /* ================================================================
     3. 叙事关键帧（纯风景 → 全靠相机运动叙事）
     ================================================================ */
  /* 每幕：相机位置(px,py,pz) + 视线目标(lx,ly,lz)。
     极光抬到 54 之后，视线的基准高度也要跟着抬，否则极光会顶到画面上缘外面。 */
  var KEYS = [
    { px: 0,  py: 22, pz: 62,  lx: 0,   ly: 74, lz: -150 },  /* 0 hero：仰望悬空极光 */
    { px: 48, py: 16, pz: 54,  lx: -34, ly: 68, lz: -170 },  /* 1 MESSAGE：右移侧看 */
    { px: 12, py: 66, pz: 40,  lx: 0,   ly: 6,  lz: -170 },  /* 2 第三幕：俯瞰雪原雪脊 */
    { px: 0,  py: 34, pz: 124, lx: 0,   ly: 66, lz: -230 }   /* 3 结尾：拉远全景（极光+冰川+雪原） */
  ];

  var lookTarget = new THREE.Vector3();

  function applyNarrative(p) {
    var i = Math.min(NSEC - 2, Math.floor(p));
    var f = Math.min(1, Math.max(0, p - i));
    if (i >= KEYS.length - 1) { i = KEYS.length - 2; f = 1; }
    if (i < 0) { i = 0; f = 0; }
    var a = KEYS[i], b = KEYS[i + 1];
    var e = f * f * (3 - 2 * f);   /* smoothstep 缓动 */

    camera.position.set(
      a.px + (b.px - a.px) * e,
      a.py + (b.py - a.py) * e,
      a.pz + (b.pz - a.pz) * e
    );
    lookTarget.set(
      a.lx + (b.lx - a.lx) * e,
      a.ly + (b.ly - a.ly) * e,
      a.lz + (b.lz - a.lz) * e
    );
    camera.lookAt(lookTarget);
  }

  /* v4（2026-09-29）：把「进入的幕」的浮现时机推到**滑过半幕之后**。
     旧曲线 op = 1 - |d|*1.35 —— |d|=0.74 就开始浮现，也就是刚往下滑
     三分之一就能看到下一幕的字，太快；参考站 index.anheyu.com 的手感
     是「滚到一半，文字才开始出来」。
     现在分两条：
       · d < 0（还没滚到的幕）：|d| 从 0.50 → 0 才淡入，并用 smoothstep
         把权重压在后半段 —— 过半才有字、接近幕位才清晰；
       · d > 0（已滚过的幕）：沿用原斜率（|d|=0.74 归零），退场不拖沓。
     两幕在 |d| 0.50~0.74 之间做一次交叉淡变，中间不会出现整屏空白。 */
  function applyCopy(p) {
    for (var i = 0; i < secs.length; i++) {
      var d = p - i;
      var ad = Math.abs(d);
      var el = secs[i];
      if (ad >= 1.05) {
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        continue;
      }
      var op;
      if (d < 0) {
        var k = (0.5 - ad) / 0.5;          /* |d|=0.50 → 0，|d|=0 → 1 */
        k = k < 0 ? 0 : (k > 1 ? 1 : k);
        op = k * k * (3 - 2 * k);          /* smoothstep：起步更慢 */
      } else {
        op = 1 - ad * 1.35;
      }
      op = op < 0 ? 0 : (op > 1 ? 1 : op);
      el.style.visibility = 'visible';
      el.style.opacity = op.toFixed(3);
      var ty = d * -46;
      el.style.transform = 'translate3d(0,' + ty.toFixed(1) + 'px,0)';
      el.style.pointerEvents = ad < 0.5 ? 'auto' : 'none';
    }
  }

  function applyBar(p) {
    if (!bar) return;
    var track = bar.parentNode;
    var th = track.clientHeight - bar.clientHeight;
    bar.style.transform = 'translate3d(0,' + (p / (NSEC - 1) * th).toFixed(1) + 'px,0)';
  }

  /* ================================================================
     4. 闸门时序 + 主循环
     ================================================================ */
  var loadDone = false, entered = false;
  var enterTxt = (gate && gate.getAttribute('data-enter')) || '点击任意处进入';

  function markLoad(f) {
    if (gateFill) gateFill.style.width = (f * 100).toFixed(1) + '%';
    if (f >= 1 && !loadDone) {
      loadDone = true;
      if (gateHint) gateHint.textContent = enterTxt;
      window.setTimeout(function () { if (!entered) enter(); }, 2300);
    }
  }

  function enter() {
    if (entered) return;
    entered = true;
    if (gate) gate.classList.add('is-done');
    /* 通知音乐模块可以开播了 —— 约定与 /profile/ 一致（自定义事件 pf:enter，
       见 js/music.js）。放在这里是因为"进入"通常由用户点击触发，
       浏览器的自动播放手势要求才满足。
       ⚠️ 若闸门是 2.3s 后自动进入（用户没点过页面），play() 会被浏览器拒绝 ——
          music.js 里已 catch 成"未播放"，不起播也不报错。 */
    try { document.dispatchEvent(new CustomEvent('pf:enter')); } catch (e) {}
    window.setTimeout(function () {
      if (gate && gate.parentNode) gate.style.display = 'none';
    }, 1200);
  }
  if (gate) gate.addEventListener('click', enter);

  /* 没有外部资源要加载 —— 进度条走一段「生成极光」的短动画，
     同时第一帧的着色器编译是真实开销。 */
  var loadT0 = Date.now();
  function loadTick() {
    if (loadDone) return;
    var k = Math.min(1, (Date.now() - loadT0) / 1300);
    markLoad(k < 1 ? Math.pow(k, 0.55) * 0.985 : 1);
  }

  /* ---------- resize ---------- */
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------- 主循环 ---------- */
  var last = Date.now();
  var paused = false;
  var simTime = 0;              /* 极光自己的时间轴 —— reduced-motion 时放慢 */
  document.addEventListener('visibilitychange', function () {
    paused = document.hidden;
    last = Date.now();
  });

  function frame() {
    requestAnimationFrame(frame);
    if (paused) return;
    var now = Date.now();
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    simTime += dt * (reduceMotion ? 0.3 : 1);
    var t = simTime;

    loadTick();

    /* 滚动缓动 → boost（滚动越快，极光越亮、雪越急） */
    var d = scrollTgt - scrollCur;
    scrollCur += d * Math.min(1, dt * 3.2);
    if (Math.abs(d) < 0.0004) scrollCur = scrollTgt;
    var tgtBoost = reduceMotion ? 0 : Math.min(1, Math.abs(d) * 2.4);
    boost += (tgtBoost - boost) * Math.min(1, dt * 4.5);

    auroraMat.uniforms.uTime.value = t;
    auroraMat.uniforms.uBoost.value = boost;
    auroraMat.uniforms.uAlpha.value = 1.0 + boost * 0.18;

    /* 雪粒下落 + 横向漂移 */
    var sp = snow.geometry.attributes.position.array;
    var kBoost = 0.8 + boost * 2.4;
    for (var i = 0; i < SNOW_N; i++) {
      sp[i * 3] += snowDrift[i] * dt * kBoost;
      sp[i * 3 + 1] -= snowFall[i] * dt * kBoost;
      sp[i * 3 + 2] += 0.9 * dt;
      if (sp[i * 3 + 1] < 0) {
        sp[i * 3 + 1] += SNOW_TOP;
        sp[i * 3] = -115 + Math.random() * 230;
      }
      if (sp[i * 3] > 115) sp[i * 3] -= 230;
    }
    snow.geometry.attributes.position.needsUpdate = true;

    /* 叙事 */
    var p = Math.min(NSEC - 1, Math.max(0, scrollCur));
    applyNarrative(p);
    applyCopy(p);
    applyBar(p);

    /* 引导条 */
    if (guide) {
      if (p > 0.18) root.classList.add('gone-guide');
      else root.classList.remove('gone-guide');
    }

    renderer.render(scene, camera);
  }
  frame();

  /* 调试钩子（验证脚本用）
     ⚠️ 用 getter 暴露滚动/boost —— 直接写值只会把「脚本启动那一刻」的快照进去。 */
  window.__clDebug = {
    renderer: renderer, scene: scene, camera: camera,
    aurora: auroraMat,
    snow: snow, stars: stars, ground: snowGround,
    count: { snow: SNOW_N, secs: NSEC },
    get scroll() { return scrollCur; },
    get target() { return scrollTgt; },
    get boost() { return boost; },
    get gate() { return { loadDone: loadDone, entered: entered }; }
  };
})();
