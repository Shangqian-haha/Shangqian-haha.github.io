# AGENTS.md — my-blog

## 项目简介

Hexo 7.3.0 静态博客。当前使用的主题：**liushen**（基于 hexo-theme-butterfly 的定制版，通过 git 安装在 `themes/liushen/` 目录下）。

## 常用命令

```bash
npx hexo clean          # 清除 db.json 和 public/ 构建产物
npx hexo generate       # 生成静态站点到 public/ 目录
npx hexo server         # 本地开发服务器（默认 http://localhost:4000）
npx hexo deploy         # 通过 hexo-deployer-git 推送到 GitHub Pages
```

验证改动时务必先 `clean` 再 `generate` —— `public/` 中的旧缓存可能掩盖问题。

## 配置分层（修改配置前必读）

Hexo 对 liushen 主题会合并两个配置文件：

| 文件 | 作用 |
|---|---|
| `_config.yml`（根目录） | Hexo 核心配置：站点元数据、URL、永久链接、部署目标、`theme: liushen` |
| `_config.liushen.yml`（根目录） | **主题配置覆盖文件** —— 所有主题定制都在这里修改 |

**不要直接编辑 `themes/liushen/_config.yml`。** 根目录的 `_config.liushen.yml` 优先级更高，遵循 Hexo 的 [Alternate Theme Config](https://hexo.io/docs/configuration.html#Alternate-Theme-Config) 机制。直接修改 `themes/liushen/` 内的配置会被静默覆盖。

## 目录结构

| 路径 | 作用 |
|---|---|
| `source/_posts/` | Markdown 博客文章，包含 YAML front-matter |
| `scaffolds/` | `hexo new` 使用的模板（post/draft/page） |
| `themes/liushen/` | 主题源码（git subtree）—— 不要直接编辑，通过 `_config.liushen.yml` 定制 |
| `public/` | 构建输出 —— 已在 .gitignore 中，不要提交 |
| `willow-god-main/` | 独立的 Jupyter notebook 项目（与博客无关） |

## 文章格式

新文章放在 `source/_posts/` 目录下。Front-matter 示例：

```yaml
---
title: 文章标题
date: YYYY-MM-DD HH:MM:SS
tags:
  - 标签1
categories:
  - 分类1
cover: /img/cover.jpg        # 可选：首页卡片展示图
description: 简短摘要        # 可选：首页显示的描述
---
```

`scaffolds/post.md` 模板只包含 `title`、`date`、`tags` —— 需要时手动添加 `categories`、`cover`、`description`。

## 部署

部署目标：`git@github.com:Shangqian-haha/Shangqian-haha.github.io.git`（分支：`main`）。

完整部署流程：

```bash
npx hexo clean && npx hexo generate && npx hexo deploy
```

需要 SSH 密钥访问 GitHub 仓库。`hexo-deployer-git` 会强制推送 `public/` 内容到目标仓库。

## 注意事项

- **渲染器依赖**：liushen 需要 `hexo-renderer-pug` 和 `hexo-renderer-stylus`（已在 `package.json` 中）。缺少时主题布局和样式会静默失败。
- **`_config.landscape.yml`** 是空文件且未使用 —— 当前主题是 `liushen`，不是 `landscape`。
- **`db.json`** 是 Hexo 缓存文件 —— 已在 .gitignore 中，由 `hexo generate` 重新生成。文章或元数据异常时用 `hexo clean` 删除它。
- **`public/` 在 `.gitignore` 中** —— 不要提交构建产物。
- **`willow-god-main/`** 是独立项目，内含 Jupyter notebook，不要当作博客源码处理。
- **主题仍在开发中**（参见主题 README） —— 功能可能不完善，使用前检查 `themes/liushen/README.md`。

## 相关指令文件

- `C:\Users\刘宏展\.claude\CLAUDE.md` —— 用户级规范（中文提交信息、逐文件提交、代码注释标准）。在此仓库工作时需遵循。
