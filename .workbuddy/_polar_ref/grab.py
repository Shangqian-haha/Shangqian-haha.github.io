# -*- coding: utf-8 -*-
"""从参考视频里抽帧（Chrome headless + CDP 控制 <video>，本机无 ffmpeg）。
用法: python grab.py
输出: D:/my-blog/.workbuddy/_polar_ref/f00.png ...
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request

import websocket

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = r"D:\my-blog\.workbuddy\_polar_ref"
PAGE = "file:///D:/my-blog/.workbuddy/_polar_ref/grab.html"
PORT = 9333
NFRAME = 8


class CDP(object):
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=40)
        self.i = 0
        self.events = []

    def cmd(self, method, params=None):
        self.i += 1
        mid = self.i
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError("%s -> %s" % (method, msg["error"]))
                return msg.get("result", {})
            self.events.append(msg)

    def ev(self, expr):
        r = self.cmd("Runtime.evaluate",
                     {"expression": expr, "awaitPromise": True, "returnByValue": True})
        res = r.get("result", {})
        if r.get("exceptionDetails"):
            raise RuntimeError("eval exception: %s" % json.dumps(r["exceptionDetails"])[:400])
        return res.get("value")


def main():
    prof = os.path.join(ROOT, "chrome-prof")
    if os.path.isdir(prof):
        subprocess.call(["cmd", "/c", "rmdir", "/s", "/q", prof])
    chrome = subprocess.Popen([
        CHROME, "--headless=new", "--disable-gpu", "--mute-audio",
        "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required",
        "--remote-allow-origins=*",
        "--remote-debugging-port=%d" % PORT,
        "--user-data-dir=" + prof,
        "--window-size=900,1500",
        "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    ws_url = None
    for _ in range(60):
        try:
            data = json.loads(urllib.request.urlopen(
                "http://127.0.0.1:%d/json/list" % PORT, timeout=2).read().decode("utf-8"))
            for t in data:
                if t.get("type") == "page":
                    ws_url = t["webSocketDebuggerUrl"]
                    break
            if ws_url:
                break
        except Exception:
            pass
        time.sleep(0.4)
    if not ws_url:
        print("chrome not reachable")
        chrome.terminate()
        return 1

    cdp = CDP(ws_url)
    cdp.cmd("Runtime.enable")
    cdp.cmd("Page.enable")
    cdp.cmd("Emulation.setDeviceMetricsOverride",
            {"width": 720, "height": 1280, "deviceScaleFactor": 1, "mobile": False})
    cdp.cmd("Page.navigate", {"url": PAGE})

    meta = None
    for _ in range(80):
        time.sleep(0.4)
        try:
            m = cdp.ev("window.__meta ? window.__meta() : null")
        except Exception:
            m = None
        if m and (m.get("ready") or m.get("err")):
            meta = m
            break
    print("meta:", json.dumps(meta, ensure_ascii=False))
    if not meta or not meta.get("ready"):
        cdp.ws.close()
        chrome.terminate()
        return 1

    print("init:", cdp.ev("window.__init()"))
    time.sleep(1.0)

    dur = float(meta["dur"])
    times = [round(dur * (i + 0.5) / NFRAME, 2) for i in range(NFRAME)]
    print("duration=%.2fs  frames at %s" % (dur, times))

    for idx, t in enumerate(times):
        got = cdp.ev("window.__seek(%f)" % t)
        shot = cdp.cmd("Page.captureScreenshot", {"format": "png"})
        raw = base64.b64decode(shot["data"])
        p = os.path.join(ROOT, "f%02d.png" % idx)
        with open(p, "wb") as f:
            f.write(raw)
        print("  f%02d want=%.2f got=%s  %d bytes" % (idx, t, got, len(raw)))

    # 顺便把滚动到中段的一帧也抓一张（参考运动时的形态）
    cdp.ws.close()
    chrome.terminate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
