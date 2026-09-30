/* ============================================================
   极地 · 极光冰原 · /clouds/ v2「Aurora in the Sky」
   ------------------------------------------------------------------
   v2 相对 v1（视觉已定稿的那一版）的三处改动：
     ① 极光从「贴地平线长出的光柱」改为「悬在中天的光帘」
        —— 帘脚整体抬到空中，且每片帘脚高度参差，形成垂坠感
     ② 新增起伏雪原（PlaneGeometry 顶点位移 + 顶点色，近处平雪壳、
        远处起雪脊，脊顶被极光照亮）
     ③ 冰脊剪影 → 远景冰川群（尖化山脊 + 下暗上亮的冰面着色 + 雪线）
   另加天空穹顶（天顶近黑 → 地平线深蓝），让「天空」本身有层次，
   也才托得住悬空的极光。

   全自研 three.js r112，**零外部模型/贴图**（贴图用 canvas 现画）。
   依赖：three.r112.js（page.ejs 里在本文件之前加载）。
   备份：v1 绘画化云海 → .workbuddy/clouds-v1-backup/
         v2 霓虹隧道奔跑者 → .workbuddy/clouds-v2-backup/
         极地 v1（贴地极光）→ .workbuddy/polar-v1-backup/

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

  /* 极光帘脚悬在空中的高度。
     ⚠️ v1 是 7.0 —— 帘脚几乎贴地，视觉上就是「地上立起一排光柱」。
        v2 抬到 54（约两倍冰川峰高），整条帘幕挂在中天。
        另外每片帘布还会在 shader 里按相位各自上下错开 ±11，形成垂坠。 */
  var AURORA_BASE = 54.0;

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

  /* ---------- 悬空极光幕（核心） ----------
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
    /* v2：整片帘布微微倾斜（真实极光的幕是有斜度的），
       再让帘脚各自上下错开 —— 垂坠感的关键，否则是一排齐刷刷的光柱 */
    '  float tilt = sin(ph * 2.3) * 7.0;',
    '  float foot = (sin(ph * 3.7) * 0.6 + sin(ph * 7.9) * 0.4) * 11.0;',
    '  float x = x0 + sway * lift + position.x * w + bend * lift',
    '          + (position.y - 0.5) * tilt;',
    '  float y = ' + AURORA_BASE.toFixed(1) + ' + foot + position.y * h;',
    /* 倒影层：以「帘脚所在高度」为轴压扁镜像。
       ⚠️ v1 是 -y * 0.62，那时 base=7 贴在冰面上所以成立；
          base 抬到 54 后再这么算，倒影会落到雪面以下 33 单位去，
          视差乱跑。改成相对帘脚压缩 —— 帘脚落在雪面，帘顶向下延伸。 */
    '  float ym = -(y - ' + AURORA_BASE.toFixed(1) + ') * 0.25;',
    '  y = mix(y, ym, uMirror);',
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
    'float fbm(vec2 p){',
    '  float v = 0.0, a = 0.55;',
    '  for (int k = 0; k < 3; k++) {',
    '    v += a * vnoise(p);',
    '    p = p * 2.1 + vec2(7.3, 3.1);',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    'void main(){',
    /* 参考挪威极光实拍：主体是**弥漫在天上的连续光带/光云**，
       大尺度云团做主亮度，竖帘只留隐约的褶。
       vBright 兼作每片帘布的噪声种子，让云团不重复。 */
    '  float flow = uTime * 0.22;',
    '  float cloud = fbm(vec2(vUv.x * 3.0, vUv.y * 1.7 - flow) + vBright * 13.7);',
    '  cloud = 0.32 + 0.68 * cloud;',
    /* 隐约的竖帘褶（弱化成细节纹理） */
    '  float lanes = 14.0 + 20.0 * (1.0 - vUv.y);',
    '  float n2 = vnoise(vec2(vUv.x * lanes * 2.2 + 11.0, vUv.y * 3.5 - uTime * 0.55));',
    '  float veil = 0.70 + 0.30 * n2;',
    /* 水平：宽过渡 —— 帘布相互叠成连续光带，不再是一簇簇分离的光柱 */
    '  float side = 1.0 - smoothstep(0.30, 0.50, abs(vUv.x));',
    /* 竖直：下缘清晰偏亮、上缘弥散渐隐（真极光的能量分布）。
       ⚠️ pow 指数别超过 ~1.3：过大整片只剩帘脚一丝光 */
    '  float foot = smoothstep(-0.03, 0.08, vUv.y);',
    '  float vert = foot * pow(max(0.0, 1.0 - vUv.y), 1.15);',
    /* 远处大气消光 */
    '  float depth = 1.0 - smoothstep(90.0, 250.0, -vZ);',
    '  float f = side * vert * depth * cloud * veil;',
    /* 亮心泛白（实拍里高光处中心是发白的） */
    '  float hot = smoothstep(0.60, 0.97, f);',
    '  vec3 c = mix(vColor, vColor2, smoothstep(0.05, 0.95, vUv.y));',
    '  c = mix(c, vec3(0.90, 1.0, 0.94), hot * 0.5);',
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

    /* 帘布按「极光系统」成组横跨视野。参考实拍后系统间隙收窄 ——
       真极光是连续光带，帘布要相互重叠（v2 是一簇簇分离的光柱） */
    var NSYS = Math.max(3, Math.round(count / 12));
    var SPREAD = AURORA_SPREAD;   /* 见上方说明：按视口宽高比，不按 UA */
    var sysX = [];
    for (var s = 0; s < NSYS; s++) {
      sysX.push(-SPREAD / 2 + (NSYS <= 1 ? 0.5 : s / (NSYS - 1)) * SPREAD
                + (Math.random() - 0.5) * 34);
    }

    for (var i = 0; i < count; i++) {
      var sx = sysX[i % NSYS];
      var x0 = sx + (Math.random() - 0.5) * 190;
      var z = -55 - Math.random() * 165;
      var near = 1 - Math.min(1, (-z - 55) / 165);            /* 近=1 远=0 */
      /* 更宽更高：帘布相互重叠成连续光带（v2 是 24~76 宽、42~98 高，
         片与片之间露出黑隙，观感像竖起的光柱阵列） */
      var w = 46 + Math.random() * 92;
      var h = (64 + Math.random() * 88) * (0.76 + 0.44 * near);
      var br = (0.30 + Math.pow(Math.random(), 1.2) * 0.72) * (0.46 + 0.52 * near);
      var ph = Math.random() * Math.PI * 2;
      var sp = 0.7 + Math.random() * 0.85;
      /* 实拍里基本纯绿 + 白心：帘脚绿/青为主，帘顶暗绿渐隐，紫只留少量 */
      var rb = Math.random();
      var cb = rb < 0.60 ? COL.green : (rb < 0.90 ? COL.teal : COL.cyan);
      var rt = Math.random();
      var ct = rt < 0.58
        ? new THREE.Color(COL.green.r * 0.5, COL.green.g * 0.5, COL.green.b * 0.5)
        : (rt < 0.72 ? COL.violet : COL.cyan);

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
      depthTest: !mirror,          /* 倒影层关深度测试，直接叠在雪面上 */
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = mirror ? 1 : 3;
    scene.add(mesh);
    return mat;
  }

  var AURORA_N = isMobile ? 22 : 36;   /* 片数减半、单片翻倍 —— 叠成连续光带 */
  var auroraMat = buildAurora(AURORA_N, false);
  var auroraReflMat = buildAurora(AURORA_N, true);

  /* ---------- 天空辉光（极光整体的辉光，托住悬空的帘幕） ---------- */
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
  /* 四层纵深。峰高刻意压在 72 以内 —— 极光帘脚在 54，
     远山太高会把极光下缘整条吃掉，看起来又变回「山后面升起的极光」。
     峰顶色必须明显亮于远处雪原（cFar），否则冰川会淹没在雪原里（v2a 教训） */
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
    auroraReflMat.uniforms.uTime.value = t;
    auroraReflMat.uniforms.uAlpha.value = 0.10 + boost * 0.05;

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
    aurora: auroraMat, auroraRefl: auroraReflMat,
    snow: snow, stars: stars, ground: snowGround,
    count: { aurora: AURORA_N, snow: SNOW_N, secs: NSEC },
    auroraBase: AURORA_BASE,
    get scroll() { return scrollCur; },
    get target() { return scrollTgt; },
    get boost() { return boost; },
    get gate() { return { loadDone: loadDone, entered: entered }; }
  };
})();
