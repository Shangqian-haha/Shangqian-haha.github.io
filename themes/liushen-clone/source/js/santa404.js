/* ==========================================================================
   404 · 圣诞老人舔烟囱（原生 Canvas 2D 重写）
   ---------------------------------------------------------------------------
   效果来源：前端嘛《圣诞老人舔"铁"》
     https://www.fecoder.cn/code-fun/santa-tongue-stuck-pipe
   原版基于 Processing.js 1.4.8。这里**不引 Processing.js**（约 200KB、且 2016 年
   后已停更），把绘图逻辑 1:1 移植到原生 Canvas 2D，中间铺一层极薄的
   Processing 兼容层承住原版代码，方便日后与原版逐行对照。

   与「原版」的刻意差异（都来自需求 / 工程必要）：
     ① 人物四周没有框 —— 每帧 clearRect、**背景透明**（不是原版的
        background(205,235,240) 浅蓝方块），画布也没有 box-shadow / border。
        于是圣诞老人、雪、烟直接浮在页面的夜色上（夜色见 css/santa404.css）。
     ② 逻辑坐标仍是原版的 600×600，但按容器宽度 × devicePixelRatio 缩放，
        高分屏不糊、窄屏自动缩；并用**固定 1/60 秒步进**驱动动画，
        120Hz / 144Hz 屏上不会变成 2 倍速。
     ③ 雪花重生那一行照抄原版笔误（写的是 flake.y 而不是 flake.vy），
        保持观感与原文完全一致 —— 见下方 snow 段注释。

   ⚠️ 移植 Processing 语义时的四个坑（都已按原义实现）：
     · `fill(255, a)` 是「灰度 + 透明度」的**两参数重载**，不是 RGB 双色！
       （原版烟雾就用了这个：fill(255, puff.opacity)）
     · `ellipse()` / `arc()` 的第 3、4 个参数是**宽高**，不是半径。
     · Processing 的 `strokeCap` 默认是 **ROUND**，原生 canvas 默认是 butt ——
       不设 lineCap 的话，那几条 strokeWeight(40) 的手臂会变成尖头。
     · `arc()` 的填充是 **PIE（饼形）**：要先从圆心连到弧起点再闭合。
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('s404-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var W = 600, H = 600, TAU = Math.PI * 2;

  /* ======================================================================
     1. Processing 兼容层（只覆盖原版用到的那部分 API）
     ====================================================================== */
  var g = ctx;                    // 当前绘图上下文（离屏预渲染期间会临时切走）
  var curFill = 'rgba(255,255,255,1)';
  var curStroke = 'rgba(0,0,0,1)';
  var curWeight = 1;
  var fillOn = true, strokeOn = true;
  var centerMode = false;

  /* Processing 的颜色重载：1 参 = 灰度、2 参 = 灰度 + 透明度、
     3 参 = RGB、4 参 = RGBA。两参数那档最容易被漏掉。 */
  function rgba(a) {
    var r, gg, b, al = 255;
    if (a.length >= 3) { r = a[0]; gg = a[1]; b = a[2]; if (a.length > 3) al = a[3]; }
    else if (a.length === 2) { r = gg = b = a[0]; al = a[1]; }
    else { r = gg = b = a[0]; }
    return 'rgba(' + Math.round(r) + ',' + Math.round(gg) + ',' + Math.round(b) + ',' + (al / 255) + ')';
  }
  function fill() { curFill = rgba(arguments); fillOn = true; }
  function stroke() { curStroke = rgba(arguments); strokeOn = true; }
  function noFill() { fillOn = false; }
  function noStroke() { strokeOn = false; }
  function strokeWeight(w) { curWeight = w; }
  function rectMode(m) { centerMode = (m === 'CENTER'); }
  function smooth() { /* 原生 canvas 默认就是抗锯齿，无需处理 */ }
  function background() { g.clearRect(0, 0, W, H); }   // 原版仅在离屏清屏时调用

  /* 统一的「填充 + 描边」收尾，对应 Processing 每帧末的样式落地 */
  function paint() {
    if (fillOn) { g.fillStyle = curFill; g.fill(); }
    if (strokeOn) { g.strokeStyle = curStroke; g.lineWidth = curWeight; g.stroke(); }
  }

  function ellipse(x, y, w, h) {
    g.beginPath();
    g.ellipse(x, y, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, TAU);
    paint();
  }

  /* PIE 模式：先连到圆心，再沿椭圆走弧，闭合 → 得到饼形 */
  function arc(x, y, w, h, s, e) {
    g.beginPath();
    g.moveTo(x, y);
    g.ellipse(x, y, Math.abs(w) / 2, Math.abs(h) / 2, 0, s, e);
    g.closePath();
    paint();
  }

  /* Processing 的圆角矩形：半径顺序 tl, tr, br, bl，且各自不超过短边的一半 */
  function roundRectPath(x, y, w, h, tl, tr, br, bl) {
    var m = Math.min(Math.abs(w), Math.abs(h)) / 2;
    tl = Math.min(tl, m); tr = Math.min(tr, m);
    br = Math.min(br, m); bl = Math.min(bl, m);
    g.moveTo(x + tl, y);
    g.lineTo(x + w - tr, y);
    g.quadraticCurveTo(x + w, y, x + w, y + tr);
    g.lineTo(x + w, y + h - br);
    g.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    g.lineTo(x + bl, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - bl);
    g.lineTo(x, y + tl);
    g.quadraticCurveTo(x, y, x + tl, y);
    g.closePath();
  }

  function rect(x, y, w, h) {
    var radii = [].slice.call(arguments, 4);
    if (centerMode) { x -= w / 2; y -= h / 2; }   // 原版只在 rect(0,0,42,20) 用了 CENTER
    g.beginPath();
    if (!radii.length) {
      g.rect(x, y, w, h);
    } else {
      var tl = radii[0] || 0;
      var tr = radii.length > 1 ? radii[1] : tl;
      var br = radii.length > 2 ? radii[2] : tl;
      var bl = radii.length > 3 ? radii[3] : tl;
      roundRectPath(x, y, w, h, tl, tr, br, bl);
    }
    paint();
  }

  function triangle(x1, y1, x2, y2, x3, y3) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath();
    paint();
  }

  function line(x1, y1, x2, y2) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.strokeStyle = curStroke; g.lineWidth = curWeight; g.stroke();
  }

  /* 原版的 bezier 都配着粗 stroke 画「手臂 / 腿 / 天线」，只描边不填充 */
  function bezier(x1, y1, cx1, cy1, cx2, cy2, x2, y2) {
    g.beginPath(); g.moveTo(x1, y1); g.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);
    if (strokeOn) { g.strokeStyle = curStroke; g.lineWidth = curWeight; g.stroke(); }
  }

  function pushMatrix() { g.save(); }
  function popMatrix() { g.restore(); }
  function translate(x, y) { g.translate(x, y); }
  function rotate(a) { g.rotate(a); }
  function image(img, x, y) { g.drawImage(img, x, y); }

  function random(a, b) {
    if (b === undefined) { b = a; a = 0; }
    return a + Math.random() * (b - a);
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function constrain(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function radians(d) { return d * Math.PI / 180; }
  function bezierPoint(a, b, c, d, t) {
    var u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  }
  function bezierTangent(a, b, c, d, t) {
    var u = 1 - t;
    return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c);
  }

  /* 原版 Santa.draw 里有 `dx = ...; dy = ...;` 两个隐式全局（在 app() 里声明）。
     严格模式下必须显式声明，否则直接抛错。 */
  var dx = 0, dy = 0;

  function offscreen() {
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  }
  function useCtx(c) { g = c; g.lineCap = 'round'; g.lineJoin = 'round'; }

  /* ======================================================================
     2. 圣诞老人（以下 setup / update / draw 逐行照抄原版 Santa 类，
        只把 run() 拆成 update() + draw()，以便放进固定步长循环）
     ====================================================================== */
  var Santa = (function () {
    function S() {
      this.x = 400;
      this.y = 430;
      this.diameter = 180;
      /* 原版拼写就是 tounge（少个 u），保留原名便于对照 */
      this.tounge = { x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0, x4: 0, y4: 0 };
      this.arms = {
        left: { x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0, x4: 0, y4: 0 },
        right: { x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0, x4: 0, y4: 0 }
      };
      this.eyes = 0;
      this.offset = 0;
      this.timer = 0;
      this.state = 'base';
      this.setup();
    }

    S.prototype.setup = function () {
      // left arm
      this.arms.left.x1 = this.x + this.diameter * 0.18;
      this.arms.left.y1 = this.y - this.diameter * 0.25;
      this.arms.left.x2 = this.x + this.diameter * 0.18;
      this.arms.left.y2 = this.y + this.diameter * 0.0;
      this.arms.left.x3 = this.x + this.diameter * 0.18;
      this.arms.left.y3 = this.y + this.diameter * 0.3;
      this.arms.left.x4 = this.x + this.diameter * 0.18;
      this.arms.left.y4 = this.y + this.diameter * 0.55;

      // right arm
      this.arms.right.x1 = this.x - this.diameter * 0.37;
      this.arms.right.y1 = this.y - this.diameter * 0.25;
      this.arms.right.x2 = this.x - this.diameter * 0.37;
      this.arms.right.y2 = this.y + this.diameter * 0.0;
      this.arms.right.x3 = this.x - this.diameter * 0.37;
      this.arms.right.y3 = this.y + this.diameter * 0.3;
      this.arms.right.x4 = this.x - this.diameter * 0.37;
      this.arms.right.y4 = this.y + this.diameter * 0.55;
    };

    S.prototype.update = function () {
      switch (this.state) {
        case 'pull':
          this.timer++;
          this.offset = constrain(this.offset + 0.5, 0, 80);
          this.eyes = constrain(this.eyes + 0.1, 0, 20);
          if (this.offset === 80) {
            this.state = 'base';
            this.timer = 0;
          }
          break;
        case 'base':
          this.timer++;
          this.offset = lerp(this.offset, 0, 0.1);
          this.eyes = lerp(this.eyes, 0, 0.1);
          if (this.timer === 180) {
            this.state = 'pull';
            this.timer = 0;
          }
          break;
      }
    };

    S.prototype.draw = function () {
      pushMatrix();
      translate(this.offset, 0);

      // right arm
      stroke(195, 70, 90);
      strokeWeight(40);
      bezier(
        this.arms.right.x1, this.arms.right.y1,
        this.arms.right.x2 + this.offset, this.arms.right.y2,
        this.arms.right.x3 + this.offset, this.arms.right.y3,
        this.arms.right.x4, this.arms.right.y4 - this.offset * 0.3
      );

      // right hand
      noStroke();
      fill(50);
      ellipse(this.arms.right.x4, this.arms.right.y4 - this.offset * 0.3, 40, 40);
      fill(255);
      pushMatrix();
      translate(
        bezierPoint(
          this.arms.right.x1, this.arms.right.x2 + this.offset,
          this.arms.right.x3 + this.offset, this.arms.right.x4, 0.9
        ),
        bezierPoint(
          this.arms.right.y1, this.arms.right.y2, this.arms.right.y3,
          this.arms.right.y4 - this.offset * 0.3, 0.9
        )
      );
      dx = bezierTangent(
        this.arms.right.x1, this.arms.right.x2 + this.offset,
        this.arms.right.x3 + this.offset, this.arms.right.x4, 0.9
      );
      dy = bezierTangent(
        this.arms.right.y1, this.arms.right.y2, this.arms.right.y3,
        this.arms.right.y4 - this.offset * 0.3, 0.9
      );
      rotate(radians(90) + Math.atan2(dy, dx));
      rectMode('CENTER');
      rect(0, 0, 42, 20);
      rectMode('CORNER');
      popMatrix();

      // legs
      pushMatrix();
      translate(-this.offset, 0);
      noFill();
      stroke(195, 70, 90);
      strokeWeight(20);
      bezier(
        this.x - this.diameter * 0.15 + this.offset, this.y + this.diameter * 0.35,
        this.x - this.diameter * 0.15, this.y + this.diameter * 0.6,
        this.x - this.diameter * 0.15, this.y + this.diameter * 0.8,
        this.x - this.diameter * 0.15, this.y + this.diameter * 1
      );
      bezier(
        this.x + this.diameter * 0.15 + this.offset, this.y + this.diameter * 0.35,
        this.x + this.diameter * 0.15 + this.offset * 0.2, this.y + this.diameter * 0.6,
        this.x + this.diameter * 0.15 + this.offset * 0.2, this.y + this.diameter * 0.8,
        this.x + this.diameter * 0.15 + this.offset * 0.4, this.y + this.diameter * 1
      );
      popMatrix();

      // body
      noStroke();
      fill(215, 70, 85);
      ellipse(this.x, this.y, this.diameter, this.diameter);

      // left arm
      stroke(195, 70, 90);
      strokeWeight(40);
      bezier(
        this.arms.left.x1, this.arms.left.y1,
        this.arms.left.x2 + this.offset, this.arms.left.y2,
        this.arms.left.x3 + this.offset, this.arms.left.y3,
        this.arms.left.x4, this.arms.left.y4 - this.offset * 0.3
      );

      // left hand
      noStroke();
      fill(50);
      ellipse(this.arms.left.x4, this.arms.left.y4 - this.offset * 0.3, 40, 40);
      fill(255);
      pushMatrix();
      translate(
        bezierPoint(
          this.arms.left.x1, this.arms.left.x2 + this.offset,
          this.arms.left.x3 + this.offset, this.arms.left.x4, 0.9
        ),
        bezierPoint(
          this.arms.left.y1, this.arms.left.y2, this.arms.left.y3,
          this.arms.left.y4 - this.offset * 0.3, 0.9
        )
      );
      dx = bezierTangent(
        this.arms.left.x1, this.arms.left.x2 + this.offset,
        this.arms.left.x3 + this.offset, this.arms.left.x4, 0.9
      );
      dy = bezierTangent(
        this.arms.left.y1, this.arms.left.y2, this.arms.left.y3,
        this.arms.left.y4 - this.offset * 0.3, 0.9
      );
      rotate(radians(90) + Math.atan2(dy, dx));
      rectMode('CENTER');
      rect(0, 0, 42, 20);
      rectMode('CORNER');
      popMatrix();

      // head
      pushMatrix();
      translate(this.x - this.diameter * 0.2, this.y - this.diameter * 0.35);
      rotate(radians(this.offset * 0.2));

      // face and hat
      noStroke();
      fill(240, 195, 195);
      rect(
        -this.diameter * 0.29, -this.diameter * 0.2,
        this.diameter * 0.49, this.diameter * 0.5
      );
      // ear
      ellipse(
        this.diameter * 0.19, -this.diameter * 0.08,
        this.diameter * 0.1, this.diameter * 0.1
      );

      // eyebrows
      stroke(255);
      strokeWeight(3);
      line(
        -this.diameter * 0.23, -this.diameter * 0.11,
        -this.diameter * 0.18, -this.diameter * 0.11 + this.eyes * 0.2
      );
      line(
        -this.diameter * 0.05, -this.diameter * 0.11 + this.eyes * 0.2,
        -this.diameter * -0.0, -this.diameter * 0.11
      );
      // eyes
      noStroke();
      fill(40);
      ellipse(
        -this.diameter * 0.2, -this.diameter * 0.05,
        this.diameter * 0.04,
        this.diameter * 0.04 - constrain(this.eyes, 0, this.diameter * 0.03)
      );
      ellipse(
        -this.diameter * 0.03, -this.diameter * 0.05,
        this.diameter * 0.04,
        this.diameter * 0.04 - constrain(this.eyes, 0, this.diameter * 0.03)
      );

      // hat
      noStroke();
      fill(255);
      ellipse(
        this.diameter * 0.19, -this.diameter * 0.45,
        this.diameter * 0.18, this.diameter * 0.18
      );
      fill(215, 70, 85);
      arc(
        -this.diameter * 0.08, -this.diameter * 0.25,
        this.diameter * 0.4, this.diameter * 0.4,
        radians(180), radians(360)
      );
      rect(
        -this.diameter * 0.08, -this.diameter * 0.45,
        this.diameter * 0.28, this.diameter * 0.22,
        0, 10, 0, 0
      );
      stroke(255);
      strokeWeight(20);
      line(
        -this.diameter * 0.28, -this.diameter * 0.22,
        this.diameter * 0.19, -this.diameter * 0.22
      );

      // beard
      noStroke();
      fill(255);
      rect(
        -this.diameter * 0.21, this.diameter * 0.05,
        this.diameter * 0.24, this.diameter * 0.2,
        this.diameter * 1
      );
      ellipse(
        -this.diameter * 0.08, this.diameter * 0.4,
        this.diameter * 0.59, this.diameter * 0.59
      );
      stroke(255);
      strokeWeight(18);
      line(
        this.diameter * 0.16, this.diameter * 0.01,
        this.diameter * 0.16, this.diameter * 0.38
      );
      stroke(240, 195, 195);
      strokeWeight(17);
      line(
        this.diameter * 0.065, this.diameter * 0.1,
        this.diameter * 0.065, this.diameter * 0.145
      );

      // nose
      noStroke();
      fill(245, 130, 130);
      ellipse(
        -this.diameter * 0.12, -this.diameter * -0.03,
        this.diameter * 0.08, this.diameter * 0.08
      );

      // mouth
      noStroke();
      fill(40);
      rect(
        -this.diameter * 0.17, this.diameter * 0.11,
        this.diameter * 0.15, this.diameter * 0.09 + this.offset * 0.1,
        7, 7, 0, 0
      );
      arc(
        -this.diameter * 0.095, this.diameter * 0.195 + this.offset * 0.1,
        this.diameter * 0.145, this.diameter * 0.08,
        0, radians(180)
      );
      fill(215, 70, 85);
      rect(
        -this.diameter * 0.105, this.diameter * 0.124 + this.offset * 0.015,
        this.diameter * 0.085, this.diameter * 0.1,
        5, 5, 15, 5
      );
      popMatrix();
      popMatrix();
    };

    return S;
  })();

  /* ======================================================================
     3. 场景状态（照抄原版）
     ====================================================================== */
  var santa = new Santa();

  var smoke = [];

  var snow = (function () {
    var arr = [];
    for (var i = 0; i < 50; i++) {
      arr.push({
        x: random(W),
        y: random(H),
        diameter: random(3, 8),
        vx: random(-0.3, 0.3),
        vy: random(0.5, 1)
      });
    }
    return arr;
  })();

  var aerial = {
    x1: 270, y1: 600, x2: 270, y2: 450, x3: 270, y3: 250, x4: 270, y4: 60,
    x2_base: 270, x3_base: 270, x2_off: 0, x3_off: 0
  };

  /* ---------- 离屏预渲染：烟囱 ---------- */
  var chimney = (function () {
    var c = offscreen();
    useCtx(c.getContext('2d'));
    background();

    // snow at top of chimney
    stroke(255);
    strokeWeight(30);
    line(90, 485, 120, 485);
    line(155, 485, 223, 485);

    // chimney
    noStroke();
    fill(195, 70, 90);
    rect(70, 485, 170, 15);
    rect(80, 500, 150, 100);

    // bricks on chimney
    fill(215, 70, 85);
    for (var x = 0; x < 4; x++) {
      for (var y = 0; y < 5; y++) {
        if (y % 2 === 0) {
          rect(83 + x * 37.5, 500 + y * 20, 32, 15);
        } else if (x < 3) {
          rect(83 + 37.5 / 2 + x * 37.5, 500 + y * 20, 32, 15);
        } else {
          rect(83, 500 + y * 20, 14, 15);
          rect(83 + 18 + x * 37.5, 500 + y * 20, 14, 15);
        }
      }
    }

    // snow at bottom of chimney
    stroke(255);
    strokeWeight(30);
    line(55, 600, 65, 600);
    line(90, 600, 140, 600);
    line(210, 600, 250, 600);

    useCtx(ctx);
    return c;
  })();

  /* ---------- 离屏预渲染：礼盒 ---------- */
  var present = (function () {
    var c = offscreen();
    useCtx(c.getContext('2d'));
    background();

    pushMatrix();
    translate(150, 450);
    rotate(radians(10));
    translate(-145, -450);

    // main box
    noStroke();
    fill(132, 232, 135);
    rect(100, 400, 100, 100);
    // shadow
    fill(5, 5, 5, 70);
    rect(100, 415, 100, 5);

    // spots
    fill(89, 189, 92, 150);
    for (var i = 0; i < 5; i++) {
      for (var j = 0; j < 4; j++) {
        ellipse(110 + i * 20, 430 + j * 20, 10, 10);
      }
    }

    // lid
    fill(90, 209, 90);
    rect(95, 400, 110, 15);

    // cross
    fill(235, 225, 120, 180);
    rect(145, 400, 10, 100);
    rect(100, 448, 100, 10);

    // bow
    stroke(212, 202, 111);
    strokeWeight(1);
    fill(235, 225, 120, 250);
    triangle(150, 400, 120, 390, 130, 380);
    triangle(150, 400, 180, 390, 170, 380);
    ellipse(150, 395, 13, 10);

    popMatrix();

    useCtx(ctx);
    return c;
  })();

  /* ======================================================================
     4. 逻辑推进（原版 app() 里「会改变状态」的那部分，按固定步长执行）
     ====================================================================== */
  var frameCount = 0;

  function step() {
    frameCount++;

    santa.update();

    // 天线随圣诞老人后仰而弯曲
    aerial.x2 = aerial.x2_base + santa.offset * 0.5;
    aerial.x3 = aerial.x3_base + santa.offset * 0.3;

    // 烟雾：上升、变淡
    for (var i = smoke.length - 1; i >= 0; i--) {
      var puff = smoke[i];
      puff.x += puff.vx;
      puff.y += puff.vy;
      puff.w = constrain(puff.w * 0.997, 0, puff.w);
      puff.opacity = constrain(puff.opacity - 0.75, 0, 255);
      if (puff.opacity === 0) {
        smoke.splice(i, 1);
      }
    }

    // 雪花：下落，落地后回到顶部重生
    for (var k = snow.length - 1; k >= 0; k--) {
      var flake = snow[k];
      flake.x += flake.vx;
      flake.y += flake.vy;
      if (flake.y - flake.diameter > H) {
        flake.x = random(W);
        flake.y = -10;
        flake.diameter = random(3, 8);
        flake.vx = random(-0.3, 0.3);
        /* ⚠️ 原版这里写的是 flake.y = random(0.5, 1)（疑似本意是 flake.vy，
           因为上一行刚把 y 设成 -10）。为了观感与原文完全一致，照抄不改。 */
        flake.y = random(0.5, 1);
      }
    }

    // 烟囱定时吐烟
    if (frameCount % 20 === 0) {
      var diameter = random(30, 50);
      smoke.push({
        x: random(100, 170),
        y: 485,
        vx: random(-1, 0.5),
        vy: random(-1, -0.5),
        w: diameter,
        h: diameter * random(0.4, 0.6),
        opacity: random(200, 250) | 0
      });
    }
  }

  /* ======================================================================
     5. 绘制（原版 app() 里「只画不改」的那部分）
     ====================================================================== */
  function render() {
    // 透明清屏 —— 这是「取消人物四周框框」的关键：画布自身没有底色，
    // 人物、雪、烟直接落在页面的夜色上。
    g.clearRect(0, 0, W, H);

    // 礼盒（原版先画礼盒，随后被烟囱盖住一部分，顺序照抄）
    image(present, 0, 0);

    // 烟雾
    for (var i = 0; i < smoke.length; i++) {
      var puff = smoke[i];
      fill(255, puff.opacity);
      rect(puff.x, puff.y, puff.w, puff.h, 10);
    }

    // 烟囱
    image(chimney, 0, 0);

    // 圣诞老人
    santa.draw();

    // 舌头：从圣诞老人嘴巴拉伸到天线上
    noStroke();
    fill(215, 70, 85);
    var toungeX = bezierPoint(aerial.x1, aerial.x2, aerial.x3, aerial.x4, 0.415);
    var toungeY = bezierPoint(aerial.y1, aerial.y2, aerial.y3, aerial.y4, 0.415);
    var mouthX = santa.x - santa.diameter * 0.315 + santa.offset;
    var mouthY = santa.y - santa.diameter * 0.185;
    var diff = Math.abs(mouthX - toungeX);

    // 贴在铁管上的那一小坨
    ellipse(5 + toungeX, toungeY + 3, 20, 25);
    // 被拉长的舌头
    noFill();
    stroke(215, 70, 85);
    strokeWeight(17);
    bezier(
      toungeX + 5, toungeY,
      toungeX + diff * 0.33,
      toungeY + santa.diameter * 0.15 - constrain(santa.offset, 0, santa.diameter * 0.15),
      mouthX - diff * 0.33,
      mouthY + santa.diameter * 0.15 - constrain(santa.offset, 0, santa.diameter * 0.15),
      mouthX, mouthY
    );

    // 天线（铁管）
    noStroke();
    fill(255);
    arc(270, 600, 60, 60, radians(180), radians(360));
    noFill();
    stroke(255);
    strokeWeight(14);
    bezier(aerial.x1, aerial.y1, aerial.x2, aerial.y2, aerial.x3, aerial.y3, aerial.x4, aerial.y4);

    pushMatrix();
    translate(
      bezierPoint(aerial.x1, aerial.x2, aerial.x3, aerial.x4, 0.98),
      bezierPoint(aerial.y1, aerial.y2, aerial.y3, aerial.y4, 0.98)
    );
    dx = bezierTangent(aerial.x1, aerial.x2, aerial.x3, aerial.x4, 0.98);
    dy = bezierTangent(aerial.y1, aerial.y2, aerial.y3, aerial.y4, 0.98);
    rotate(radians(90) + Math.atan2(dy, dx));
    noStroke();
    fill(255);
    ellipse(0, 0, 34, 15);
    stroke(255);
    strokeWeight(5);
    line(-50, 0, 50, 0);
    popMatrix();

    pushMatrix();
    translate(
      bezierPoint(aerial.x1, aerial.x2, aerial.x3, aerial.x4, 0.9),
      bezierPoint(aerial.y1, aerial.y2, aerial.y3, aerial.y4, 0.9)
    );
    dx = bezierTangent(aerial.x1, aerial.x2, aerial.x3, aerial.x4, 0.9);
    dy = bezierTangent(aerial.y1, aerial.y2, aerial.y3, aerial.y4, 0.9);
    rotate(radians(90) + Math.atan2(dy, dx));
    noStroke();
    fill(255);
    ellipse(0, 0, 34, 15);
    stroke(255);
    strokeWeight(5);
    line(-150, 0, 150, 0);
    popMatrix();

    pushMatrix();
    translate(
      bezierPoint(aerial.x1, aerial.x2, aerial.x3, aerial.x4, 0.8),
      bezierPoint(aerial.y1, aerial.y2, aerial.y3, aerial.y4, 0.8)
    );
    dx = bezierTangent(aerial.x1, aerial.x2, aerial.x3, aerial.x4, 0.8);
    dy = bezierTangent(aerial.y1, aerial.y2, aerial.y3, aerial.y4, 0.8);
    rotate(radians(90) + Math.atan2(dy, dx));
    noStroke();
    fill(255);
    ellipse(0, 0, 34, 15);
    stroke(255);
    strokeWeight(5);
    line(-120, 0, 120, 0);
    popMatrix();

    pushMatrix();
    translate(
      bezierPoint(aerial.x1, aerial.x2, aerial.x3, aerial.x4, 0.75),
      bezierPoint(aerial.y1, aerial.y2, aerial.y3, aerial.y4, 0.75)
    );
    dx = bezierTangent(aerial.x1, aerial.x2, aerial.x3, aerial.x4, 0.75);
    dy = bezierTangent(aerial.y1, aerial.y2, aerial.y3, aerial.y4, 0.75);
    rotate(radians(90) + Math.atan2(dy, dx));
    noStroke();
    fill(255);
    ellipse(0, 0, 34, 15);
    stroke(255);
    strokeWeight(5);
    line(-120, 0, 120, 0);
    popMatrix();

    noStroke();
    fill(255);
    ellipse(bezierPoint(aerial.x1, aerial.x2, aerial.x3, aerial.x4, 0.3),
      bezierPoint(aerial.y1, aerial.y2, aerial.y3, aerial.y4, 0.3), 20, 20);
    ellipse(bezierPoint(aerial.x1, aerial.x2, aerial.x3, aerial.x4, 0.6),
      bezierPoint(aerial.y1, aerial.y2, aerial.y3, aerial.y4, 0.6), 20, 20);

    // 雪花
    noStroke();
    fill(255);
    for (var n = 0; n < snow.length; n++) {
      var flake = snow[n];
      ellipse(flake.x, flake.y, flake.diameter, flake.diameter);
    }
  }

  /* ======================================================================
     6. 自适应尺寸 + 固定步长主循环
     ====================================================================== */
  function fit() {
    var cssSize = canvas.clientWidth;
    if (!cssSize) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var px = Math.round(cssSize * dpr);
    if (canvas.width === px && canvas.height === px) return true;
    /* 改 canvas.width 会重置整个 2D 上下文状态（transform / lineCap 全没了），
       所以重设尺寸后必须立刻把绘制状态补回来。 */
    canvas.width = px;
    canvas.height = px;
    var s = px / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    useCtx(ctx);
    return true;
  }

  var STEP = 1000 / 60;      // 逻辑固定步长：与原版 frameRate(60) 一致
  var acc = 0;
  var last = 0;

  function loop(t) {
    if (!last) last = t;
    acc += t - last;
    last = t;
    if (acc > 200) acc = 200;     // 切后台回来不追帧，避免"快进"
    fit();
    while (acc >= STEP) { step(); acc -= STEP; }
    render();
    window.requestAnimationFrame(loop);
  }

  if (!fit()) {
    // CSS 还没生效（尺寸为 0）时先等一帧
    window.requestAnimationFrame(loop);
  } else {
    window.requestAnimationFrame(loop);
  }
})();
