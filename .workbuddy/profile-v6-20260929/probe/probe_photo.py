# -*- coding: utf-8 -*-
"""探针：/profile/ v6 照片幕（i=4..7）。
验证：
  · 四张照片真实载入（naturalWidth > 0）且 src 正确
  · 标签（主标题/副标题）文本正确、无任何 <a>、箭头 svg 在
  · 幕浮现过半时 .is-in 挂上、遮罩滑开（逐行揭示）
  · 标签右下角对位（右缘 ≈ 右内边距，底缘在视口内）
  · v6 背景策略：照片覆盖时极光 alpha 收敛（__clDebug.aurora）
  · 无 JS 报错
"""
import json
import os
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
PROF = os.path.join(OUT, "chrome-prof-photo")
CDP_PORT = V.CDP_PORT + 31

EXPECT = [
    (4, "photo-guidian.jpg", u"桂电的天空很美。", u"那是一段短暂而小有遗憾的时光。"),
    (5, "photo-jingdezhen.jpg", u"景德镇。", u"你也为景德镇着迷吗小猫咪。"),
    (6, "photo-guilin.jpg", u"桂林山水甲天下。", u"玉碧罗青意可参。"),
    (7, "photo-rivernight.jpg", u"我接受不了每个人都是阶段性的存在。", u"于是我活得越来越念旧。"),
]

DIAG = r"""(function(){
  var i = %d;
  var sec = document.querySelector('.cl-sec[data-i="' + i + '"]');
  if (!sec) return null;
  var img = sec.querySelector('.cl-photo-img');
  var ft  = sec.querySelector('.cl-featured');
  var mask = sec.querySelector('.split-line-mask');
  var r = ft ? ft.getBoundingClientRect() : null;
  var mt = mask ? getComputedStyle(mask).transform : '';
  var mE = null;
  if (mt && mt.indexOf('matrix') === 0) {
    var v = mt.replace(/matrix\(|\)/g, '').split(',');
    mE = parseFloat(v[4]);
  }
  return {
    imgOK: !!(img && img.complete && img.naturalWidth > 0),
    src: img ? (img.currentSrc || img.src).split('/').pop() : '',
    title: ((sec.querySelector('.cl-featured-desc .split-line') || {}).textContent || '').trim(),
    sub: ((sec.querySelector('.cl-featured-client .split-line') || {}).textContent || '').trim(),
    isIn: sec.classList.contains('is-in'),
    maskE: mE, maskW: mask ? mask.getBoundingClientRect().width : 0,
    links: sec.querySelectorAll('a').length,
    arrow: !!sec.querySelector('.cl-featured-arrow'),
    labelR: r ? Math.round(r.right) : null,
    labelB: r ? Math.round(r.bottom) : null,
    op: parseFloat(getComputedStyle(sec).opacity)
  };
})()"""


def wheel(cdp, n, dy=300):
    for _ in range(n):
        cdp.cmd("Input.dispatchMouseEvent",
                {"type": "mouseWheel", "x": 720, "y": 450, "deltaX": 0, "deltaY": dy})
        time.sleep(0.12)


def key_scroll(cdp, key, times):
    """键盘逐幕导航 —— clouds.js 里 ArrowDown/Up 每次精确移动一幕"""
    code = 'ArrowDown' if key == 'ArrowDown' else 'ArrowUp'
    vk = 40 if key == 'ArrowDown' else 38
    for _ in range(times):
        cdp.cmd("Input.dispatchKeyEvent", {"type": "keyDown", "key": key,
                                           "code": code, "windowsVirtualKeyCode": vk})
        cdp.cmd("Input.dispatchKeyEvent", {"type": "keyUp", "key": key,
                                           "code": code, "windowsVirtualKeyCode": vk})
        time.sleep(0.3)


def wait_op(cdp, idx, want=0.9, tries=40):
    for _ in range(tries):
        op = cdp.ev("(function(){var e=document.querySelector('.cl-sec[data-i=\"%d\"]');"
                    "return e?parseFloat(getComputedStyle(e).opacity):-1;})()" % idx)
        if op is not None and op >= want:
            time.sleep(0.6)
            return op
        time.sleep(0.25)
    return None


