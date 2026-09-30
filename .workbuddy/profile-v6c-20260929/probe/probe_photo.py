# -*- coding: utf-8 -*-
"""探针：/profile/ v6c 照片幕（i=3..6，Say hi 联系幕在 i=7）。
验证：
  · 四张照片真实载入（naturalWidth > 0）且 src 正确
  · 标签（主标题/副标题）文本正确、无任何 <a>、箭头 svg 在
  · 幕浮现过半时 .is-in 挂上、遮罩滑开（逐行揭示）
  · 卡片式布局（v6b）：照片卡片不铺满（四周有极夜底色边距）、
    标签盒压在卡片右下角且向外探出（右缘/下缘越过卡片边角）
  · v6 背景策略：照片幕停留时极光 alpha 收敛（__clDebug.aurora）
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
    (3, "photo-guidian.jpg", u"桂电的天空很美。", u"那是一段短暂而小有遗憾的时光。"),
    (4, "photo-jingdezhen.jpg", u"景德镇。", u"你也为景德镇着迷吗小猫咪。"),
    (5, "photo-guilin.jpg", u"桂林山水甲天下。", u"玉碧罗青意可参。"),
    (6, "photo-rivernight.jpg", u"我接受不了每个人都是阶段性的存在。", u"于是我活得越来越念旧。"),
]

DIAG = r"""(function(){
  var i = %d;
  var W0 = innerWidth, H0 = innerHeight;
  var sec = document.querySelector('.cl-sec[data-i="' + i + '"]');
  if (!sec) return null;
  var img = sec.querySelector('.cl-photo-img');
  var ft  = sec.querySelector('.cl-featured');
  var card = sec.querySelector('.cl-photo');
  var item = sec.querySelector('.cl-photo-item');
  var mask = sec.querySelector('.split-line-mask');
  var desc = sec.querySelector('.cl-featured-desc');
  var cli  = sec.querySelector('.cl-featured-client');
  var svg  = sec.querySelector('.cl-featured-arrow');
  function rc(e){ if(!e) return null; var r=e.getBoundingClientRect();
    return {l:Math.round(r.left), t:Math.round(r.top), r:Math.round(r.right),
            b:Math.round(r.bottom), w:Math.round(r.width), h:Math.round(r.height)}; }
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
    maskBg: mask ? getComputedStyle(mask).backgroundColor : '',
    links: sec.querySelectorAll('a').length,
    arrow: rc(svg),
    card: rc(card),
    label: rc(ft),
    labelCS: ft ? {bg: getComputedStyle(ft).backgroundColor,
                   rad: card ? getComputedStyle(card).borderRadius : ''} : null,
    descFS: desc ? getComputedStyle(desc).fontSize : '',
    descFW: desc ? getComputedStyle(desc).fontWeight : '',
    cliFS: cli ? getComputedStyle(cli).fontSize : '',
    itemFS: item ? getComputedStyle(item).fontSize : '',
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
              items: document.querySelectorAll('.cl-photo-item').length,
              linksInPhoto: document.querySelectorAll('.cl-sec a').length,
              padR: parseFloat(getComputedStyle(document.querySelector('.cl-sec')).paddingRight),
              W: innerWidth, H: innerHeight};
    })()""")
    print("  meta = " + json.dumps(meta, ensure_ascii=False), flush=True)
    W, H, padR = meta["W"], meta["H"], meta["padR"]
    V.check("八幕结构（4 文字 + 4 照片，Say hi 在最后）", meta["nsec"] == 8, str(meta["nsec"]))
    V.check("照片层/标签/容器各 4 份", meta["photos"] == 4 and
            meta["featured"] == 4 and meta["items"] == 4,
            "%d/%d/%d" % (meta["photos"], meta["featured"], meta["items"]))

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
        V.check("%s 箭头装饰在" % tag, bool(d.get("arrow")), "")
        V.check("%s 浮现过半挂 is-in" % tag, d["isIn"] is True and d["op"] > 0.55,
                "op=%.2f isIn=%s" % (d["op"], d["isIn"]))
        revealed = d["maskE"] is not None and d["maskW"] > 0 and d["maskE"] > d["maskW"] * 0.5
        V.check("%s 遮罩已滑开（揭示完成）" % tag, revealed,
                "maskE=%s maskW=%s" % (d["maskE"], d["maskW"]))
        # v6c 严格规格断言：几何逐项对齐 index.anheyu.com 实测值
        card, lab = d.get("card"), d.get("label")
        lcs = d.get("labelCS") or {}
        if not card or not lab:
            V.check("%s 照片卡/标签盒存在" % tag, False, "missing")
            continue
        if W <= 1280:
            g = (abs(card["l"] - 0.05 * W) <= 10 and abs(card["w"] - 0.90 * W) <= 14 and
                 abs(lab["l"] - card["l"]) <= 5 and abs(lab["r"] - card["r"]) <= 5 and
                 abs(lab["t"] - card["t"]) <= 5 and abs(lab["b"] - card["b"]) <= 5)
            V.check("%s ≤1280：标签铺满图片（参考站行为）" % tag, g,
                    "card=%s label=%s" % (card, lab))
        else:
            contL, contR = 0.08 * W, W - 0.08 * W
            iw = 960 if W <= 1440 else 1088
            ih = 540 if W <= 1440 else 612
            lw = 360 if W <= 1440 else 420
            texp = (H - ih - 60) / 2.0
            g1 = (abs(card["l"] - contL) <= 8 and abs(card["w"] - iw) <= 3 and
                  abs(card["h"] - ih) <= 3 and abs(card["t"] - texp) <= 14)
            V.check("%s 图片 = 参考站 %dx%d、84%% 容器左对齐" % (tag, iw, ih), g1,
                    "card=%s exp(l=%.0f,t=%.0f)" % (card, contL, texp))
            g2 = (abs(lab["r"] - contR) <= 8 and
                  abs(lab["b"] - (card["b"] + 60)) <= 5 and
                  abs(lab["w"] - lw) <= 3)
            V.check("%s 标签盒 = right:0/bottom:-60px/w%d（参考站同款）" % (tag, lw), g2,
                    "label=%s expR=%.0f expB=%.0f" % (lab, contR, card["b"] + 60))
            V.check("%s 标签盒压图片右下角（水平+垂直重叠）" % tag,
                    lab["l"] < card["r"] and lab["t"] < card["b"], "")
        V.check("%s 标签盒底色 #040404" % tag,
                lcs.get("bg") == "rgb(4, 4, 4)", str(lcs.get("bg")))
        V.check("%s 图片圆角 25px" % tag, lcs.get("rad") == "25px", str(lcs.get("rad")))
        _fs = (d.get("descFS") or "").replace("px", "")
        V.check("%s 主标题 21.6px/700（参考站 1.2em）" % tag,
                _fs and abs(float(_fs) - 21.6) <= 1.2 and d.get("descFW") == "700",
                "%s/%s" % (d.get("descFS"), d.get("descFW")))
        _fc = (d.get("cliFS") or "").replace("px", "")
        V.check("%s 副标题 12.6px（参考站 0.7em）" % tag,
                _fc and abs(float(_fc) - 12.6) <= 1.0, str(d.get("cliFS")))
        _ar = d.get("arrow") or {}
        V.check("%s 箭头 18px、贴右下 30/34（参考站同款）" % tag,
                _ar and abs(_ar.get("w", 0) - 18) <= 2.5 and
                abs((lab["r"] - _ar.get("r", 0)) - 30) <= 5 and
                abs((lab["b"] - _ar.get("b", 0)) - 34) <= 5,
                "arrow=%s" % (_ar,))
        V.check("%s 遮罩为参考站原色 #fff" % tag,
                d.get("maskBg") == "rgb(255, 255, 255)", str(d.get("maskBg")))
        V.check("%s em 基准 18px" % tag, d.get("itemFS") == "18px",
                str(d.get("itemFS")))

    # ---- v6 背景策略：照片覆盖时极光收敛 ----
    a_cover = cdp.ev("window.__clDebug.aurora.uniforms.uAlpha.value")
    key_scroll(cdp, "ArrowUp", 6)
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
