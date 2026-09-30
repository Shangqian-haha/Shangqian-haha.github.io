# -*- coding: utf-8 -*-
"""照片幕探针：CDP 控制无头 Chrome 打开 /profile/，用键盘 ArrowDown 推进
   虚拟滚动，逐幕截图并回报「照片 / 标签盒 / 容器」的真实几何。

   用途：改 .cl-photo 尺寸（例如第 5 页竖图）前后做几何核对。

   必须在有 websocket-client 的 venv 下运行：
   C:\\Users\\刘宏展\\.workbuddy\\binaries\\python\\envs\\default\\Scripts\\python.exe
"""
import base64, json, os, subprocess, sys, time, urllib.request

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9337
URL = "http://localhost:4000/profile/"
OUT = r"D:/my-blog"
PROF = r"D:/my-blog/_chrome_prof2"

# 只看这几幕（照片幕 i=3..6 + 末幕联系幕 i=7）
WATCH = [3, 4, 5, 6, 7]

# 末幕（联系幕）专测：标题 / 描述文案 + emoji 是否真的渲染出字形
CONTACT = r"""
(function () {
  var sec = document.querySelector('.cl-sec[data-i="7"]');
  if (!sec) return null;
  var h = sec.querySelector('.cl-contact-title');
  var p = sec.querySelector('.cl-contact-desc');
  var out = {
    title: h ? h.textContent : null,
    desc: p ? p.textContent : null,
    titleW: h ? Math.round(h.getBoundingClientRect().width) : null,
    titleH: h ? Math.round(h.getBoundingClientRect().height) : null,
    descW: p ? Math.round(p.getBoundingClientRect().width) : null,
    titleFont: h ? getComputedStyle(h).fontFamily : null,
    titleSize: h ? getComputedStyle(h).fontSize : null
  };
  // emoji 兜底验证：用同一字体画一个纯 emoji 的 span，量宽度。
  // 若系统无 emoji 字体 → 宽度极小或等于 tofu 宽度，可据此报警。
  if (h) {
    var t = document.createElement('span');
    t.textContent = '\uD83D\uDE42\uD83D\uDE42\uD83D\uDE42';
    t.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;' +
                      'font:inherit;font-family:' + getComputedStyle(h).fontFamily +
                      ';font-size:40px;';
    document.body.appendChild(t);
    out.emojiW3 = Math.round(t.getBoundingClientRect().width);
    t.textContent = '\uFFFD\uFFFD\uFFFD';   // 豆腐块参照
    out.tofuW3 = Math.round(t.getBoundingClientRect().width);
    t.parentNode.removeChild(t);
    out.emojiLikelyOk = out.emojiW3 > 0 && Math.abs(out.emojiW3 - out.tofuW3) > 2;
  }
  return JSON.stringify(out);
})()
"""

GEO = r"""
(function (i) {
  var sec = document.querySelector('.cl-sec[data-i="' + i + '"]');
  if (!sec) return null;
  function rect(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    return {
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
      cw: cs.width, ch: cs.height, ratio: cs.aspectRatio,
      of: cs.objectFit, op: cs.objectPosition
    };
  }
  var item = sec.querySelector('.cl-photo-item');
  var ph = sec.querySelector('.cl-photo');
  var img = sec.querySelector('.cl-photo-img');
  var ft = sec.querySelector('.cl-featured');
  var op = sec.querySelector('.cl-opacity') || sec;
  return JSON.stringify({
    i: i,
    secOpacity: (+getComputedStyle(sec).opacity).toFixed(2),
    secTransform: getComputedStyle(sec).transform,
    item: rect(item), photo: rect(ph), featured: rect(ft),
    imgNat: img ? (img.naturalWidth + 'x' + img.naturalHeight) : null,
    imgSrc: img ? String(img.getAttribute('src')) : null,
    vw: window.innerWidth, vh: window.innerHeight
  });
})(%d)
"""


def jget(url, timeout=10):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


class CDP(object):
    def __init__(self, ws_url):
        import websocket
        self.ws = websocket.create_connection(ws_url, timeout=60, suppress_origin=True)
        self.i = 0
        self.pending = []

    def send(self, method, params=None, session=None):
        self.i += 1
        msg = {"id": self.i, "method": method, "params": params or {}}
        if session:
            msg["sessionId"] = session
        self.ws.send(json.dumps(msg))
        return self.i

    def wait(self, mid, timeout=60):
        end = time.time() + timeout
        while time.time() < end:
            self.ws.settimeout(max(0.5, end - time.time()))
            try:
                raw = self.ws.recv()
            except Exception:
                continue
            if not raw:
                continue
            m = json.loads(raw)
            if m.get("id") == mid:
                return m
            self.pending.append(m)
        raise RuntimeError("timeout waiting id=%s" % mid)

    def call(self, method, params=None, session=None, timeout=60):
        return self.wait(self.send(method, params, session), timeout)


