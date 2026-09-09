---
title: 把博客免费部署到 GitHub Pages
date: 2026-08-18 22:10:00
categories:
  - 建站教程
tags:
  - GitHub
  - 部署
  - CI/CD
description: 不用买服务器，用 GitHub Pages + Actions 实现博客的自动化部署，每次推送自动更新站点。
cover: /img/cover-2.svg
---

很多人以为搭建个人博客需要买服务器、备案、装环境，其实完全不必。GitHub Pages 提供了免费的静态站点托管，配合 Actions 还能做到「推一次代码，站点自动更新」。

## 创建仓库

新建一个名为 `用户名.github.io` 的仓库，这个特殊的命名会自动开启 Pages 功能。

## 配置部署

在 Hexo 站点里安装部署插件：

```bash
npm install hexo-deployer-git --save
```

然后修改 `_config.yml` 的部署配置：

```yaml
deploy:
  type: git
  repo: git@github.com:yourname/yourname.github.io.git
  branch: main
```

## 用 Actions 自动化

比起手动 `hexo deploy`，我更喜欢用 GitHub Actions 全自动。在仓库里放一个 `.github/workflows/pages.yml`：

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npx hexo generate
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```

## 总结

至此，一条完整的自动化链路就搭好了：本地写作 → `git push` → Actions 自动构建 → Pages 更新。全程零服务器成本，专注内容本身就好。
