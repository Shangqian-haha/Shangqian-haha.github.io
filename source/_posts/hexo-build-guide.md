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

折腾博客这件事，其实是个无底洞。但正是这种「折腾」，让我在一次次推倒重来里，把前端、部署、域名、SEO 这些原本陌生的东西摸了个遍。

## 为什么选择 Hexo

选型时在 Hugo、Hexo、VitePress 之间纠结了很久，最终选择 Hexo 的原因很简单：

- **生态成熟**，主题丰富，中文资料多
- **纯静态生成**，可以直接丢到 GitHub Pages 上，零服务器成本
- **写作体验好**，Markdown 直接渲染

## 安装与初始化

先装好 Node.js 环境，然后全局安装 Hexo 命令行工具：

```bash
npm install -g hexo-cli
hexo init my-blog
cd my-blog
npm install
```

初始化完成后，目录结构大致如下：

```
my-blog/
├── _config.yml     # 站点配置
├── source/         # 文章与静态资源
│   └── _posts/     # 博客文章
├── themes/         # 主题目录
└── package.json
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `hexo new "标题"` | 新建一篇文章 |
| `hexo server` | 本地预览 |
| `hexo generate` | 生成静态文件 |
| `hexo deploy` | 一键部署 |

## 踩过的坑

> 刚上手时最容易犯的错，就是把站点配置和主题配置搞混。记住：根目录的 `_config.yml` 管站点，主题目录里的才是管外观。

另外一个坑是时区问题，如果文章日期显示不对，检查一下 `_config.yml` 里的 `timezone` 配置即可。

## 写在最后

博客的价值不在工具本身，而在「持续记录」这个动作。希望这份记录能帮到同样在折腾的你。
