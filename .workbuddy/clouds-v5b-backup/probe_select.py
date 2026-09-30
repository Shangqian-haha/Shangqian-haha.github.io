# -*- coding: utf-8 -*-
"""/clouds/ 文字不可选取探针（CDP 真实鼠标拖拽）。

判据：
  1) body 带 cl-body；关键文字节点 computed user-select = none
  2) 在 /clouds/ 的文字上「按下左键 → 横拖 → 松手」后 window.getSelection() 为空
  3) 对照组：在首页做同样动作，能选中文字（证明拖拽手法本身有效，
     否则第 2 条可能是因为别的原因"选不中"）
  4) 回归：左键按下时猫仍张嘴（user-select 不影响点击链）
"""
import io, os, json, time, subprocess, threading
import urllib.request
import websocket

BASE = r'D:/WB缓存/2026-09-25-09-05-38/_london_v2'
PROF = os.path.join(BASE, 'chrome-prof')
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
LOCAL = 'http://localhost:4000'

RES = {'N': 0, 'PASS': 0}


def check(name, cond, detail=''):
    RES['N'] += 1
    if cond:
        RES['PASS'] += 1
        print('  [PASS] %s %s' % (name, detail))
    else:
        print('  [FAIL] %s %s' % (name, detail))


if os.path.isdir(PROF):
    for f in os.listdir(PROF):
        if f.startswith('Singleton'):
            try:
                os.remove(os.path.join(PROF, f))
            except Exception:
                pass

proc = subprocess.Popen([
    CHROME, '--headless=new', '--disable-gpu', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--window-size=1280,900',
    '--user-data-dir=' + PROF, '--remote-allow-origins=*',
    '--remote-debugging-port=9333', 'about:blank',
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

ws_url = None
for i in range(60):
    try:
        d = json.loads(urllib.request.urlopen(
            'http://127.0.0.1:9333/json/version', timeout=2).read())
        ws_url = d['webSocketDebuggerUrl']
        break
    except Exception:
        time.sleep(0.5)
ws = websocket.create_connection(ws_url, timeout=60)
mid = [0]


def cmd(method, params=None, session_id=None):
    mid[0] += 1
    i = mid[0]
    msg = {'id': i, 'method': method, 'params': params or {}}
    if session_id:
        msg['sessionId'] = session_id
    ws.send(json.dumps(msg))
    while True:
        m = json.loads(ws.recv())
        if m.get('method'):
            continue
        if m.get('id') == i:
            return m.get('result', {})


tgt = cmd('Target.createTarget', {'url': 'about:blank'})['targetId']
sess = cmd('Target.attachToTarget', {'targetId': tgt, 'flatten': True})['sessionId']
P = lambda m, p=None: cmd(m, p, sess)


def ev(expr):
    r = P('Runtime.evaluate', {'expression': expr, 'returnByValue': True,
                               'awaitPromise': True})
    res = r.get('result', {})
    if res.get('subtype') == 'error':
        print('   [JS ERR]', (res.get('description') or '')[:200])
    return res.get('value')


def nav(url):
    P('Page.navigate', {'url': url})
    for i in range(60):
        time.sleep(0.25)
        if ev('document.readyState') == 'complete':
            break
    time.sleep(0.8)


def drag(x1, y1, x2, y2, steps=8):
    """真实鼠标：按下 → 分步移动（带 buttons=1）→ 松开"""
    P('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x1, 'y': y1})
    time.sleep(0.08)
    P('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': x1, 'y': y1,
                                   'button': 'left', 'buttons': 1, 'clickCount': 1})
    for s in range(1, steps + 1):
        x = x1 + (x2 - x1) * s / float(steps)
        y = y1 + (y2 - y1) * s / float(steps)
        P('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y,
                                       'button': 'left', 'buttons': 1})
        time.sleep(0.03)
    P('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': x2, 'y': y2,
                                   'button': 'left', 'buttons': 0, 'clickCount': 1})
    time.sleep(0.25)


P('Page.enable')
P('Runtime.enable')

# 找视口内可拖拽的文字块的矩形
FIND_RECT = """
(function(sel){
  var els = document.querySelectorAll(sel);
  for (var i = 0; i < els.length; i++) {
    var e = els[i];
    var r = e.getBoundingClientRect();
    var st = getComputedStyle(e);
    if (r.width > 40 && r.height > 12 && r.top > 60 && r.bottom < innerHeight - 20
        && r.left > 20 && r.right < innerWidth - 20
        && st.visibility !== 'hidden' && st.display !== 'none'
        && parseFloat(st.opacity) > 0.4
        && (e.textContent || '').trim().length > 4) {
      return {x1: Math.round(r.left + 4), y1: Math.round(r.top + r.height * 0.5),
              x2: Math.round(r.right - 4), y2: Math.round(r.top + r.height * 0.5),
              txt: (e.textContent || '').trim().slice(0, 24)};
    }
  }
  return null;
})('%s')
"""

