---
title: Hexo 博客从零搭建全记录
date: 2026-08-10 20:30:00
categories:
  - 建站教程
tags:
  - Hexo
  - 博客
  - GitHub Pages
description: 从安装 Node.js 到部署上线，一步步记录我用 Hexo 搭建个人博客的全过程，以及踩过的坑。
cover: /img/cover-1.svg
---

折腾博客这件事，其实是个无底洞。但正是这种「折腾」，让我在一次次推倒重来里，把前端、部署、域名、SEO 这些原本陌生的东西摸了个遍。这篇文章把我从零搭起这个博客的完整过程记录下来，顺便把踩过的坑也一起摊开，省得你再趟一遍。

## 为什么选择 Hexo

选型的时候我在 Hugo、Hexo、VitePress 之间纠结了很久。先说结论：我最后选了 **Hexo**，理由挺实在的——

- **生态成熟**：主题多、插件多，中文资料一搜一大把，卡住了几乎都能找到现成答案；
- **纯静态生成**：`hexo generate` 一把梭，产出就是一个纯静态的 `public/` 文件夹，可以直接丢到 GitHub Pages 上，**零服务器成本、不用备案**；
- **写作体验好**：文章就是普通的 Markdown，改完跑一次构建就生效，不用管数据库、不用管后端。

说白了，Hugo 更快但 Go 模板那套写起来别扭，VitePress 更适合做文档站。想安安静静写博客、又想要「折腾空间」，Hexo 的平衡点最舒服。我现在这套是 **Hexo 7.3.0 + 自研主题 `liushen-clone`**，源码托管在 GitHub 上，`master` 分支放源码、`main` 分支放构建好的网页（GitHub Pages 读的是 main）。

## 安装与初始化

第一步，装 Node.js 环境（Hexo 是跑在 Node 上的），然后全局装命令行工具：

```bash
npm install -g hexo-cli
hexo init my-blog
cd my-blog
npm install
```

初始化完成后，目录结构大致长这样：

```
my-blog/
├── _config.yml     # 站点配置（根目录这份管「站点」，不是主题）
├── source/         # 文章与静态资源
│   ├── _posts/     # 博客文章，都放这里
│   └── _data/      # 数据文件（说说、友链、关于页都靠它驱动）
├── themes/         # 主题目录
│   └── liushen-clone/  # 我正在用的自研主题
└── package.json
```

这里想先划个重点：**根目录的 `_config.yml` 管站点，主题目录里的 `_config.yml` 才管外观**。这两份长得像、名字一样，刚上手特别容易改错地方——这其实就是我后面要讲的第一批坑之一。

## 常用命令

日常就这几条，背下来够用了：

| 命令 | 作用 |
| --- | --- |
| `hexo new "标题"` | 在 `source/_posts/` 下新建一篇文章（用 `scaffolds/post.md` 模板） |
| `hexo new page "页面名"` | 在 `source/页面名/index.md` 新建一个普通页（比如「关于」「友链」） |
| `hexo clean` | 删掉 `db.json` 和 `public/` —— **任何报错先 clean 再 generate** |
| `hexo generate` | 构建静态站点到 `public/` |
| `hexo server` | 起本地预览，默认 4000 端口 |
| `hexo deploy` | 把 `public/` 推到 GitHub Pages（main 分支） |

写文章的完整节奏是这样的：`hexo new` 起稿 → 写 Markdown → `hexo server` 边看边改 → `hexo clean && hexo generate` 出最终产物 → 上线。归档、分类、标签这三样**都不用手动维护**，它们分别从文章的 `date`、`categories`、`tags` 字段自动生成，跑一次 `hexo generate` 就全刷出来了。

上线这步展开讲一下，因为「为什么是两次推送」这件事我当时懵了很久：

```bash
hexo clean && hexo generate && hexo deploy   # 推的是「网页」，到 main 分支
git add .
git commit -m "更新说明：xxx"
git push origin master                        # 推的是「源码」，到 master 分支
```

- `hexo deploy` 推的是构建产物 `public/` 到 **main** 分支，决定「网站长什么样」；
- `git push origin master` 推的是源码到 **master** 分支，备份「文章和配置」。

两个都得做：漏了 deploy，网站不更新；漏了 push，源码没备份，哪天电脑崩了就真的一夜回到解放前。

## 踩过的坑

下面这几个，每一个都是我实打实撞过、又费半天劲才爬出来的，按「最想骂人」的程度排序：

