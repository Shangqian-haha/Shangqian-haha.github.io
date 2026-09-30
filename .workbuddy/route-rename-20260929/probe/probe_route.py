# -*- coding: utf-8 -*-
"""路由迁移探针（2026-09-29）：
   旧 /profile/（雨夜伦敦）已删除、/clouds/ 改名为 /profile/。
   逐项核对：产物路由、加载的样式/脚本、DOM 结构、导航指向、旧资源是否残留。
   静态部分服务 D:/my-blog/public（需先 hexo generate）。
"""
import io, os, json, time, subprocess, threading, functools
import http.server
import urllib.request
import urllib.error
import websocket

PUB = r'D:/my-blog/public'
BASE = r'D:/WB缓存/2026-09-25-09-05-38/_london_v2'
PORT = 8131
PROF = os.path.join(BASE, 'chrome-prof')
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
LOCAL = 'http://127.0.0.1:%d' % PORT

RES = {'N': 0, 'PASS': 0}


def check(name, cond, detail=''):
    RES['N'] += 1
    if cond:
        RES['PASS'] += 1
        print('  [PASS] %s %s' % (name, detail))
    else:
        print('  [FAIL] %s %s' % (name, detail))


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


handler = functools.partial(Quiet, directory=PUB)
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
httpd.request_queue_size = 32
threading.Thread(target=httpd.serve_forever, daemon=True).start()
print('httpd on %d serving %s' % (PORT, PUB))


def http_code(path):
    try:
        return urllib.request.urlopen(LOCAL + path, timeout=5).getcode()
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        return 'ERR:%s' % e


def http_text(path):
    try:
        return io.open(os.path.join(PUB, path.lstrip('/').rstrip('/') or 'index.html'),
                       encoding='utf-8', errors='replace').read()
    except Exception as e:
        return ''


print('\n===== 一、产物路由 =====')
check('/profile/index.html 已生成', os.path.isfile(os.path.join(PUB, 'profile', 'index.html')))
check('/clouds/ 目录已不再生成', not os.path.isdir(os.path.join(PUB, 'clouds')))
check('HTTP /profile/ = 200', http_code('/profile/') == 200, http_code('/profile/'))
check('HTTP /clouds/ = 404', http_code('/clouds/') == 404, http_code('/clouds/'))
check('profile-london.css 已不在产物里', not os.path.isfile(os.path.join(PUB, 'css', 'profile-london.css')))
check('js/profile.js 已不在产物里', not os.path.isfile(os.path.join(PUB, 'js', 'profile.js')))
check('clouds.css 仍在产物里', os.path.isfile(os.path.join(PUB, 'css', 'clouds.css')))
check('profile.css（共用基底）仍在产物里', os.path.isfile(os.path.join(PUB, 'css', 'profile.css')))
check('music.js 仍在产物里', os.path.isfile(os.path.join(PUB, 'js', 'music.js')))

html = http_text('/profile/index.html')
check('/profile/ 的 HTML 里引了 clouds.css', 'clouds.css' in html)
check('/profile/ 的 HTML 里没引 profile-london.css', 'profile-london.css' not in html)
check('/profile/ 的 HTML 里没引 profile.js', '/js/profile.js' not in html.replace('?v=', '?v='))

# 全产物里不应再出现指向已删资源的引用
stale = []
for root, dirs, files in os.walk(PUB):
    if os.sep + 'page' in root:
        continue
    for fn in files:
        if fn.endswith(('.html', '.css', '.js')):
            p = os.path.join(root, fn)
            try:
                s = io.open(p, encoding='utf-8', errors='replace').read()
            except Exception:
                continue
            if 'profile-london.css' in s or "js/profile.js" in s:
                stale.append(os.path.relpath(p, PUB))
check('产物里无任何指向已删资源(profile-london.css / profile.js)的引用',
      not stale, ','.join(stale[:4]))

# ---------- Chrome + CDP ----------
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
    '--remote-debugging-port=9345', 'about:blank',
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

ws_url = None
for i in range(60):
    try:
        d = json.loads(urllib.request.urlopen('http://127.0.0.1:9345/json/version', timeout=2).read())
        ws_url = d['webSocketDebuggerUrl']
        break
    except Exception:
        time.sleep(0.5)
ws = websocket.create_connection(ws_url, timeout=60)
mid = [0]


def cmd(m, p=None, s=None):
    mid[0] += 1
    i = mid[0]
    msg = {'id': i, 'method': m, 'params': p or {}}
    if s:
        msg['sessionId'] = s
    ws.send(json.dumps(msg))
    while True:
        r = json.loads(ws.recv())
        if r.get('method'):
            continue
        if r.get('id') == i:
            return r.get('result', {})


tgt = cmd('Target.createTarget', {'url': 'about:blank'})['targetId']
sess = cmd('Target.attachToTarget', {'targetId': tgt, 'flatten': True})['sessionId']
P = lambda m, p=None: cmd(m, p, sess)


