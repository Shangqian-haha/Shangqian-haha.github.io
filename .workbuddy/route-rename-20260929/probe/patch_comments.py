# -*- coding: utf-8 -*-
"""2026-09-29 路由迁移收尾补丁：
   1) 把各文件注释/字符串里作为「路径」出现的 /clouds/ 改成 /profile/；
   2) 把提到「雨夜伦敦页 / 两页共用」的注释改成「该页已删除」的口径。
幂等：old 出现 1 次才替换；出现 0 次且 new 已存在 → 视为已应用，跳过。
"""
import io
import os

ROOT = r'D:/my-blog'
THEME = os.path.join(ROOT, 'themes', 'liushen-clone')

REPL = [
    # ---------- clouds.ejs ----------
    (THEME + '/layout/_partial/clouds.ejs',
     '  ============ /clouds/ 极地 · 极光冰原 · v5「Aurora」 ============',
     '  ============ /profile/ · 极地 · 极光冰原 · v5「Aurora」 ============'),

    (THEME + '/layout/_partial/clouds.ejs',
     '  纯自研 three.js r112 场景，**零外部模型/贴图**（贴图用 canvas 现画）：',
     '  ⚠️ 2026-09-29 路由迁移：本页原挂在 /clouds/（标题「云海之上」）；原 /profile/ 的\n'
     '     「雨夜伦敦」页按要求删除后，本页改挂到 /profile/，导航「个人主页」也指向这里。\n'
     '     内部命名保持 clouds（type: clouds、clouds.css/js/ejs、clouds.yml）—— 因为\n'
     '     profile.css 这个名字被**共用基底**占着（字体 / .pf-body / 音乐控件），改名会撞名；\n'
     '     所以只改路由与注释，不做大面积重命名（避免回归风险）。老路径 /clouds/ 不再生成；\n'
     '     雨夜伦敦页资产备份在 .workbuddy/removed-profile-london-20260929/。\n'
     '\n'
     '  纯自研 three.js r112 场景，**零外部模型/贴图**（贴图用 canvas 现画）：'),

    (THEME + '/layout/_partial/clouds.ejs',
     '  内容数据在 source/_data/clouds.yml。',
     '  内容数据在 source/_data/clouds.yml（文件名沿用 clouds，见上方路由说明）。'),

    (THEME + '/layout/_partial/clouds.ejs',
     '  /* 音乐配置**共用** /profile/ 的那一份（source/_data/profile.yml 的 music 段）——',
     '  /* 音乐配置读 source/_data/profile.yml 的 music 段 ——'),

    (THEME + '/layout/_partial/clouds.ejs',
     '     两页同一个控件、同一份配置，改一处两边同时生效。 */',
     '     与 js/music.js、profile.css 的 .pf-music 组成共用模块，改一处即生效。 */'),

    (THEME + '/layout/_partial/clouds.ejs',
     '          删除），顶栏改成与 /profile/ 同一副长相（左品牌、右音乐钮）。',
     '          删除），顶栏只留「左品牌 + 右音乐钮」。'),

    (THEME + '/layout/_partial/clouds.ejs',
     '    <% /* 音乐控件：与 /profile/ 完全同一个组件、同一份样式（profile.css 的\n'
     '          .pf-music / .pf-snd），所以两处观感一致。 */ %>',
     '    <% /* 音乐控件：组件与样式都在共用模块里（js/music.js + profile.css 的\n'
     '          .pf-music / .pf-snd），本页零专属样式。 */ %>'),

    # ---------- clouds.css ----------
    (THEME + '/source/css/clouds.css',
     '   极地 · 极光冰原 · /clouds/ v5「Aurora」样式',
     '   极地 · 极光冰原 · /profile/ v5「Aurora」样式（页面在 /profile/，文件名沿用 clouds）'),

    (THEME + '/source/css/clouds.css',
     '/* ---------- 顶部条（品牌 + 音乐钮，与 /profile/ 同构） ----------',
     '/* ---------- 顶部条（品牌 + 音乐钮，极简顶栏） ----------'),

    (THEME + '/source/css/clouds.css',
     '   顶栏只剩「左品牌 + 右音乐钮」，与 /profile/ 的 .ld-top 同一副长相。 */',
     '   顶栏只剩「左品牌 + 右音乐钮」（.ld-top 那套样式随雨夜伦敦页一起删除了）。 */'),

    (THEME + '/source/css/clouds.css',
     '   但那套 --pf-* 令牌是定义在 `.pf`（即 /profile/ 的根元素）上的；\n'
     '   /clouds/ 的根是 `.cl`，一个都取不到 —— 而 var() 解析失败会让**整条简写**',
     '   但那套 --pf-* 令牌是定义在 `.pf`（原「雨夜伦敦」页的根元素）上的 ——\n'
     '   该页 2026-09-29 已删除，`.pf` 不再出现在 DOM 里：本页的根是 `.cl`，\n'
     '   一个令牌都取不到 —— 而 var() 解析失败会让**整条简写**'),

    (THEME + '/source/css/clouds.css',
     '     · 作用域取 body.cl-body（/clouds/ 的 body 类，见 layout/page.ejs）——',
     '     · 作用域取 body.cl-body（本页 body 的类，见 layout/page.ejs；\n'
     '       页面地址是 /profile/，类名沿用 cl-body）——'),

    # ---------- clouds.js ----------
    (THEME + '/source/js/clouds.js',
     '   极地 · 极光冰原 · /clouds/ v5「Aurora in the Sky」',
     '   极地 · 极光冰原 · /profile/ v5「Aurora in the Sky」（页面在 /profile/）'),

    (THEME + '/source/js/clouds.js',
     '    /* 通知音乐模块可以开播了 —— 约定与 /profile/ 一致（自定义事件 pf:enter，',
     '    /* 通知音乐模块可以开播了 —— 与 js/music.js 的约定（自定义事件 pf:enter，'),

    # ---------- music.js ----------
    (THEME + '/source/js/music.js',
     '   音乐控件 · 共用模块（/profile/ 与 /clouds/ 共用同一个实例代码）',
     '   音乐控件 · 共用模块（服务 /profile/ 极光页；逻辑、样式各自独立成文件）'),

    (THEME + '/source/js/music.js',
     '      /clouds/ 也要用这个控件。与其在 clouds.js 里再写一遍（两份逻辑必然分叉），\n'
     '      把 profile.js 原来的第 9 段**原样**搬到这里，profile.js 里那段已删除。\n'
     '      两个页面都只靠本文件，改一处两页同时生效。',
     '      当初两张全屏页要用同一个控件。与其各写一遍（两份逻辑必然分叉），\n'
     '      把原来藏在 profile.js 里的那段**原样**搬到这里。\n'
     '      （2026-09-29 雨夜伦敦页已删除，本文件现只服务 /profile/ 极光页。）'),

    (THEME + '/source/js/music.js',
     '      profile.css 在 /profile/ 与 /clouds/ 都会加载（见 head.ejs），\n'
     '      所以两处的圆钮、竖条、悬停/播放态完全一致。\n'
     '      ⚠️ 但 --pf-* 变量是定义在 .pf 上的（profile 页根元素），\n'
     '         /clouds/ 的根是 .cl，取不到 → 由 clouds.css 补一份同名令牌。',
     '      profile.css 由本页加载（见 head.ejs），圆钮、竖条、悬停/播放态都由它定。\n'
     '      ⚠️ 但 --pf-* 变量是定义在 .pf 上的（原雨夜伦敦页的根元素，现已删除），\n'
     '         本页的根是 .cl，取不到 → 由 clouds.css 补一份同名令牌。'),

    (THEME + '/source/js/music.js',
     '        /profile/ 由 profile.js 的入场解锁派发，/clouds/ 由 clouds.js 的闸门派发。\n'
     '        这两处通常都是「访客点一下」触发，带用户手势，play() 合规。',
     '        由 clouds.js 的入场闸门派发（旧版第二个派发点随雨夜伦敦页删除）。\n'
     '        这里通常都是「访客点一下」触发，带用户手势，play() 合规。'),

    # ---------- profile.css ----------
    (THEME + '/source/css/profile.css',
     '/* ============================================================\n'
     '   个人主页 · /profile/\n'
     '   场景：雨中伦敦 · Westminster Bridge（Westminster Bridge, London）',
     '/* ============================================================\n'
     '   共用基底 + 音乐控件样式（文件名沿用 profile；页面在 /profile/）\n'
     '   ⚠️ 2026-09-29：原「/profile/ 雨中伦敦 · Westminster Bridge」页已按要求删除，\n'
     '      本文件特意**没有**跟着删 —— 它还在承担两件活：\n'
     '        1. 全屏页的字体与 .pf-body 基底（/profile/ 极光页加载它，见 head.ejs）；\n'
     '        2. 音乐控件 .pf-music / .pf-snd 的样式（配套 js/music.js）。\n'
     '      页内专属规则（.pf-split / .pf-scene 等）已无页面引用，保留以便随时恢复该页，\n'
     '      整页资产备份在 .workbuddy/removed-profile-london-20260929/。\n'
     '   场景（原页）：雨中伦敦 · Westminster Bridge（Westminster Bridge, London）'),

    # ---------- cursor-cat.css ----------
    (THEME + '/source/css/cursor-cat.css',
     '   打嗝猫鼠标指针（全站，含首页 / 文章页 / /profile/ /clouds/）',
     '   打嗝猫鼠标指针（全站，含首页 / 文章页 / /profile/ 个人主页）'),

    # ---------- _data/clouds.yml ----------
    (ROOT + '/source/_data/clouds.yml',
     '# 极地 · 极光冰原 · /clouds/ v5「Aurora」· 内容数据',
     '# 极地 · 极光冰原 · /profile/ v5「Aurora」· 内容数据（文件名沿用 clouds）'),

    (ROOT + '/source/_data/clouds.yml',
     '#    · /profile/（雨中伦敦页）另有独立的一份自述，在\n'
     '#      source/_data/profile.yml 的 story 段，与本页互不影响；\n'
     '#      若要两页口径一致，需另行同步那一处。',
     '#    · 2026-09-29 路由迁移：本页原在 /clouds/，改名到 /profile/；\n'
     '#      同日删除了原 /profile/ 的「雨夜伦敦」页，故不再需要与它同步口径\n'
     '#      （该页文案已随资产一起备份到 .workbuddy/removed-profile-london-20260929/）。'),

    (ROOT + '/source/_data/clouds.yml',
     '#    一起删掉了，顶栏只剩「品牌 + 音乐钮」，与本页的 /profile/ 同构。\n'
     '#    音乐不在这里配 —— 与 /profile/ 共用 source/_data/profile.yml 的 music 段。',
     '#    一起删掉了，顶栏只剩「品牌 + 音乐钮」。\n'
     '#    音乐不在这里配 —— 在 source/_data/profile.yml 的 music 段（clouds.ejs 读它）。'),
]