**1. 改了 `_config.yml` 刷新没反应**

这是最隐蔽的一个。hexo server 启动时会**一次性缓存根配置**，你之后改了 `_config.yml` 里的东西（比如换主题、改站名），本地刷新页面根本没变化——不是没保存，是 server 压根没重读。

> 解法：**杀掉旧的 server 进程，重新 `hexo server` 起来**。改配置类的东西，别指望热重载。

**2. 文章正文窄得像一条缝**

有一阵子文章页的正文挤在左边一条窄窄的列里，右边空一大块，怎么调都不对。排查半天才发现是 CSS Grid 的坑：它按 DOM 顺序分配列，目录（TOC）在正文前面，就被塞进了那个宽列。最后用 `grid-template-areas` 把「正文」和「目录」显式钉死在各自区域才解决。

**3. 说说的日期显示成一串 GMT**

在 `shuoshuo.yml` 里日期只写了 `2026-09-08`，结果前端显示成 `Mon Sep 08 2026 08:00:00 GMT+0800` 这种鬼东西。原因是 Hexo 的 yaml 解析会把 `YYYY-MM-DD` 自动转成 Date 对象。模板里要用 `date(item.date, 'YYYY-MM-DD')` 显式格式化才能还原。

**4. 友链头像动不动裂图**

别人的站点头像地址失效是常有的事，一失效就一张破图挂在那。现在模板里加了 `onerror` 兜底，裂了自动换成默认头像。想彻底解决，就得自己去换一个稳定的图片源。

**5. `fatal: remote origin already exists`**

仓库已经配好远程了，手滑又跑了一次 `git remote add origin ...`。记住：**配过一次就别再 add**，要看远程用 `git remote -v` 就行。

**6. deploy 报 `Permission denied (publickey)`**

这是部署环节最大的拦路虎。报这个错，说明本机 SSH 公钥没配到 GitHub 账号（或仓库的 Deploy keys）里。解法是生成一对 key，把 `.pub` 内容贴到 GitHub → Settings → SSH and GPG keys，之后 push 就不用再管了。

**7. 阅读进度按钮怎么滚都不显示**

这个坑是最让我崩溃的，因为它「看着哪都对、就是不工作」。事情是这样的：我给导航栏加了个阅读进度按钮，逻辑很简单——往下滚超过 15 像素，右上角就滑出一个显示百分比的圆环。代码写完、`hexo generate` 也过了，结果刷新页面啥都没有，把页面滚到底也还是没影。

一开始我以为是缓存，让你按 `Ctrl+Shift+R` 强刷，没用；又怀疑是按钮的显示条件写错了，逐行检查 JS，也没问题。最后我干脆用无头浏览器（headless Chrome）去实测，把页面滚到底后打印滚动状态，才发现蹊跷：

```
window.innerHeight  = 800     ← 视口高度正常
documentElement.clientHeight = 2797  ← 居然等于「内容高度」，而不是视口高度！
滚动发生在 document.body 上，而不是 documentElement 上
```

这下真相大白了：**这个自研主题手写的 HTML 骨架，缺了 `<!DOCTYPE html>` 和 `<html>`、`<head>` 这几个标签**。没有 DOCTYPE，浏览器就进入「怪异模式（quirks mode）」，滚动容器会落在 `<body>` 上、`clientHeight` 被内容撑开。于是 JS 里算进度用的 `max = scrollHeight - clientHeight` 恒等于 0，显示条件 `scrolled > 15 && max > 0` 永远不成立——按钮自然怎么滚都不出来。

解法就一行事：在主题的 `head.ejs` 里补上 `<!DOCTYPE html>`、`<html lang="zh-CN">` 和 `<head>` 三个包裹。因为所有页面模板都共用这一个文件，**改一处、全部页面一起好**。

> 这个坑还藏了个「买一送一」：博客顶部那根 2px 的细进度条，其实从上线起就一直没动过（同样因为 max=0），修 DOCTYPE 的时候一起被治好了。

**教训**：写主题的时候，HTML 骨架的 `<!DOCTYPE html>` 千万别省，省了不会立刻报错，但会在某个你根本想不到的地方（滚动、布局、百分比高度）悄悄坑你一把。

## 写在最后

博客的价值不在工具本身，而在「持续记录」这个动作。Hexo 也好、主题也罢，都是帮你把想法落成文字的手段。希望这份记录能帮到同样在折腾的你，少踩几个我踩过的坑。