def shot(c, sid, name, log):
    r = c.call("Page.captureScreenshot",
               {"format": "png", "captureBeyondViewport": False},
               session=sid, timeout=90)
    b64 = r.get("result", {}).get("data")
    if not b64:
        log.append("shot %s FAILED" % name)
        return
    p = os.path.join(OUT, "_ph_%s.png" % name)
    with open(p, "wb") as f:
        f.write(base64.b64decode(b64))
    log.append("shot %s -> %d bytes" % (name, os.path.getsize(p)))


def geo(c, sid, i, log, tag=""):
    r = c.call("Runtime.evaluate",
               {"expression": GEO % i, "returnByValue": True},
               session=sid, timeout=60)
    v = r.get("result", {}).get("result", {}).get("value")
    log.append("geo i=%d %s: %s" % (i, tag, v))
    return v


def main():
    if os.path.isdir(PROF):
        import shutil
        shutil.rmtree(PROF, ignore_errors=True)
    args = [
        CHROME, "--headless=new", "--no-first-run",
        "--no-default-browser-check", "--hide-scrollbars",
        "--autoplay-policy=no-user-gesture-required",
        "--window-size=1440,900",
        "--remote-debugging-port=%d" % PORT,
        "--user-data-dir=%s" % PROF,
        "about:blank",
    ]
    devnull = open(os.path.join(OUT, "_chrome_err2.txt"), "wb")
    proc = subprocess.Popen(args, stdout=devnull, stderr=devnull)
    log = []
    try:
        ver = None
        for _ in range(60):
            try:
                ver = jget("http://127.0.0.1:%d/json/version" % PORT, timeout=2)
                break
            except Exception:
                time.sleep(0.3)
        if not ver:
            raise RuntimeError("chrome CDP not reachable")
        log.append("cdp ok: " + ver.get("Browser", "?"))

        c = CDP(ver["webSocketDebuggerUrl"])
        t = c.call("Target.createTarget", {"url": "about:blank"})
        tid = t["result"]["targetId"]
        a = c.call("Target.attachToTarget", {"targetId": tid, "flatten": True})
        sid = a["result"]["sessionId"]
        c.call("Page.enable", session=sid)
        c.call("Runtime.enable", session=sid)

        c.call("Page.navigate", {"url": URL}, session=sid)
        # 等闸门走完（音频就绪 + 2.3s 自动进入）+ three 首帧
        time.sleep(11.0)
        r = c.call("Runtime.evaluate", {
            "expression": "JSON.stringify({booted: !!window.__clBooted, "
                          "js: document.querySelector('.cl') ? document.querySelector('.cl').className : null, "
                          "lock: document.body.classList.contains('cl-lock')})",
            "returnByValue": True}, session=sid, timeout=60)
        log.append("state: " + str(r.get("result", {}).get("result", {}).get("value")))

        # 首幕先量一遍（i=3..6 都在 DOM 里，尺寸与当前幕无关）
        for i in WATCH:
            geo(c, sid, i, log, "at-sec0")

        pos = 0
        for target in WATCH:
            while pos < target:
                for _ in range(1):
                    c.call("Input.dispatchKeyEvent",
                           {"type": "rawKeyDown", "key": "ArrowDown",
                            "code": "ArrowDown", "windowsVirtualKeyCode": 40,
                            "nativeVirtualKeyCode": 40}, session=sid)
                    c.call("Input.dispatchKeyEvent",
                           {"type": "keyUp", "key": "ArrowDown",
                            "code": "ArrowDown", "windowsVirtualKeyCode": 40,
                            "nativeVirtualKeyCode": 40}, session=sid)
                pos += 1
            time.sleep(2.2)   # 等缓动收敛
            geo(c, sid, target, log, "in-view")
            shot(c, sid, "i%d" % target, log)

        # 末幕文案专测（标题 Hi 🙂 / desc 新句）
        rc = c.call("Runtime.evaluate",
                    {"expression": CONTACT, "returnByValue": True},
                    session=sid, timeout=60)
        log.append("contact: " + str(rc.get("result", {}).get("result", {}).get("value")))

        c.call("Target.closeTarget", {"targetId": tid})
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=10)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        devnull.close()

    txt = "\n".join(log)
    with open(os.path.join(OUT, "_photo_geo.txt"), "w", encoding="utf-8") as f:
        f.write(txt)
    print(txt)


if __name__ == "__main__":
    main()