# 探针脚本里的 URL：/clouds/ -> /profile/（纯路径替换，可重复执行）
PROBES = [
    r'D:/WB缓存/2026-09-25-09-05-38/_london_v2/probe_select.py',
    r'D:/WB缓存/2026-09-25-09-05-38/_london_v2/probe_cursor.py',
    r'D:/WB缓存/2026-09-25-09-05-38/_london_v2/probe_music.py',
    r'D:/WB缓存/2026-09-25-09-05-38/_london_v2/probe_reveal.py',
    r'D:/WB缓存/2026-09-25-09-05-38/_london_v2/probe_sec_align.py',
    r'D:/WB缓存/2026-09-25-09-05-38/_london_v2/run_clouds.py',
    r'D:/WB缓存/2026-09-25-09-05-38/_london_v2/run_v2c.py',
]

ok = applied = already = bad = 0
for path, old, new in REPL:
    if not os.path.isfile(path):
        print('[MISS-FILE] %s' % path)
        bad += 1
        continue
    s = io.open(path, encoding='utf-8').read()
    c = s.count(old)
    if c == 1:
        io.open(path, 'w', encoding='utf-8').write(s.replace(old, new))
        applied += 1
        print('[OK]    %s :: %s' % (os.path.basename(path), old.splitlines()[0][:56]))
    elif c == 0 and new in s:
        already += 1
        print('[SKIP-已改] %s :: %s' % (os.path.basename(path), old.splitlines()[0][:48]))
    else:
        bad += 1
        print('[!!]    %s :: count=%d  %s' % (os.path.basename(path), c, old.splitlines()[0][:48]))

print('\n--- 探针路径 /clouds/ -> /profile/ ---')
for p in PROBES:
    if not os.path.isfile(p):
        print('[MISS-FILE] %s' % p)
        continue
    s = io.open(p, encoding='utf-8').read()
    n = s.count('/clouds/')
    if n:
        io.open(p, 'w', encoding='utf-8').write(s.replace('/clouds/', '/profile/'))
        print('[OK]    %s : %d 处' % (os.path.basename(p), n))
    else:
        print('[SKIP-已改] %s' % os.path.basename(p))

print('\n应用 %d，跳过(已改) %d，异常 %d' % (applied, already, bad))
