---
title: 访客统计 - busuanzi 与 Vercount
date: 2026-08-29 20:00:00
categories:
  - 建站教程
tags:
  - Hexo
  - Vercount
  - busuanzi
  - 不蒜子
  - GitHub Pages
description: 博客上线后访客统计一直显示「—」，排查半天才发现 busuanzi 时不时抽风，干脆换到了 Vercount。
cover: /img/cover_vercount-migration.jpg
---

博客刚搬到 GitHub Pages 那天，我兴冲冲地打开侧栏的「网站信息」卡——

**本站访客数：—**
**本站访问量：—**

那个破折号像两个空洞的眼眶盯着我。"是不是我一个人没访客所以是 0？" 我自我安慰地想。

但**等了三天**，刷新 N 次，依旧是 `—`。

得，工具不干活。

## 一、busuanzi（不蒜子）是什么

`busuanzi.ibruce.info`，国内很多博主都在用的访客统计。原理特别简单：

- 你在页面上挖两个坑：`<span id="busuanzi_site_uv">` 和 `<span id="busuanzi_site_pv">`
- 引入它的一段 JS
- 用户每次打开页面，JS 就偷偷给它的服务端发一条记录
- 服务端**累计**一下，把数字回填到那两个 span 里

听起来很完美对吧？**但这玩意儿特别像家门口的小卖部**——平时挺好用的，老板热情东西又便宜，但**逢年过节老板就关门了**。

busuanzi 最大的问题：**它是一个国内个人维护的公益项目，没有 SLA，没有工单，没有补偿**。服务挂了就挂了，恢复全看作者心情。

## 二、我是怎么发现它挂的

我一开始是这么怀疑的（典型的甩锅心理）：

> 是不是 GitHub Pages 不算公网啊？

emmm，是公网的，**任何人都能访问** `https://shangqian-haha.github.io/`，不蒜子官方也明确写了支持 `*.github.io`。

那为啥数字不出来？于是我拿 curl 把首页抓下来看：

| 检查项 | 结果 |
|---|---|
| 公网能拿到 16KB HTML | OK |
| 两个 span 都在 | OK |
| 它的 JS 文件在 | OK |
| 直接 curl 它家 JS 服务 | OK，2.2 秒返回完整内容 |

**全都没问题。**

最后只能祭出 F12 抓网络请求。看到那条**统计接口（POST 请求）超时**的那一刻，我就知道：**它的服务端在抽风**。

> "服务端有响应但脚本拿不到数据"——这就像你打电话给小卖部老板，**电话接通了但他那边一片杂音听不清**。不是没人在，是人**没精神**。

## 三、busuanzi 的"抽风"三大表现

观察几天下来，busuanzi 的不稳定性有这几种：

1. **高峰期抽风**：晚上 8-11 点国内访问高峰，它的统计接口就慢得离谱。打开自己的博客都能感到访客数字"加载中"卡了老半天。
2. **维护期没通知**：偶尔它会完全失效半天到一天，**不报错、没公告**，你只能靠「自己博客侧栏一直 `—`」来发现。
3. **海外节点慢**：它是国内服务器，我的访客里有海外的，加载慢不说，**计数也不准**。

> 这就是为啥我最后决定换——不是它不好，是它**太容易掉链子**。

## 四、备胎选手：Vercount

不蒜子挂的那天晚上，我顺手搜了几个平替。最终选了 [Vercount](https://vercount.one/)。

对比几个备胎：

| 工具 | 优势 | 劣势 |
|---|---|---|
| **Vercount** | 走 Cloudflare CDN、接口和 busuanzi 几乎一样、还能自动同步历史数据 | 公益项目，作者也是个人维护 |
| GoatCounter | 开源、可自建 | 要注册账号、UI 比较素 |
| Cloudflare Analytics | 零代码 | 域名要迁到 Cloudflare |

**为啥选 Vercount**：
- 它和 busuanzi 的 span id 设计几乎一样（只差几个字母）→ **切换零学习成本**
- Cloudflare CDN 全球访问都很快，**再不怕海外用户拖慢**
- 公益归公益，Cloudflare 的基础设施在那，**至少不会高峰期就崩**

> 我跟自己说：这次至少从"小卖部"升级到"24 小时便利店"了。

## 五、Hexo 项目里改两处就够了

我用的是自建主题 `liushen-clone`，改动很小，两个文件：

### `themes/liushen-clone/layout/_partial/aside.ejs`

把两个 span 的 id 改一下：

```ejs
<!-- 旧 -->
<dd id="busuanzi_site_uv">—</dd>
<dd id="busuanzi_site_pv">—</dd>

<!-- 新 -->
<dd id="vercount_value_site_uv">—</dd>
<dd id="vercount_value_site_pv">—</dd>
```

### `themes/liushen-clone/layout/_partial/body-end.ejs`

把脚本也换掉：

```ejs
<!-- 旧 -->
<script async src="//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"></script>

<!-- 新 -->
<script defer src="https://events.vercount.one/js"></script>
```

> 一个小细节：脚本从 `async` 改成了 `defer`。`async` 是"下载完就跑"，`defer` 是"等页面渲染完再跑"。统计脚本要在 DOM 渲染完后才能找到那两个 span，所以用 `defer` 更稳。

## 六、怎么确认自己真的切过去了

`hexo clean && hexo generate` 之后，**部署前**先看一眼生成的 HTML：

```bash
grep -o 'busuanzi\|vercount_value_site_[a-z]*\|events.vercount.one' public/index.html | sort | uniq -c
```

期望看到：

```
      1 events.vercount.one
      1 vercount_value_site_pv
      1 vercount_value_site_uv
```

如果还有 `busuanzi` 出现，就是**有缓存没清干净**，先 `hexo clean` 再来一次。

> 我那次就是第一次没清干净，部署上去还是老样子，又 `clean` 一次才正常。**deploy 前必须看一眼**，不然容易白跑一趟。

## 七、首次数字不是立刻出现的

部署到 GitHub Pages 之后，**别急**。

Vercount 需要做两件事：
1. 从 busuanzi 同步历史数据（如果你之前有的话）
2. 让边缘节点同步生效

我这边等了大概 5~10 分钟，刷新页面，访客数从 `—` 变成了 `1`。那一个 `1` 大概是我自己当时的访问，**挺有仪式感的**。

之后每次有人访问，数字就实时累计了。

## 一些反思

这次踩坑给我提了个醒：

- **能用 SaaS 别自托管**。这次的根因就是依赖了一个国内个人维护的公共服务，**出问题没 SLA、没工单、没人通知**。如果博客流量是自己的事，可以忍；但要做正式站点，工具链应该挑有商业保障的。
- **多备几个候选**。busuanzi 挂掉的那个晚上，我顺手把 Vercount、GoatCounter、CF Analytics 都搜了一遍列了对比表。下次别的服务挂掉可以快速切换，**不至于临时抱佛脚**。
- **日志要打**。这次排查花了快半小时，主要因为没在「网站信息」卡片上加 console.log 看脚本到底返回了什么。下次接第三方脚本，**至少在本地留一份「最后一次成功请求时间」**之类的标记，方便排查。
- **写下来**。博客的一个作用就是这种「踩坑记录」，未来自己或别人搜到，能省很多时间。这篇文章也算是个闭环。

下次再换别的服务时，希望我能想起这次的教训：

> **先确认是不是公网 → 再确认脚本有没有发请求 → 再确认服务有没有回响应 → 最后才怀疑服务本身挂了。**