def main():
    httpd = V.start_server()
    print("[srv] %s" % BASE, flush=True)
    V.check("静态服务可用", True)
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

    V.nav_to(cdp, BASE + "/profile/", settle=0.8)
    time.sleep(6.5)
    cdp.ev("document.querySelector('.cl-gate') && "
           "document.querySelector('.cl-gate').classList.contains('is-done')")

    # ---- 结构 ----
    meta = cdp.ev("""(function(){
      return {nsec: document.querySelectorAll('.cl-sec').length,
              photos: document.querySelectorAll('.cl-photo').length,
              featured: document.querySelectorAll('.cl-featured').length,
              linksInPhoto: document.querySelectorAll('.cl-sec a').length,
              padR: parseFloat(getComputedStyle(document.querySelector('.cl-sec')).paddingRight),
              W: innerWidth, H: innerHeight};
    })()""")
    print("  meta = " + json.dumps(meta, ensure_ascii=False), flush=True)
    W, H, padR = meta["W"], meta["H"], meta["padR"]
    V.check("八幕结构（4 文字 + 4 照片）", meta["nsec"] == 8, str(meta["nsec"]))
    V.check("照片层/标签各 4 份", meta["photos"] == 4 and meta["featured"] == 4,
            "%d/%d" % (meta["photos"], meta["featured"]))

    # ---- 逐幕（键盘精确导航：每次一幕）----
    cur = 0
    for idx, fname, title, sub in EXPECT:
        if idx > cur:
            key_scroll(cdp, "ArrowDown", idx - cur)
        elif idx < cur:
            key_scroll(cdp, "ArrowUp", cur - idx)
        cur = idx
        op = wait_op(cdp, idx)
        d = cdp.ev(DIAG % idx)
        if d is not None and isinstance(d, dict):
            d["op"] = op if op is not None else d.get("op")
        if not d:
            raw = cdp.cmd('Runtime.evaluate', {'expression': DIAG % idx,
                                               'returnByValue': True})
            print("  RAW 幕%d = %s" % (idx, json.dumps(raw, ensure_ascii=False)[:500]),
                  flush=True)
        print("  幕%d = %s" % (idx, json.dumps(d, ensure_ascii=False)[:260]), flush=True)
        tag = "幕%d" % idx
        if not d:
            V.check("%s 幕存在" % tag, False, "null")
            continue
        V.check("%s 照片已载入且为 %s" % (tag, fname),
                d["imgOK"] and d["src"] == fname, "src=%s ok=%s" % (d["src"], d["imgOK"]))
        V.check("%s 主标题文本" % tag, d["title"] == title, d["title"])
        V.check("%s 副标题文本" % tag, d["sub"] == sub, d["sub"])
        V.check("%s 无超链接（要求：取消链接）" % tag, d["links"] == 0, str(d["links"]))
        V.check("%s 箭头装饰在" % tag, d["arrow"] is True, "")
        V.check("%s 浮现过半挂 is-in" % tag, d["isIn"] is True and d["op"] > 0.55,
                "op=%.2f isIn=%s" % (d["op"], d["isIn"]))
        revealed = d["maskE"] is not None and d["maskW"] > 0 and d["maskE"] > d["maskW"] * 0.5
        V.check("%s 遮罩已滑开（揭示完成）" % tag, revealed,
                "maskE=%s maskW=%s" % (d["maskE"], d["maskW"]))
        dr = (W - d["labelR"]) - padR if d["labelR"] else None
        db = H - d["labelB"] if d["labelB"] else None
        V.check("%s 标签右下角（|Δr|=%.0f≤16，db/H=%.2f）" % (tag, dr or -1, (db or 0) / float(H)),
                dr is not None and abs(dr) <= 16 and 0.02 * H <= db <= 0.30 * H,
                "labelR=%s labelB=%s" % (d["labelR"], d["labelB"]))

    # ---- v6 背景策略：照片覆盖时极光收敛 ----
    a_cover = cdp.ev("window.__clDebug.aurora.uniforms.uAlpha.value")
    key_scroll(cdp, "ArrowUp", 7)
    time.sleep(1.4)
    a_top = cdp.ev("window.__clDebug.aurora.uniforms.uAlpha.value")
    print("  aurora uAlpha: covered=%.3f top=%.3f" % (a_cover, a_top), flush=True)
    V.check("照片幕下极光收敛（uAlpha < 0.8）", a_cover is not None and a_cover < 0.8,
            "%.3f" % (a_cover or -1))
    V.check("回到首幕极光恢复（uAlpha > 0.95）", a_top is not None and a_top > 0.95,
            "%.3f" % (a_top or -1))

    e = V.errs(cdp)
    real = [x for x in e if "err_connection_reset" not in x.lower()]
    V.check("无 JS 报错", len(real) == 0, "%d 条" % len(real))
    for x in real[:6]:
        print("      ! " + x, flush=True)

    n = len(V.RES)
    ps = sum(1 for _, o, _ in V.RES if o)
    print("\n" + "=" * 60, flush=True)
    print("  照片幕探针：%d 项，通过 %d，失败 %d" % (n, ps, n - ps), flush=True)
    print("=" * 60, flush=True)

    ws.close()
    chrome.terminate()
    httpd.shutdown()
    return 0 if n == ps else 2


if __name__ == "__main__":
    sys.exit(main())
