# -*- coding: utf-8 -*-
"""探针：/profile/ 四幕文字对位。

目标口径（2026-09-29 v6b 定稿）：
  · 第 1 幕（data-i=0）：居中（横向居中 + 纵向居中）
  · 第 2、3 幕（data-i=1 / 2）：**右中间**（横向靠右 + 纵向居中）
    —— 只动横向，纵向位置与旧口径（左中间）一致
  · 第 4~7 幕（data-i=3..6，v6b 照片幕）：标签盒落**右下角**
    （绝对定位 right/bottom；照片卡片不铺满整屏）
  · 第 8 幕（data-i=7）：左中间（Say hi 联系幕在最后一页，
    竖线与条目列靠左）
此前 .cl-sec（column flex）上误写 justify-content: flex-end，
在 column 容器里是「纵向靠底」而不是「横向靠右」，导致二/三幕文字沉在下沿；
末幕（联系幕）也于 2026-09-29 从居中改为左中间。

用法：python probe_sec_align.py [--mobile]
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import run_v2 as V          # noqa: E402
import websocket            # noqa: E402

OUT = V.OUT
BASE = V.BASE
CHROME = V.CHROME
PROF = os.path.join(OUT, "chrome-prof-align")
CDP_PORT = V.CDP_PORT + 21

PROBE = r"""(function(){
  var secs = [].slice.call(document.querySelectorAll('.cl-sec'));
  var W = window.innerWidth, H = window.innerHeight;
  var _cs0 = getComputedStyle(secs[0] || document.body);
  var pad = _cs0.paddingLeft, padR = _cs0.paddingRight;
  return {
    W: W, H: H, padL: pad, padR: padR,
    secs: secs.map(function(sec){
      var cs = getComputedStyle(sec);
      var bx = null;
      /* v6：照片幕的 .cl-photo 铺满整幕，会把 union 撑成全屏 ——
         有 .cl-featured 的幕只量标签本体。 */
      var isPhotoSec = !!sec.querySelector('.cl-featured');
      if (isPhotoSec) {
        /* v6c：照片幕量「卡片 + 标签盒」两条几何，不做 union */
        var _ph = sec.querySelector('.cl-photo'), _ft = sec.querySelector('.cl-featured');
        var _pr = _ph ? _ph.getBoundingClientRect() : null;
        var _fr = _ft ? _ft.getBoundingClientRect() : null;
        return { i: sec.getAttribute('data-i'), op: parseFloat(cs.opacity),
                 ai: cs.alignItems, jc: cs.justifyContent, ta: cs.textAlign, fd: cs.flexDirection,
                 photo: _pr ? {l:Math.round(_pr.left), t:Math.round(_pr.top),
                               r:Math.round(_pr.right), b:Math.round(_pr.bottom),
                               w:Math.round(_pr.width), h:Math.round(_pr.height)} : null,
                 label: _fr ? {l:Math.round(_fr.left), t:Math.round(_fr.top),
                               r:Math.round(_fr.right), b:Math.round(_fr.bottom),
                               w:Math.round(_fr.width), h:Math.round(_fr.height)} : null,
                 box: null };
      }
      [].slice.call(sec.children).forEach(function(k){
        var r = k.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (!bx) { bx = {l:r.left, t:r.top, r:r.right, b:r.bottom}; }
        else {
          bx.l = Math.min(bx.l, r.left); bx.t = Math.min(bx.t, r.top);
          bx.r = Math.max(bx.r, r.right); bx.b = Math.max(bx.b, r.bottom);
        }
      });
      return {
        i: sec.getAttribute('data-i'),
        op: parseFloat(cs.opacity),   /* v6b：过渡中的幕带位移 transform，只在激活时量对位 */
        ai: cs.alignItems, jc: cs.justifyContent, ta: cs.textAlign, fd: cs.flexDirection,
        box: bx ? {l:Math.round(bx.l), t:Math.round(bx.t),
                   r:Math.round(bx.r), b:Math.round(bx.b),
                   cx:Math.round((bx.l+bx.r)/2), cy:Math.round((bx.t+bx.b)/2)} : null
      };
    })
  };
})()"""


def wheel(cdp, n, dy=260):
    for _ in range(n):
        cdp.cmd("Input.dispatchMouseEvent",
                {"type": "mouseWheel", "x": 720, "y": 450, "deltaX": 0, "deltaY": dy})
        time.sleep(0.12)


def shot(cdp, name):
    cdp.shot(os.path.join(OUT, name))
    print("[shot] " + name, flush=True)


def run(cdp, tag, mobile):
    """滚一遍四幕，逐幕量对位。"""
    print("\n=== %s 四幕对位 ===" % tag, flush=True)
    p = cdp.ev(PROBE)
    print("  probe = " + json.dumps(p, ensure_ascii=False), flush=True)
    W, H = p["W"], p["H"]
    secs = p["secs"]
    ok = True

    for s in secs:
        i = s["i"]
        b = s["box"]
        if s.get("op", 1) is not None and s["op"] < 0.5:
            # 非激活幕：applyCopy 给它挂了 translate3d(0, d*-46px) 位移，
            # 此刻量到的几何不代表真实对位口径，跳过（激活幕的断言已覆盖）
            print("  [skip] 幕%s 未激活（op=%.2f）" % (i, s["op"]), flush=True)
            continue
        if not b:
            V.check("%s 幕%s 有内容" % (tag, i), False, "empty")
            ok = False
            continue
        is_center = i in ("0",)
        if is_center:
            # 居中：横向中心贴合视口中心
            dx = abs(b["cx"] - W / 2.0)
            V.check("%s 幕%s 居中（横向中心 |Δ|=%.0f ≤ 24）" % (tag, i, dx),
                    dx <= 24 and s["ai"] == "center", "cx=%s W/2=%s ai=%s"
                    % (b["cx"], W // 2, s["ai"]))
            if dx > 24:
                ok = False
        elif i in ("3", "4", "5", "6"):
            # 照片幕（v6c 严格规格）：量卡片 + 标签盒两条几何
            ph, lb = s.get("photo"), s.get("label")
            good = False
            if not ph or not lb:
                V.check("%s 幕%s 照片/标签存在" % (tag, i), False, "missing")
            elif W <= 1280:
                # ≤1280：容器 90%，标签铺满图片（透明底压图，参考站行为）
                good = (abs(ph["l"] - 0.05 * W) <= 10 and
                        abs(ph["w"] - 0.90 * W) <= 14 and
                        abs(lb["l"] - ph["l"]) <= 5 and abs(lb["r"] - ph["r"]) <= 5 and
                        abs(lb["t"] - ph["t"]) <= 5 and abs(lb["b"] - ph["b"]) <= 5)
                V.check("%s 幕%s ≤1280 标签铺在图上（容器 90%%）" % (tag, i), good,
                        "photo=%s label=%s" % (ph, lb))
            else:
                contL, contR = 0.08 * W, W - 0.08 * W
                iw = 960 if W <= 1440 else 1088
                ih = 540 if W <= 1440 else 612
                lw = 360 if W <= 1440 else 420
                texp = (H - ih - 60) / 2.0
                g1 = (abs(ph["l"] - contL) <= 8 and abs(ph["w"] - iw) <= 3 and
                      abs(ph["h"] - ih) <= 3 and abs(ph["t"] - texp) <= 14)
                V.check("%s 幕%s 图片 %dx%d@84%%容器左缘" % (tag, i, iw, ih), g1,
                        "card=%s exp(l=%.0f,t=%.0f)" % (ph, contL, texp))
                g2 = (abs(lb["r"] - contR) <= 8 and
                      abs(lb["b"] - (ph["b"] + 60)) <= 5 and
                      abs(lb["w"] - lw) <= 3)
                V.check("%s 幕%s 标签盒 right:0/bottom:-60px/w%d" % (tag, i, lw), g2,
                        "label=%s expR=%.0f expB=%.0f" % (lb, contR, ph["b"] + 60))
                V.check("%s 幕%s 标签盒压图右下角" % (tag, i),
                        lb["l"] < ph["r"] and lb["t"] < ph["b"], "")
                good = g1 and g2
            if not good:
                ok = False
        elif i in ("1", "2"):
            # 右中间（2026-09-29 新口径）：横向靠右（右缘 ≈ 右内边距）+ 纵向居中
            dr = (W - b["r"]) - float(p["padR"].replace("px", "") or 0)
            cy_ratio = (b["cy"] - 0.0) / H
            V.check("%s 幕%s 横向靠右（右缘贴合内边距 |Δ|=%.0f ≤ 16）" % (tag, i, dr),
                    abs(dr) <= 16 and s["ai"] == "flex-end" and s["ta"] == "right",
                    "r=%s W=%s padR=%s ai=%s ta=%s" % (b["r"], W, p["padR"], s["ai"], s["ta"]))
            V.check("%s 幕%s 纵向居中（中心在 0.32~0.68 视高）" % (tag, i),
                    0.32 <= cy_ratio <= 0.68 and s["jc"] == "center",
                    "cy=%s H=%s ratio=%.2f jc=%s" % (b["cy"], H, cy_ratio, s["jc"]))
            V.check("%s 幕%s 没有沉到底部（底缘 < 0.90 视高）" % (tag, i),
                    b["b"] < 0.90 * H, "bottom=%s 0.9H=%s" % (b["b"], int(0.9 * H)))
            if abs(dr) > 16 or not (0.32 <= cy_ratio <= 0.68):
                ok = False
        else:
            # 左中间（i=7 · 末幕 Say hi 联系幕）：横向靠左 + 纵向居中
            dl = b["l"] - float(p["padL"].replace("px", "") or 0)
            cy_ratio = (b["cy"] - 0.0) / H
            V.check("%s 幕%s 横向靠左（左缘贴合内边距 |Δ|=%.0f ≤ 16）" % (tag, i, dl),
                    abs(dl) <= 16 and s["ai"] == "flex-start" and s["ta"] == "left",
                    "l=%s padL=%s ai=%s ta=%s" % (b["l"], p["padL"], s["ai"], s["ta"]))
            V.check("%s 幕%s 纵向居中（中心在 0.32~0.68 视高）" % (tag, i),
                    0.32 <= cy_ratio <= 0.68 and s["jc"] == "center",
                    "cy=%s H=%s ratio=%.2f jc=%s" % (b["cy"], H, cy_ratio, s["jc"]))
            # 反向断言：不能再沉到底部
            V.check("%s 幕%s 没有沉到底部（底缘 < 0.90 视高）" % (tag, i),
                    b["b"] < 0.90 * H, "bottom=%s 0.9H=%s" % (b["b"], int(0.9 * H)))
            if abs(dl) > 16 or not (0.32 <= cy_ratio <= 0.68):
                ok = False
    return ok


def main():
    mobile = "--mobile" in sys.argv
    httpd = V.start_server()
    print("[srv] %s" % BASE, flush=True)
    V.check("静态服务可用", True)
    # ⚠️ 不整目录删（Chrome 缓存上千文件会触发批量删除保护）；只清单例锁
    os.makedirs(PROF, exist_ok=True)
    for _lk in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        _p = os.path.join(PROF, _lk)
        if os.path.lexists(_p):
            try:
                os.remove(_p)
            except OSError:
                pass

    chrome = subprocess.Popen([
        CHROME, "--headless=new",
        "--remote-debugging-port=%d" % CDP_PORT,
        "--remote-allow-origins=*", "--user-data-dir=" + PROF,
        "--window-size=1440,900", "--hide-scrollbars",
        "--no-first-run", "--no-default-browser-check",
        "--use-gl=angle", "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    wsurl = None
    for _ in range(80):
        try:
            with urllib.request.urlopen(
                    "http://127.0.0.1:%d/json/list" % CDP_PORT, timeout=2) as r:
                lst = json.loads(r.read().decode())
            for it in lst:
                if it.get("type") == "page" and it.get("webSocketDebuggerUrl"):
                    wsurl = it["webSocketDebuggerUrl"]
                    break
            if wsurl:
                break
        except Exception:
            pass
        time.sleep(0.5)
    if not wsurl:
        print("!! no CDP")
        return 1

    ws = websocket.create_connection(wsurl, timeout=30)
    cdp = V.CDP(ws)
    cdp.cmd("Page.enable")
    cdp.cmd("Runtime.enable")
    cdp.cmd("Network.enable")
    cdp.cmd("Log.enable")

    if mobile:
        cdp.cmd("Emulation.setDeviceMetricsOverride",
                {"width": 414, "height": 896, "deviceScaleFactor": 2, "mobile": True})
        cdp.cmd("Emulation.setUserAgentOverride",
                {"userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                              "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 "
                              "Mobile/15E148 Safari/604.1"})

    V.nav_to(cdp, BASE + "/profile/", settle=0.8)
    time.sleep(6.5)                     # 闸门进度条走完 + 自动进入 + 稳定
    cdp.ev("document.querySelector('.cl-gate') && "
           "document.querySelector('.cl-gate').classList.contains('is-done')")

    # 幕 0（首屏）—— 截图名带视口前缀，避免桌面/移动两轮互相覆盖
    pfx = "cl_fixm_" if mobile else "cl_fix_"
    time.sleep(0.6)
    run(cdp, "桌面" if not mobile else "移动", mobile)
    shot(cdp, pfx + "s0.png")

    for k in (1, 2, 3, 4, 5, 6, 7):
        wheel(cdp, 4)
        time.sleep(2.0)
        run(cdp, "%s 幕%d" % ("桌面" if not mobile else "移动", k), mobile)
        shot(cdp, pfx + "s%d.png" % k)

    e = V.errs(cdp)
    real = [x for x in e if "err_connection_reset" not in x.lower()]
    V.check("无 JS 报错", len(real) == 0, "%d 条" % len(real))
    for x in real[:6]:
        print("      ! " + x, flush=True)

    n = len(V.RES)
    ps = sum(1 for _, o, _ in V.RES if o)
    print("\n" + "=" * 60, flush=True)
    print("  对位探针%s：%d 项，通过 %d，失败 %d"
          % ("（移动端）" if mobile else "", n, ps, n - ps), flush=True)
    print("=" * 60, flush=True)

    ws.close()
    chrome.terminate()
    httpd.shutdown()
    return 0 if n == ps else 2


if __name__ == "__main__":
    sys.exit(main())
