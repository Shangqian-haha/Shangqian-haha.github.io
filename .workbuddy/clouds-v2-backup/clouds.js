/* ============================================================
   云海之上 · /clouds/ v2「霓虹隧道奔跑者」
   ------------------------------------------------------------------
   复刻 index.anheyu.com（Lusion.co 风格）的视觉效果，代码自研。
   依赖：three.r112.js + GLTFLoader.js（page.ejs 里在本文件之前加载）。
   资源：/img/runner/female.glb（自带 Run/Jump/Slide 动画）、sprite.png。
   （v1 绘画化云海整页备份在 .workbuddy/clouds-v1-backup/。）

   结构：
     0. 渐进增强闸门   —— WebGL 可用才 js-on，否则文档流兜底
     1. 三维场景       —— 雾 / 地面 / 霓虹光带隧道(Instanced) / 星尘
     2. 跑者           —— GLB 线框化 + Run 动画 + 脚下光斑 + 粒子尾迹
     3. 虚拟滚动       —— wheel/touch/键盘 → tgt，每帧缓动，滚动加速光带
     4. 叙事           —— 4 个关键帧（相机 + 跑者）随进度插值 + 文字层驱动
     5. 闸门时序       —— 加载进度 → 自动/点击进入
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
  var TUNNEL_LEN = 300;         // 光带循环长度
  var COL = {
    bg:    0x070b1e,
    fog:   0x0a1030,
    pink:  new THREE.Color(1.0, 0.30, 0.62),
    blue:  new THREE.Color(0.32, 0.78, 1.0),
    white: new THREE.Color(0.92, 0.96, 1.0)
  };

  var renderer = new THREE.WebGLRenderer({
    canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
  });
  renderer.setClearColor(COL.bg, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COL.fog, 0.016);

  var camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
  camera.position.set(0, 3.2, 0);

  /* ---------- 地面 ---------- */
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 600),
    new THREE.MeshBasicMaterial({ color: 0x060a20 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -160);
  scene.add(ground);

  /* 地面中心的紫色光晕（截图中底部那团紫光） */
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

  /* 柔和圆点粒子贴图（原站的 sprite.png 是四帧图集，不能直接当 PointsMaterial 的 map） */
  var softTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  var glowTex = radialTex('rgba(110,80,220,0.55)', 'rgba(110,80,220,0)');
  var groundGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 220),
    new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.45
    })
  );
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.set(0, 0.05, -70);
  scene.add(groundGlow);

  /* ---------- 霓虹光带隧道（InstancedBufferGeometry） ---------- */
  var streakVert = [
    'precision highp float;',
    'attribute vec2 position;',          // x: 宽度(-.5~.5)  y: 沿长度(0~1)
    'attribute vec3 aData1;',            // angle, radius, z0
    'attribute vec3 aData2;',            // speed, len, bright
    'attribute vec3 aColor;',
    'uniform mat4 projectionMatrix;',
    'uniform mat4 modelViewMatrix;',
    'uniform float uTime;',
    'uniform float uBoost;',
    'uniform float uLen;',
    'varying vec3 vColor;',
    'varying float vY;',   /* 沿光带长度 0~1，fragment 里算端部淡出 */
    'varying float vZ;',   /* 循环坐标，fragment 里算远处淡出 */
    'void main(){',
    '  float sp = aData2.x * (10.0 + 42.0 * uBoost);',
    '  float z = mod(aData1.z + uTime * sp, uLen);',
    '  float along = (position.y - 0.5) * aData2.y;',
    '  float ang = aData1.x;',
    '  float rad = aData1.y;',
    '  vec3 p;',
    '  p.x = cos(ang) * rad + position.x * (0.10 + 0.34 * aData2.z);',
    '  p.y = sin(ang) * rad * 0.72 + 2.6;',
    '  p.z = -30.0 - z + along;',
    '  vColor = aColor * (0.45 + 0.55 * aData2.z);',
    '  vY = position.y;',
    '  vZ = z;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var streakFrag = [
    'precision highp float;',
    'varying vec3 vColor;',
    'varying float vY;',
    'varying float vZ;',
    'uniform float uLen;',
    'uniform float uAlpha;',
    /* ⚠️ 淡出必须在 fragment 里算：quad 只有 4 个顶点，顶点级淡出会让
          两端顶点 vFade=0，fragment 全是 0 插 0 —— 整个光带消失。 */
    'void main(){',
    '  float fade = smoothstep(0.0, 0.18, vY) * (1.0 - smoothstep(0.82, 1.0, vY));',
    '  fade *= 1.0 - smoothstep(uLen * 0.55, uLen, vZ);',
    '  gl_FragColor = vec4(vColor * fade * uAlpha, 1.0);',
    '}'
  ].join('\n');

  function buildStreaks(count, mirror) {
    /* 合并几何（不用 InstancedBufferGeometry —— r112 该路径在部分驱动下不稳）：
       每根光带 4 顶点 2 三角，逐顶点带 aData1/aData2/aColor。 */
    var pos = new Float32Array(count * 4 * 2);
    var d1 = new Float32Array(count * 4 * 3);
    var d2 = new Float32Array(count * 4 * 3);
    var col = new Float32Array(count * 4 * 3);
    var idx = new Uint16Array(count * 6);   /* 顶点数 < 65536，Uint16 免扩展 */
    var QUAD = [-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1];
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;                    // 角度
      var rad = 8.0 + Math.pow(Math.random(), 1.2) * 26.0;      // 半径 8~34（贴近视野边缘）
      var z0 = Math.random() * TUNNEL_LEN;                      // z0
      var sp = 1.2 + Math.random() * 2.2;                       // 速度
      var len = 20.0 + Math.pow(Math.random(), 1.2) * 90.0;    // 长度（原站的光带非常长）
      var br = Math.pow(Math.random(), 1.5);                    // 亮度
      var r = Math.random();
      var c = r < 0.42 ? COL.pink : (r < 0.84 ? COL.blue : COL.white);
      for (var v = 0; v < 4; v++) {
        var vi = i * 4 + v;
        pos[vi * 2] = QUAD[v * 2];
        pos[vi * 2 + 1] = QUAD[v * 2 + 1];
        d1[vi * 3] = ang; d1[vi * 3 + 1] = rad; d1[vi * 3 + 2] = z0;
        d2[vi * 3] = sp; d2[vi * 3 + 1] = len; d2[vi * 3 + 2] = br;
        col[vi * 3] = c.r; col[vi * 3 + 1] = c.g; col[vi * 3 + 2] = c.b;
      }
      var b = i * 4;
      idx[i * 6] = b; idx[i * 6 + 1] = b + 1; idx[i * 6 + 2] = b + 2;
      idx[i * 6 + 3] = b; idx[i * 6 + 4] = b + 2; idx[i * 6 + 5] = b + 3;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 2));
    geo.setAttribute('aData1', new THREE.BufferAttribute(d1, 3));
    geo.setAttribute('aData2', new THREE.BufferAttribute(d2, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));

    var mat = new THREE.RawShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBoost: { value: 0 }, uLen: { value: TUNNEL_LEN }, uAlpha: { value: mirror ? 0.16 : 0.85 } },
      vertexShader: streakVert,
      fragmentShader: streakFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    if (mirror) { mesh.scale.y = -1; mesh.position.y = 0.1; }
    scene.add(mesh);
    return mat;
  }
  var NS = isMobile ? 320 : 620;
  var streakMat = buildStreaks(NS, false);
  buildStreaks(Math.round(NS * 0.5), true);   // 地面倒影（镜像、低透明）

  /* ---------- 星尘 ---------- */
  var dust = null, dustPos = null, dustSpd = null;
  (function () {
    var n = isMobile ? 160 : 320;
    dustPos = new Float32Array(n * 3);
    dustSpd = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 44;
      dustPos[i * 3 + 1] = Math.random() * 22 - 2;
      dustPos[i * 3 + 2] = -Math.random() * TUNNEL_LEN;
      dustSpd[i] = 2 + Math.random() * 7;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    var m = new THREE.PointsMaterial({
      size: 0.55, map: softTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0x9db8ff, opacity: 0.55, sizeAttenuation: true
    });
    dust = new THREE.Points(g, m);
    dust.frustumCulled = false;
    scene.add(dust);
  })();

  /* sprite 粒子贴图已在星尘之前定义（见上）。 */

  /* ================================================================
     2. 跑者
     ================================================================ */
  var runner = null, mixer = null, runAction = null;
  var runnerLoaded = false;

  /* 线框材质「模板」：每个 mesh 会 clone 一份再按 isSkinnedMesh 设 skinning
     （见下方 GLB 加载处，r112 必须显式开 skinning 才会做骨骼变换） */
  var wireMat = new THREE.MeshBasicMaterial({
    color: 0x54d8ff, wireframe: true, transparent: true, opacity: 0.9,
    fog: true
  });

  /* 脚下光斑 */
  var footGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 4.4),
    new THREE.MeshBasicMaterial({
      map: radialTex('rgba(190,240,255,0.9)', 'rgba(120,190,255,0)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      opacity: 0.9
    })
  );
  footGlow.rotation.x = -Math.PI / 2;
  footGlow.position.y = 0.06;
  scene.add(footGlow);

  /* ---------- 粒子尾迹 ---------- */
  var TRAIL_N = isMobile ? 120 : 220;
  var trailPos = new Float32Array(TRAIL_N * 3);
  var trailVel = new Float32Array(TRAIL_N * 3);
  var trailLife = new Float32Array(TRAIL_N);
  var trailCol = new Float32Array(TRAIL_N * 3);
  (function () {
    for (var i = 0; i < TRAIL_N; i++) { trailLife[i] = Math.random() * 1.2; }
  })();
  var trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  var trailMat = new THREE.PointsMaterial({
    size: 0.5, map: softTex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, vertexColors: true, opacity: 0.9, sizeAttenuation: true
  });
  var trail = new THREE.Points(trailGeo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);

  function spawnTrail(origin, boost) {
    for (var i = 0; i < TRAIL_N; i++) {
      if (trailLife[i] > 0) continue;
      trailPos[i * 3] = origin.x + (Math.random() - 0.2) * 1.6;
      trailPos[i * 3 + 1] = 0.4 + Math.random() * 4.2;
      trailPos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 1.2;
      trailVel[i * 3] = 2.2 + Math.random() * 2.4;                 // 人朝 -x 跑 → 尾迹向 +x
      trailVel[i * 3 + 1] = 0.4 + Math.random() * 1.4;
      trailVel[i * 3 + 2] = (Math.random() - 0.5) * 1.4 - boost * 3;
      trailLife[i] = 0.9 + Math.random() * 0.7;
      var c = Math.random() < 0.68 ? COL.blue : COL.pink;
      trailCol[i * 3] = c.r; trailCol[i * 3 + 1] = c.g; trailCol[i * 3 + 2] = c.b;
      return;
    }
  }

  /* ---------- 加载 GLB ---------- */
  var loadStart = Date.now();
  new THREE.GLTFLoader().load(
    '/img/runner/female.glb',
    function (gltf) {
      runner = gltf.scene;
      runner.traverse(function (o) {
        if (o.isMesh || o.isSkinnedMesh) {
          /* ⚠️⚠️ three r112 的致命坑：USE_SKINNING 宏只在 material.skinning === true
             时才被定义（见 three.r112.js 里 programParameters 的
             `skinning: material.skinning && 0 < boneCount`）。
             而 MeshBasicMaterial 默认 skinning = false —— 于是骨骼矩阵算了但
             从不参与顶点着色，模型永远停在**绑定姿势**，肉眼看到的就是
             「跑者一动不动 / 动画没播」。
             （r132 之后该字段被移除、改为按 isSkinnedMesh 自动判定，
               所以这条只对 r112 生效，升级 three 时必须删掉。）
             按 mesh 类型分别给材质：非蒙皮网格不能开，否则会去读不存在的
             skinIndex/skinWeight 属性。 */
          var m = wireMat.clone();
          m.skinning = !!o.isSkinnedMesh;
          o.material = m;
          o.frustumCulled = false;
        }
      });
      /* Mixamo 模型约 1.7 单位高 → 放大到场景尺度（人高 ≈ 6.8 单位） */
      runner.scale.set(4.0, 4.0, 4.0);
      /* 面朝画面左（-x）跑：模型面朝 +z → yaw -90° */
      runner.rotation.y = -Math.PI / 2;
      scene.add(runner);

      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(runner);
        var clip = gltf.animations[0];            // Run
        for (var i = 0; i < gltf.animations.length; i++) {
          if (/run/i.test(gltf.animations[i].name || '')) { clip = gltf.animations[i]; break; }
        }
        runAction = mixer.clipAction(clip);
        runAction.play();
      }
      runnerLoaded = true;
      markLoad(1);
    },
    function (xhr) {
      if (xhr && xhr.total > 0) markLoad(Math.min(0.98, xhr.loaded / xhr.total));
    },
    function () {
      /* 加载失败：闸门照样放行，页面退化为「光带隧道 + 星尘」 */
      runnerLoaded = true;
      markLoad(1);
    }
  );

  /* ================================================================
     3. 虚拟滚动
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
     4. 叙事关键帧（相机 + 跑者 + 文字层）
     ================================================================ */
  /* 每幕：runner(x, z) / camera(x, y, z) / lookAt(y) */
  var KEYS = [
    { rx: 1.6, rz: -12.5, cx: 0.0, cy: 3.2, cz: 0.0 },   // 0 hero：人居中
    { rx: -3.4, rz: -12.5, cx: 0.8, cy: 3.2, cz: 0.6 },  // 1 MESSAGE：人让到左侧
    { rx: -4.6, rz: -20.0, cx: 0.2, cy: 3.4, cz: 0.2 },  // 2 第三幕：人变远
    { rx: -2.2, rz: -30.0, cx: 0.0, cy: 3.6, cz: 0.0 }   // 3 结尾：人跑向深处
  ];

  var lookTarget = new THREE.Vector3();

  function applyNarrative(p) {
    var i = Math.min(NSEC - 2, Math.floor(p));
    var f = Math.min(1, Math.max(0, p - i));
    if (i >= KEYS.length - 1) { i = KEYS.length - 2; f = 1; }
    var a = KEYS[i], b = KEYS[i + 1];
    var e = f * f * (3 - 2 * f);   // smoothstep 缓动

    var rx = a.rx + (b.rx - a.rx) * e;
    var rz = a.rz + (b.rz - a.rz) * e;
    camera.position.set(
      a.cx + (b.cx - a.cx) * e,
      a.cy + (b.cy - a.cy) * e,
      a.cz + (b.cz - a.cz) * e
    );
    lookTarget.set(rx * 0.55, 2.9, rz);
    camera.lookAt(lookTarget);

    if (runner) {
      runner.position.set(rx, 0, rz);
    }
    footGlow.position.set(rx, 0.06, rz);
    return { rx: rx, rz: rz };
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
     5. 闸门时序 + 主循环
     ================================================================ */
  var loadDone = false, gateOpen = false, entered = false;
  function markLoad(f) {
    if (gateFill) gateFill.style.width = (f * 100).toFixed(1) + '%';
    if (f >= 1 && !loadDone) {
      loadDone = true;
      if (gateHint) gateHint.textContent = '点击任意处进入';
      window.setTimeout(function () { if (!entered) enter(); }, 2600);
    }
  }

  function enter() {
    if (entered) return;
    entered = true;
    gateOpen = true;
    if (gate) gate.classList.add('is-done');
    window.setTimeout(function () {
      if (gate && gate.parentNode) gate.style.display = 'none';
    }, 1200);
  }
  if (gate) gate.addEventListener('click', enter);

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
  var simTime = 0;              /* 光带自己的时间轴 —— reduced-motion 时放慢 */
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

    /* 滚动缓动 + 光带加速 */
    var d = scrollTgt - scrollCur;
    scrollCur += d * Math.min(1, dt * 3.2);
    if (Math.abs(d) < 0.0004) scrollCur = scrollTgt;
    var tgtBoost = reduceMotion ? 0 : Math.min(1, Math.abs(d) * 2.4);
    boost += (tgtBoost - boost) * Math.min(1, dt * 4.5);

    streakMat.uniforms.uTime.value = t;
    streakMat.uniforms.uBoost.value = boost;

    /* 星尘漂移 */
    var pos = dust.geometry.attributes.position.array;
    for (var i = 0; i < dustSpd.length; i++) {
      pos[i * 3 + 2] += dustSpd[i] * (1 + boost * 3) * dt;
      if (pos[i * 3 + 2] > 2) pos[i * 3 + 2] = -TUNNEL_LEN;
    }
    dust.geometry.attributes.position.needsUpdate = true;

    /* 叙事 */
    var p = Math.min(NSEC - 1, Math.max(0, scrollCur));
    var rp = applyNarrative(p);
    applyCopy(p);
    applyBar(p);

    /* 跑者动画 + 尾迹 */
    if (mixer) mixer.update(dt * (1 + boost * 0.6));
    if (runnerLoaded) {
      spawnTrail({ x: rp.rx, z: rp.rz }, boost);
    }
    for (var j = 0; j < TRAIL_N; j++) {
      if (trailLife[j] <= 0) continue;
      trailLife[j] -= dt;
      trailPos[j * 3] += trailVel[j * 3] * dt;
      trailPos[j * 3 + 1] += trailVel[j * 3 + 1] * dt;
      trailPos[j * 3 + 2] += trailVel[j * 3 + 2] * dt;
      if (trailLife[j] <= 0) { trailPos[j * 3 + 1] = -50; }   // 藏到地面下
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;

    /* 引导条 */
    if (guide) {
      if (p > 0.18) root.classList.add('gone-guide');
      else root.classList.remove('gone-guide');
    }

    renderer.render(scene, camera);
  }
  frame();

  /* 调试钩子（验证脚本用；读 renderer.info 看 drawcall 是否真的发生）
     ⚠️ mixer / runAction 必须用 getter：它们在 GLB 异步加载回调里才赋值，
        若在这里直接写 `mixer: mixer` 会把「加载前的 null」快照进去，
        验证脚本永远读到 null，误判成「动画没播」。 */
  window.__clDebug = {
    renderer: renderer, scene: scene, camera: camera,
    get mixer() { return mixer; },
    get runAction() { return runAction; },
    get runnerLoaded() { return runnerLoaded; }
  };
})();