def ev(e):
    r = P('Runtime.evaluate', {'expression': e, 'returnByValue': True, 'awaitPromise': True})
    res = r.get('result', {})
    if res.get('subtype') == 'error':
        print('   [JS ERR]', (res.get('description') or '')[:160])
    return res.get('value')


def nav(u, settle=1.0):
    P('Page.navigate', {'url': u})
    for i in range(60):
        time.sleep(0.25)
        if ev('document.readyState') == 'complete':
            break
    time.sleep(settle)


P('Page.enable')
P('Runtime.enable')

print('\n===== 二、/profile/ 页面本体（应是极光页）=====')
nav(LOCAL + '/profile/', 1.4)
check('有 #clouds-root（极光页根）', ev("!!document.getElementById('clouds-root')"))
check('body 是 pf-body cl-body', 'pf-body' in (ev('document.body.className') or '')
      and 'cl-body' in (ev('document.body.className') or ''), ev('document.body.className'))
check('四幕都在', (ev('document.querySelectorAll(".cl-sec").length') or 0) == 4,
      ev('document.querySelectorAll(".cl-sec").length'))
check('WebGL 画布在位', (ev('document.querySelectorAll("#cl-canvas, .cl-canvas").length') or 0) >= 1)
check('未混入伦敦页结构（无 .pf-split / .ld-top）',
      ev('document.querySelectorAll(".pf-split, .ld-top, #profile-root").length') == 0,
      ev('document.querySelectorAll(".pf-split, .ld-top, #profile-root").length'))
check('加载了 clouds.css', ev("""[].some.call(document.querySelectorAll('link[rel=stylesheet]'),
      function(l){return (l.getAttribute('href')||'').indexOf('clouds.css')>=0})"""))
check('加载了 profile.css 基底', ev("""[].some.call(document.querySelectorAll('link[rel=stylesheet]'),
      function(l){return (l.getAttribute('href')||'').indexOf('profile.css')>=0})"""))
check('未加载 profile-london.css', not ev("""[].some.call(document.querySelectorAll('link[rel=stylesheet]'),
      function(l){return (l.getAttribute('href')||'').indexOf('profile-london.css')>=0})"""))
check('未加载 js/profile.js', not ev("""[].some.call(document.querySelectorAll('script'),
      function(s){return (s.getAttribute('src')||'').indexOf('/js/profile.js')>=0})"""))
check('加载了 js/clouds.js', ev("""[].some.call(document.querySelectorAll('script'),
      function(s){return (s.getAttribute('src')||'').indexOf('clouds.js')>=0})"""))
check('音乐控件在位', ev("!!document.getElementById('pf-music-btn')"))
check('音乐 src 仍指向 mp3',
      'my-love-mine-all-mine.mp3' in (ev("(document.getElementById('pf-music')||{}).getAttribute"
                                         "&&document.getElementById('pf-music').getAttribute('data-src')") or ''),
      ev("document.getElementById('pf-music').getAttribute('data-src')"))
check('文字仍不可选取（上一项改动未回退）',
      ev("getComputedStyle(document.querySelector('.cl-title')).userSelect") == 'none',
      ev("getComputedStyle(document.querySelector('.cl-title')).userSelect"))
cur = ev('getComputedStyle(document.documentElement).cursor') or ''
check('猫指针仍生效', 'cat-closed.png' in cur, cur[:70])
errs = ev('window.__errs||[]')
check('进页面无 JS 报错', not errs, errs)

print('\n===== 三、导航与站内链接 =====')
nav(LOCAL + '/', 0.9)
info = ev("""(function(){
  var as = [].slice.call(document.querySelectorAll('a'));
  var navs = as.map(function(a){return [ (a.textContent||'').trim(), a.getAttribute('href') ];});
  return {
    toProfile: navs.filter(function(p){ return p[1] === '/profile/'; })
                    .map(function(p){ return p[0]; }),
    toClouds: navs.filter(function(p){ return (p[1]||'').indexOf('/clouds/') >= 0; })
                   .map(function(p){ return p[0]; }),
    profileCnt: document.querySelectorAll('a[href="/profile/"]').length
  };})()""")
print('  指向 /profile/ 的链接文本:', info and info.get('toProfile'))
check('首页有链接指向 /profile/',
      bool(info and info.get('profileCnt')), info and info.get('profileCnt'))
check('「个人主页」在导航里指向 /profile/',
      bool(info and any('个人主页' in (t or '') for t in info.get('toProfile', []))))
check('首页已无任何 /clouds/ 链接', bool(info and not info.get('toClouds')),
      info and info.get('toClouds'))
hd = ev("(document.querySelector('a[href=\"/profile/\"]')||{}).textContent||''")
check('该链接文案非空（导航渲染正常）', bool((hd or '').strip()), repr((hd or '').strip()[:40]))

print('\n' + '=' * 56)
print('  路由迁移探针：%d 项，通过 %d，失败 %d' % (RES['N'], RES['PASS'], RES['N'] - RES['PASS']))
print('=' * 56)
ws.close()
proc.terminate()
httpd.shutdown()
print('probe = %s' % json.dumps(RES))
