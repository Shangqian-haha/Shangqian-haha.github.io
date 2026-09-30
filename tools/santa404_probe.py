# -*- coding: utf-8 -*-
"""404 雪夜（圣诞老人舔烟囱）探针。

   用途：改 404 的 canvas / CSS 后做端到端核对 ——
     · JS 有无报错；
     · 画布是否真的画上了东西（采样 getImageData：非透明像素占比 / 红色像素数）；
     · 画布是否为透明底无边框（「人物四周无框」的核心）；
     · 「回到首页」按钮是否在画布**下方**、href 是否正确；
     · 页面有没有横向溢出（100vw 拉满夜色带的经典坑）；
     · 两个时刻截图（t=1.2s base 状态 / t=4.6s pull 状态），确认动画在跑。

   必须在有 websocket-client 的 venv 下运行：
   C:\\Users\\刘宏展\\.workbuddy\\binaries\\python\\envs\\default\\Scripts\\python.exe
"""
import base64, json, os, subprocess, time, urllib.request

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9341
URL = os.environ.get("S404_URL", "http://localhost:4321/404.html")
OUT = r"D:/my-blog"
PROF = r"D:/my-blog/_chrome_prof404"

PROBE = r"""
JSON.stringify((function () {
  var out = {};
  var cv = document.getElementById('s404-canvas');
  var home = document.querySelector('.s404-home');
  var sec = document.querySelector('.s404');
  out.err = (window.__err || []);
  out.hasCanvas = !!cv;
  out.hasHome = !!home;
  if (cv) {
    var r = cv.getBoundingClientRect();
    var cs = getComputedStyle(cv);
    out.css = Math.round(r.width) + 'x' + Math.round(r.height);
    out.px = cv.width + 'x' + cv.height;
    out.rect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    out.border = cs.borderTopWidth + ' / ' + cs.borderLeftWidth;
    out.shadow = cs.boxShadow;
    out.bg = cs.backgroundColor;
    var d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    var step = 4 * 7, n = 0, nz = 0, red = 0, white = 0;
    for (var i = 0; i < d.length; i += step) {
      n++;
      var a = d[i + 3], R = d[i], G = d[i + 1], B = d[i + 2];
      if (a > 12) nz++;
      if (a > 12 && R > 170 && G < 130 && B < 140) red++;
      if (a > 12 && R > 230 && G > 230 && B > 230) white++;
    }
    out.sampled = n;
    out.inkPct = +(nz / n * 100).toFixed(2);
    out.redPct = +(red / n * 100).toFixed(2);
    out.whitePct = +(white / n * 100).toFixed(2);
  }
  if (sec) {
    var sr = sec.getBoundingClientRect();
    out.secRect = [Math.round(sr.left), Math.round(sr.top), Math.round(sr.width), Math.round(sr.height)];
    out.secCssW = getComputedStyle(sec).width;
    out.secML = getComputedStyle(sec).marginLeft;
    out.secBg = getComputedStyle(sec).backgroundImage.slice(0, 46);
  }
  out.mainRect = (function () {
    var m = document.querySelector('main');
    if (!m) return null;
    var r = m.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.width)];
  })();
  if (home && cv) {
    var hr = home.getBoundingClientRect();
    var cr = cv.getBoundingClientRect();
    out.homeRect = [Math.round(hr.left), Math.round(hr.top), Math.round(hr.width), Math.round(hr.height)];
    out.homeHref = home.getAttribute('href');
    out.homeBelowCanvas = Math.round(hr.top - cr.bottom);
    out.tipAboveHome = (function () {
      var t = document.querySelector('.s404-tip');
      return t ? Math.round(hr.top - t.getBoundingClientRect().bottom) : null;
    })();
  }
  out.vw = window.innerWidth;
  out.overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  out.badge = !!document.querySelector('.site-body > .hero-badge');
  return out;
})())
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
    r = c.call("Page.captureScreenshot", {"format": "png"}, session=sid, timeout=90)
    b64 = r.get("result", {}).get("data")
    if not b64:
        log.append("shot %s FAILED" % name)
        return
    p = os.path.join(OUT, "_s404_%s.png" % name)
    with open(p, "wb") as f:
        f.write(base64.b64decode(b64))
    log.append("shot %s -> %d bytes" % (name, os.path.getsize(p)))


def zoom(c, sid, name, log, rect):
    if not rect:
        return
    pad = 10
    clip = {
        "x": max(0, rect[0] - pad), "y": max(0, rect[1] - pad),
        "width": rect[2] + pad * 2, "height": rect[3] + pad * 2, "scale": 1.5,
    }
    r = c.call("Page.captureScreenshot", {"format": "png", "clip": clip},
               session=sid, timeout=90)
    b64 = r.get("result", {}).get("data")
    if not b64:
        log.append("zoom %s FAILED" % name)
        return
    p = os.path.join(OUT, "_s404z_%s.png" % name)
    with open(p, "wb") as f:
        f.write(base64.b64decode(b64))
    log.append("zoom %s -> %d bytes" % (name, os.path.getsize(p)))


def prob(c, sid, log, tag):
    r = c.call("Runtime.evaluate", {"expression": PROBE, "returnByValue": True},
               session=sid, timeout=60)
    v = r.get("result", {}).get("result", {}).get("value")
    log.append("--- probe %s ---" % tag)
    log.append(v if v else "NULL")
    try:
        return json.loads(v) if v else None
    except Exception:
        return None


def main():
    if os.path.isdir(PROF):
        import shutil
        shutil.rmtree(PROF, ignore_errors=True)
    args = [
        CHROME, "--headless=new", "--no-first-run",
        "--no-default-browser-check", "--hide-scrollbars",
        "--window-size=" + os.environ.get("S404_VIEW", "1440x900").replace("x", ","),
        "--remote-debugging-port=%d" % PORT,
        "--user-data-dir=%s" % PROF,
        "about:blank",
    ]
    devnull = open(os.path.join(OUT, "_chrome_err404.txt"), "wb")
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
        sid = c.call("Target.attachToTarget",
                     {"targetId": t["result"]["targetId"], "flatten": True})["result"]["sessionId"]
        c.call("Page.enable", session=sid)
        c.call("Runtime.enable", session=sid)
        c.call("Page.addScriptToEvaluateOnNewDocument", {
            "source": "window.__err=[];window.addEventListener('error',"
                      "function(e){window.__err.push(String(e.message))});"
        }, session=sid)

        c.call("Page.navigate", {"url": URL}, session=sid)
        time.sleep(1.2)
        p1 = prob(c, sid, log, "t1.2 base")
        shot(c, sid, "t120", log)
        zoom(c, sid, "t120", log, (p1 or {}).get("rect"))

        time.sleep(3.4)
        p2 = prob(c, sid, log, "t4.6 pull")
        shot(c, sid, "t460", log)
        zoom(c, sid, "t460", log, (p2 or {}).get("rect"))

        log.append("--- summary ---")
        if p1 and p2:
            log.append("ink %s%% -> %s%%  red %s%% -> %s%%  white %s%% -> %s%%" % (
                p1.get("inkPct"), p2.get("inkPct"), p1.get("redPct"), p2.get("redPct"),
                p1.get("whitePct"), p2.get("whitePct")))
            log.append("home below canvas = %s px, href = %s" % (
                p1.get("homeBelowCanvas"), p1.get("homeHref")))
            log.append("canvas border=%s shadow=%s bg=%s" % (
                p1.get("border"), p1.get("shadow"), p1.get("bg")))
            log.append("overflowX=%s badge=%s" % (p1.get("overflowX"), p1.get("badge")))
    except Exception as e:
        log.append("ERROR: %s" % e)
    finally:
        try:
            proc.kill()
        except Exception:
            pass
        devnull.close()
    with open(os.path.join(OUT, "_s404_out.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(str(x) for x in log))


if __name__ == "__main__":
    main()
