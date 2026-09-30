# -*- coding: utf-8 -*-
"""闸门时序探针：CDP 控制无头 Chrome 打开 /profile/，
   从「文档创建瞬间」开始逐帧记录闸门 / 正文 / 音频状态，并在若干时刻截图。

   必须在有 websocket-client 的 venv 下运行：
   C:\\Users\\刘宏展\\.workbuddy\\binaries\\python\\envs\\default\\Scripts\\python.exe
"""
import base64, json, os, subprocess, sys, time, urllib.request

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PORT = 9333
URL = "http://localhost:4000/profile/"
OUT = r"D:/my-blog"
PROF = r"D:/my-blog/_chrome_prof"

MON = r"""
(function () {
  try {
    var M = window.__mon = { t0: performance.now(), n: 0, ev: [] };
    function snap(tag) {
      var h = document.documentElement;
      var gate = document.getElementById('cl-gate');
      var cs = gate ? getComputedStyle(gate) : null;
      var hint = document.querySelector('.cl-gate-hint');
      var fill = document.querySelector('.cl-gate-fill');
      var main = document.querySelector('.cl');
      var mcs = main ? getComputedStyle(main) : null;
      var a = window.__pfAudio;
      return {
        t: Math.round(performance.now()),
        tag: tag,
        cls: h && h.className ? String(h.className) : null,
        gate: cs ? cs.display + '/' + cs.position : null,
        main: mcs ? mcs.display + '/' + mcs.visibility : null,
        lock: document.body ? document.body.classList.contains('cl-lock') : null,
        hint: hint ? hint.textContent.trim() : null,
        w: fill ? fill.style.width : null,
        aReady: a ? !!a.ready : null,
        aRatio: a ? Math.round((a.ratio || 0) * 1000) / 1000 : null,
        aFail: a ? !!a.failed : null
      };
    }
    function key(s) {
      return [s.cls, s.gate, s.main, s.lock, s.hint, s.aReady, s.aFail].join('|');
    }
    var first = snap('first');
    M.ev.push(first);
    var lastKey = key(first);
    (function loop() {
      if (M.n > 1500) return;
      M.n++;
      /* 模拟慢音频：hold 期间把 __pfAudio 压回「未就绪」，hold 结束恢复。
         用于在快网下验证 clouds.js 的 ae 渐近兜底 + 「正在缓冲音乐」提示 */
      try {
        var a = window.__pfAudio;
        if (a) {
          if (performance.now() < M.t0 + 6000) { a.ready = false; a.failed = false; a.ratio = 0; }
          else if (!a.__restored) { a.__restored = true; a.ready = true; }
        }
      } catch (e) {}
      var s = snap('raf');
      var k = key(s);
      if (k !== lastKey || M.n % 30 === 0) {
        lastKey = k; s.n = M.n; M.ev.push(s);
        if (M.ev.length > 400) return;
      }
      requestAnimationFrame(loop);
    })();
    try {
      new PerformanceObserver(function (l) {
        l.getEntries().forEach(function (e) {
          M.ev.push({ t: Math.round(e.startTime), tag: 'paint:' + e.name });
        });
      }).observe({ entryTypes: ['paint'] });
    } catch (e) {}
  } catch (e) {
    window.__monErr = String(e);
  }
})();
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


def main():
    if os.path.isdir(PROF):
        import shutil
        shutil.rmtree(PROF, ignore_errors=True)
    args = [
        CHROME, "--headless=new", "--disable-gpu", "--no-first-run",
        "--no-default-browser-check", "--hide-scrollbars",
        "--autoplay-policy=no-user-gesture-required",
        "--window-size=1440,900",
        "--remote-debugging-port=%d" % PORT,
        "--user-data-dir=%s" % PROF,
        "about:blank",
    ]
    devnull = open(os.path.join(OUT, "_chrome_err.txt"), "wb")
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
        c.call("Page.addScriptToEvaluateOnNewDocument", {"source": MON}, session=sid)

        # 快网 + 注入级慢音频模拟（hold 6s）—— 验证 ae 兜底与提示语
        nav = c.call("Page.navigate", {"url": URL}, session=sid)
        if nav.get("result", {}).get("errorText"):
            log.append("NAV ERROR: " + nav["result"]["errorText"])
        t_start = time.time()

        shots = [("t050", 0.50), ("t150", 1.50), ("t300", 3.00),
                 ("t500", 5.00), ("t650", 6.50), ("t900", 9.00),
                 ("t1150", 11.50), ("t1400", 14.00)]
        for name, at in shots:
            d = at - (time.time() - t_start)
            if d > 0:
                time.sleep(d)
            r = c.call("Page.captureScreenshot",
                       {"format": "png", "captureBeyondViewport": False},
                       session=sid, timeout=90)
            b64 = r.get("result", {}).get("data")
            p = os.path.join(OUT, "_gt_%s.png" % name)
            if b64:
                with open(p, "wb") as f:
                    f.write(base64.b64decode(b64))
                log.append("shot %s @%.2fs -> %d bytes" % (
                    name, time.time() - t_start, os.path.getsize(p)))
            else:
                log.append("shot %s FAILED: %s" % (name, json.dumps(r)[:300]))

            # 闸门特写：元素级 clip 截图（2x），覆盖小猪 + LOADING + 进度条，
            # 顺带回报小猪动画与文字字体的实际计算值
            if name in ("t150", "t300", "t500"):
                er = c.call("Runtime.evaluate", {
                    "expression": "JSON.stringify((function(){"
                                  "var e=document.querySelector('.cl-gate-pig');if(!e)return null;"
                                  "var t=document.querySelector('.cl-gate-track');"
                                  "var l=document.querySelector('.cl-gate-loading');"
                                  "var r=e.getBoundingClientRect();"
                                  "var r2=t?t.getBoundingClientRect():r;"
                                  "var r3=l?l.getBoundingClientRect():{left:r.left,right:r.left,top:r.top,bottom:r.top,width:0,height:0};"
                                  "var lcs=l?getComputedStyle(l):null;"
                                  "return {x:Math.min(r.left,r2.left,r3.left),y:Math.min(r.top,r3.top),"
                                  "w:Math.max(r.right,r2.right,r3.right)-Math.min(r.left,r2.left,r3.left),"
                                  "h:Math.max(r2.bottom,r3.bottom)-Math.min(r.top,r3.top),"
                                  "anim:getComputedStyle(e).animationName,"
                                  "ltxt:l?l.textContent:null,lfont:lcs?lcs.fontFamily:null,"
                                  "lsize:lcs?lcs.fontSize:null,lop:lcs?(+lcs.opacity).toFixed(2):null,"
                                  "lfam:lcs?lcs.fontFamily.split(',')[0]:null,"
                                  "fonts:(function(){var a=[];document.fonts.forEach(function(f){a.push(f.family+'='+f.status);});return a.join('|');})(),"
                                  "lbox:[Math.round(r3.left),Math.round(r3.top),Math.round(r3.width),Math.round(r3.height)],"
                                  "ok:r.width>0&&r.height>0};})())",
                    "returnByValue": True}, session=sid, timeout=60)
                ev = er.get("result", {}).get("result", {}).get("value")
                log.append("gate %s: %s" % (name, ev))
                try:
                    info = json.loads(ev) if ev else None
                except Exception:
                    info = None
                if info and info.get("ok"):
                    pad = 26
                    clip = {"x": max(0, info["x"] - pad), "y": max(0, info["y"] - pad),
                            "width": info["w"] + pad * 2,
                            "height": info["h"] + pad * 2, "scale": 2}
                    rz = c.call("Page.captureScreenshot",
                                {"format": "png", "clip": clip},
                                session=sid, timeout=90)
                    b2 = rz.get("result", {}).get("data")
                    if b2:
                        pz = os.path.join(OUT, "_zoom_%s.png" % name)
                        with open(pz, "wb") as f:
                            f.write(base64.b64decode(b2))
                        log.append("zoom %s -> %d bytes (clip %.0fx%.0f css)" % (
                            name, os.path.getsize(pz), clip["width"], clip["height"]))

        # 状态时间线
        r = c.call("Runtime.evaluate",
                   {"expression": "JSON.stringify({mon: window.__mon, err: window.__monErr || null})",
                    "returnByValue": True}, session=sid, timeout=90)
        val = r.get("result", {}).get("result", {}).get("value")
        if val:
            data = json.loads(val)
            log.append("__monErr = %s" % data.get("err"))
            ev = (data.get("mon") or {}).get("ev") or []
            log.append("timeline events = %d, raf frames = %d" % (
                len(ev), (data.get("mon") or {}).get("n")))
            for e in ev:
                log.append("  %(t)6sms n=%(n)s %(tag)s | cls=%(cls)s | gate=%(gate)s | "
                           "main=%(main)s | lock=%(lock)s | hint=%(hint)s | w=%(w)s | "
                           "aReady=%(aReady)s ratio=%(aRatio)s fail=%(aFail)s" % {
                               k: e.get(k) for k in
                               ("t", "n", "tag", "cls", "gate", "main", "lock",
                                "hint", "w", "aReady", "aRatio", "aFail")})
        else:
            log.append("evaluate returned nothing: " + json.dumps(r)[:400])

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
    with open(os.path.join(OUT, "_gate_tl.txt"), "w", encoding="utf-8") as f:
        f.write(txt)
    print(txt)


if __name__ == "__main__":
    main()