print('\n===== 一、/clouds/ 个人主页：应"选不中" =====')
nav(LOCAL + '/clouds/')
check('body 带 cl-body 类',
      'cl-body' in (ev('document.body.className') or ''),
      ev('document.body.className'))

# 等入场闸门出现/JS 就绪
for i in range(40):
    if ev("!!document.querySelector('.cl.js-on')"):
        break
    time.sleep(0.25)

# 关键节点的 computed user-select
for sel, label in (('body', 'body'), ('.cl', '根 .cl'), ('.cl-title', '第一幕大标题'),
                   ('.cl-text', '正文段落'), ('.cl-brand span', '顶栏副标')):
    v = ev('(function(){var e=document.querySelector("%s");'
           'return e?getComputedStyle(e).webkitUserSelect||getComputedStyle(e).userSelect:null})()' % sel)
    check('%s user-select=none' % label, v == 'none', v)

# 进闸门（点击任意处），再滚到第一幕
cx, cy = 640, 450
P('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': cx, 'y': cy,
                               'button': 'left', 'buttons': 1, 'clickCount': 1})
P('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': cx, 'y': cy,
                               'button': 'left', 'buttons': 0, 'clickCount': 1})
time.sleep(1.2)

rect = ev(FIND_RECT % '.cl-sec[data-i="0"] .cl-title, .cl-sec[data-i="0"] .cl-label, '
                     '.cl-sec[data-i="0"] .cl-text, .cl-sec[data-i="0"] .cl-quote')
if not rect:
    rect = ev(FIND_RECT % '.cl-sec .cl-title, .cl-sec .cl-text')
print('  拖拽目标:', rect)
check('找到视口内文字块', bool(rect))
if rect:
    drag(rect['x1'], rect['y1'], rect['x2'], rect['y2'])
    sel_txt = ev('String(window.getSelection())')
    n_ranges = ev('window.getSelection().rangeCount')
    check('拖拽后未选中任何文字', (sel_txt or '') == '', repr(sel_txt))
    check('selection 无 range', (n_ranges or 0) == 0, n_ranges)

print('\n===== 二、对照组：首页同样拖拽，应能选中 =====')
nav(LOCAL + '/')
r2 = ev(FIND_RECT % 'h1, h2, p, .home-hero h1, .post-card-title, .hero-title')
print('  拖拽目标:', r2)
check('首页找到文字块', bool(r2))
if r2:
    drag(r2['x1'], r2['y1'], r2['x2'], r2['y2'])
    t2 = ev('String(window.getSelection())')
    check('首页拖拽能选中文字（对照）', len((t2 or '').strip()) > 0, repr((t2 or '')[:30]))
    v2 = ev('(function(){var e=document.querySelector("body");'
            'return getComputedStyle(e).webkitUserSelect||getComputedStyle(e).userSelect})()')
    check('首页 user-select 不是 none（未被误伤）', v2 != 'none', v2)

print('\n===== 三、回归：/clouds/ 左键按下仍张嘴 =====')
nav(LOCAL + '/clouds/')
for i in range(40):
    if ev("!!document.querySelector('.cl.js-on')"):
        break
    time.sleep(0.25)
P('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': cx, 'y': cy,
                               'button': 'left', 'buttons': 1, 'clickCount': 1})
time.sleep(0.3)
cls = ev('document.documentElement.className') or ''
cur = ev('getComputedStyle(document.documentElement).cursor') or ''
check('按下 → cat-click（猫张嘴态）', 'cat-click' in cls, cls)
check('按下 → 张嘴指针', 'cat-open.png' in cur, cur[:70])
P('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': cx, 'y': cy,
                               'button': 'left', 'buttons': 0, 'clickCount': 1})
time.sleep(0.3)
check('松开 → 恢复闭嘴',
      'cat-click' not in (ev('document.documentElement.className') or ''))

print('\n' + '=' * 56)
print('  /clouds/ 文字不可选取探针：%d 项，通过 %d，失败 %d'
      % (RES['N'], RES['PASS'], RES['N'] - RES['PASS']))
print('=' * 56)
ws.close()
proc.terminate()
print('probe = %s' % json.dumps(RES))
