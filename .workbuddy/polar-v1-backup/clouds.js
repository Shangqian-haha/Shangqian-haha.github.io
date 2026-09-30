/* ============================================================
   极地 · 极光冰原 · /clouds/ v3「Aurora」
   ------------------------------------------------------------------
   全自研 three.js r112 场景，**零外部模型/贴图**（贴图用 canvas 现画）。
   依赖：three.r112.js（page.ejs 里在本文件之前加载）。
   备份：v1 绘画化云海 → .workbuddy/clouds-v1-backup/
         v2 霓虹隧道奔跑者 → .workbuddy/clouds-v2-backup/

   结构：
     0. 渐进增强闸门   —— WebGL 可用才 js-on，否则文档流兜底
     1. 三维场景       —— 极夜雾 / 星空 / 极光幕(合并几何) / 冰脊剪影
                          / 冰原 / 冰面倒影 / 雪粒
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
  var AURORA_BASE = 7.0;        /* 极光帘脚离冰面的高度 */

  var COL = {
    bg:     0x040711,                                   /* 极夜近黑 */
    fog:    0x061324,                                   /* 夜雾（冰蓝黑） */
    ground: 0x051120,
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
  scene.fog = new THREE.Fog(COL.fog, 280, 980);

  var camera = new THREE.PerspectiveCamera(60, 1, 0.5, 1600);
  camera.position.set(0, 7, 46);

  /* ---------- canvas 现画贴图 ---------- */
  function radialTex(inner, outer) {
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
    return t;
  }
  var softTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  var sheenTex = radialTex('rgba(150,225,255,0.85)', 'rgba(90,170,255,0)');

  /* ---------- 冰原 ---------- */
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshBasicMaterial({ color: COL.ground, fog: true })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -600);
  scene.add(ground);

  /* 冰面的冷光晕（极光落在冰上的一层反光） */
  var iceSheen = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 1100),
    new THREE.MeshBasicMaterial({
      map: sheenTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.20, fog: true
    })
  );
  iceSheen.rotation.x = -Math.PI / 2;
  iceSheen.position.set(0, 0.06, -300);
  scene.add(iceSheen);

  /* ---------- 极光幕（核心） ----------
     合并 BufferGeometry：每片帘布 6 列 × 2 行 = 12 顶点。
     ⚠️ 淡出必须全部在 fragment 里算（v2 踩过：quad 只有 4 个顶点，
        顶点级淡出会让两端顶点算出的 fade 都是 0，整个物体消失）。 */
  var auroraVert = [
    'precision highp float;',
    'attribute vec2 position;',   /* x: 帘宽 -0.5~0.5   y: 帘高 0~1 */
    'attribute vec4 aData1;',     /* x0, z, height, width */
    'attribute vec3 aData2;',     /* phase, bright, speed */
    'attribute vec3 aColor;',     /* 帘脚色 */
    'attribute vec3 aColor2;',    /* 帘顶色 */
    'uniform mat4 projectionMatrix;',
    'uniform mat4 modelViewMatrix;',
    'uniform float uTime;',
    'uniform float uMirror;',
    'varying vec2 vUv;',
    'varying vec3 vColor;',
    'varying vec3 vColor2;',
    'varying float vBright;',
    'varying float vZ;',
    'void main(){',
    '  float x0 = aData1.x;',
    '  float z  = aData1.y;',
    '  float h  = aData1.z;',
    '  float w  = aData1.w;',
    '  float ph = aData2.x;',
    '  float sp = aData2.z;',
    /* 帘布整体低频漂移 + 顶点级起伏（越靠帘顶摆得越大） */
    '  float sway = sin(uTime * 0.15 * sp + ph) * 8.0',
    '             + sin(uTime * 0.061 * sp + ph * 2.7) * 5.0;',
    '  float lift = 0.35 + 0.65 * position.y;',
    '  float bend = sin(uTime * 0.11 * sp + ph + position.x * 2.1) * 3.6;',
    '  float x = x0 + sway * lift + position.x * w + bend * lift;',
    '  float y = ' + AURORA_BASE.toFixed(1) + ' + position.y * h;',
    /* 倒影层：以冰面为轴镜像并压扁（配合 depthTest:false 贴在冰面上） */
    '  y = mix(y, -y * 0.62, uMirror);',
    '  vUv = position;',
    '  vColor = aColor;',
    '  vColor2 = aColor2;',
    '  vBright = aData2.y;',
    '  vZ = z;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, z, 1.0);',
    '}'
  ].join('\n');

  var auroraFrag = [
    'precision highp float;',
    'varying vec2 vUv;',
    'varying vec3 vColor;',
    'varying vec3 vColor2;',
    'varying float vBright;',
    'varying float vZ;',
    'uniform float uTime;',
    'uniform float uAlpha;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
    /* 平滑值噪声：直接用 hash 离散取块会是一格一格的方块（v3 第一版就长这样），
       必须做双线性插值才是连绵的「帘褶」。 */
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
    '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',
    'void main(){',
    /* 竖向帘褶：越靠帘脚越细，低频成束 + 高频起丝 */
    '  float lanes = 20.0 + 30.0 * (1.0 - vUv.y);',
    '  float n1 = vnoise(vec2(vUv.x * lanes, vUv.y * 2.4 - uTime * 0.42));',
    '  float n2 = vnoise(vec2(vUv.x * lanes * 2.7 + 11.0, vUv.y * 6.0 - uTime * 0.9));',
    '  float stripe = (0.45 + 0.55 * n1) * (0.65 + 0.35 * n2);',
    /* 沿帘高缓慢上爬的光波 */
    '  float wave = 0.5 + 0.5 * sin(vUv.y * 6.0 - uTime * 0.7 + n1 * 6.283);',
    '  stripe *= 0.60 + 0.40 * wave;',
    /* 水平：中间厚两边薄 */
    '  float side = 1.0 - smoothstep(0.14, 0.44, abs(vUv.x));',
    /* 竖直：帘脚最亮、向上衰减（真极光的能量分布）。
       ⚠️ 指数别超过 ~1.3：1.7 时整片只剩帘脚一丝光（v3a 就是这么调暗的） */
    '  float foot = smoothstep(-0.10, 0.16, vUv.y);',
    '  float vert = foot * pow(max(0.0, 1.0 - vUv.y), 1.25);',
    /* 远处大气消光 */
    '  float depth = 1.0 - smoothstep(90.0, 250.0, -vZ);',
    '  float f = side * vert * depth * stripe;',
    /* 帘脚青绿 → 帘顶紫粉 */
    '  vec3 c = mix(vColor, vColor2, smoothstep(0.0, 0.9, vUv.y));',
    '  gl_FragColor = vec4(c * f * vBright * uAlpha, 1.0);',
    '}'
  ].join('\n');

  /* 极光系统的横向铺开范围。
     ⚠️ 必须按视口宽高比定，不能按 UA：竖屏的水平视场只有桌面的一半不到，
        铺太宽帘布会全跑到画面外（首拍 414 视口几乎全黑就是这个原因）；
        反过来桌面按手机宽度铺又会挤成一整片。
     只在初始化时算一次 —— 旋转屏幕后需刷新（极少数场景，不值得为此重建几何）。 */
  var AURORA_SPREAD = (window.innerWidth / Math.max(1, window.innerHeight)) >= 1
    ? 1120 : 110;

  function buildAurora(count, mirror) {
    var C = 6, R = 2, VPC = C * R;
    var nv = count * VPC;
    var pos = new Float32Array(nv * 2);
    var d1 = new Float32Array(nv * 4);
    var d2 = new Float32Array(nv * 3);
    var cA = new Float32Array(nv * 3);
    var cB = new Float32Array(nv * 3);
    var idx = new Uint16Array(count * (C - 1) * (R - 1) * 6);  /* 顶点数 < 65536 */
    var ip = 0;

    /* 帘布按「极光系统」成组横跨视野，**系统之间留黑** —— 才有极夜的空隙感
       （v3 第一版均匀撒满全屏，糊成一整片，像光带隧道不像极光） */
    var NSYS = Math.max(3, Math.round(count / 9));
    var SPREAD = AURORA_SPREAD;   /* 见上方说明：按视口宽高比，不按 UA */
    var sysX = [];
    for (var s = 0; s < NSYS; s++) {
      sysX.push(-SPREAD / 2 + (NSYS <= 1 ? 0.5 : s / (NSYS - 1)) * SPREAD
                + (Math.random() - 0.5) * 60);
    }

    for (var i = 0; i < count; i++) {
      var sx = sysX[i % NSYS];
      var x0 = sx + (Math.random() - 0.5) * 150;
      var z = -55 - Math.random() * 165;
      var near = 1 - Math.min(1, (-z - 55) / 165);            /* 近=1 远=0 */
      var w = 24 + Math.random() * 52;
      var h = (52 + Math.random() * 62) * (0.74 + 0.46 * near);
      var br = (0.38 + Math.pow(Math.random(), 1.2) * 0.95) * (0.42 + 0.55 * near);
      var ph = Math.random() * Math.PI * 2;
      var sp = 0.7 + Math.random() * 0.85;
      var rb = Math.random();
      var cb = rb < 0.46 ? COL.green : (rb < 0.84 ? COL.teal : COL.cyan);
      var rt = Math.random();
      var ct = rt < 0.42 ? COL.violet : (rt < 0.68 ? COL.pink : COL.cyan);

      for (var c = 0; c < C; c++) {
        var px = c / (C - 1) - 0.5;
        for (var r = 0; r < R; r++) {
          var py = r / (R - 1);
          var vi = i * VPC + c * R + r;
          pos[vi * 2] = px;
          pos[vi * 2 + 1] = py;
          d1[vi * 4] = x0; d1[vi * 4 + 1] = z;
          d1[vi * 4 + 2] = h; d1[vi * 4 + 3] = w;
          d2[vi * 3] = ph; d2[vi * 3 + 1] = br; d2[vi * 3 + 2] = sp;
          cA[vi * 3] = cb.r; cA[vi * 3 + 1] = cb.g; cA[vi * 3 + 2] = cb.b;
          cB[vi * 3] = ct.r; cB[vi * 3 + 1] = ct.g; cB[vi * 3 + 2] = ct.b;
        }
      }
      var base = i * VPC;
      for (var c2 = 0; c2 < C - 1; c2++) {
        for (var r2 = 0; r2 < R - 1; r2++) {
          var a0 = base + c2 * R + r2;
          var a1 = base + (c2 + 1) * R + r2;
          var a2 = a0 + 1;
          var a3 = a1 + 1;
          idx[ip++] = a0; idx[ip++] = a1; idx[ip++] = a2;
          idx[ip++] = a1; idx[ip++] = a3; idx[ip++] = a2;
        }
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 2));
    geo.setAttribute('aData1', new THREE.BufferAttribute(d1, 4));
    geo.setAttribute('aData2', new THREE.BufferAttribute(d2, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(cA, 3));
    geo.setAttribute('aColor2', new THREE.BufferAttribute(cB, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));

    var mat = new THREE.RawShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBoost: { value: 0 },
        uMirror: { value: mirror ? 1 : 0 },
        uAlpha: { value: mirror ? 0.22 : 1.0 }
      },
      vertexShader: auroraVert,
      fragmentShader: auroraFrag,
      transparent: true,
      depthWrite: false,
      depthTest: !mirror,          /* 倒影层关深度测试，直接叠在冰面上 */
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = mirror ? 1 : 3;
    scene.add(mesh);
    return mat;
  }

  var AURORA_N = isMobile ? 32 : 54;   /* 54 = 6 个极光系统 × 每系统 9 片帘布 */
  var auroraMat = buildAurora(AURORA_N, false);
  var auroraReflMat = buildAurora(AURORA_N, true);

  /* ---------- 星空 ---------- */
  var stars = null;
  (function () {
    var n = isMobile ? 300 : 620;
    var p = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 1500;
      p[i * 3 + 1] = 6 + Math.pow(Math.random(), 0.75) * 300;
      p[i * 3 + 2] = -120 - Math.random() * 780;
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

  /* ---------- 冰脊剪影 ---------- */
  function buildRidge(z, baseY, amp, seed, fillHex, lineHex) {
    /* 多频正弦叠加 → 起伏自然的山脊线（不用随机数，保证每次一致） */
    var N = 72;
    var pts = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N;
      var y = baseY
        + Math.sin(t * 9.1 + seed) * amp * 0.55
        + Math.sin(t * 23.7 + seed * 2.1) * amp * 0.28
        + Math.sin(t * 51.3 + seed * 3.7) * amp * 0.17;
      pts.push([-900 + t * 1800, Math.max(1.5, y)]);
    }
    var verts = [], index = [], k = 0;
    for (var j = 0; j < N; j++) {
      var a = pts[j], b = pts[j + 1];
      verts.push(a[0], a[1], z, b[0], b[1], z, a[0], -40, z, b[0], -40, z);
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      k += 4;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.setIndex(index);
    var mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: fillHex, fog: true, side: THREE.DoubleSide
    }));
    mesh.frustumCulled = false;
    scene.add(mesh);

    /* 山脊上的雪线高光 */
    var lp = [];
    for (var m2 = 0; m2 <= N; m2++) { lp.push(pts[m2][0], pts[m2][1], z + 1.2); }
    var lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
    var line = new THREE.Line(lg, new THREE.LineBasicMaterial({
      color: lineHex, transparent: true, opacity: 0.75, fog: true
    }));
    line.frustumCulled = false;
    scene.add(line);
  }
  buildRidge(-470, 34, 34, 0.7,  0x0a1e38, 0x2b6285);
  buildRidge(-300, 22, 26, 2.4,  0x081629, 0x35708f);
  buildRidge(-165, 12, 16, 5.1,  0x050e1c, 0x2c6a7c);

  /* ---------- 雪粒 ---------- */
  var SNOW_N = isMobile ? 320 : 620;
  var snow = null, snowFall = null, snowDrift = null;
  (function () {
    var p = new Float32Array(SNOW_N * 3);
    snowFall = new Float32Array(SNOW_N);
    snowDrift = new Float32Array(SNOW_N);
    for (var i = 0; i < SNOW_N; i++) {
      p[i * 3] = (Math.random() - 0.5) * 190;
      p[i * 3 + 1] = -5 + Math.random() * 62;
      p[i * 3 + 2] = -175 + Math.random() * 235;
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
  /* 每幕：相机位置(px,py,pz) + 视线目标(lx,ly,lz) */
  var KEYS = [
    { px: 0,  py: 7,  pz: 46, lx: 0,   ly: 46, lz: -110 },  /* 0 hero：仰视极光穹顶 */
    { px: 30, py: 6,  pz: 38, lx: -18, ly: 40, lz: -130 },  /* 1 MESSAGE：右移，极光偏左 */
    { px: 6,  py: 30, pz: 26, lx: 0,   ly: 26, lz: -160 },  /* 2 第三幕：升高俯瞰冰原 */
    { px: 0,  py: 10, pz: 70, lx: 0,   ly: 54, lz: -150 }   /* 3 结尾：拉远，全景 */
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
      var op = Math.max(0, 1 - ad * 1.35);
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
    window.setTimeout(function () {
      if (gate && gate.parentNode) gate.style.display = 'none';
    }, 1200);
  }
  if (gate) gate.addEventListener('click', enter);

  /* v3 没有外部资源要加载 —— 进度条走一段「生成极光」的短动画，
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
    auroraReflMat.uniforms.uTime.value = t;
    auroraReflMat.uniforms.uAlpha.value = 0.22 + boost * 0.08;

    /* 雪粒下落 + 横向漂移 */
    var sp = snow.geometry.attributes.position.array;
    var kBoost = 0.8 + boost * 2.4;
    for (var i = 0; i < SNOW_N; i++) {
      sp[i * 3] += snowDrift[i] * dt * kBoost;
      sp[i * 3 + 1] -= snowFall[i] * dt * kBoost;
      sp[i * 3 + 2] += 0.9 * dt;
      if (sp[i * 3 + 1] < -5) {
        sp[i * 3 + 1] += 62;
        sp[i * 3] = -95 + Math.random() * 190;
      }
      if (sp[i * 3] > 95) sp[i * 3] -= 190;
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
    aurora: auroraMat, auroraRefl: auroraReflMat, snow: snow, stars: stars,
    count: { aurora: AURORA_N, snow: SNOW_N, secs: NSEC },
    get scroll() { return scrollCur; },
    get target() { return scrollTgt; },
    get boost() { return boost; },
    get gate() { return { loadDone: loadDone, entered: entered }; }
  };
})();
