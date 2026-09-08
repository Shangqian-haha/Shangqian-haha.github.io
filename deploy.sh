#!/usr/bin/env bash
# ============================================================
#  my-blog 一键部署脚本 (Git Bash / WSL / macOS)
#
#  1. push 源代码到 master 分支
#  2. hexo clean && generate && deploy —— 把 public/ 推到 main (GitHub Pages)
# ============================================================

set -e

cd "$(dirname "$0")"

echo "============================================================"
echo " 1) push 源代码到 master 分支"
echo "============================================================"

# 检查 git
if ! command -v git >/dev/null 2>&1; then
    echo "[X] 未检测到 git，请先安装 Git"
    exit 1
fi

# 检查 SSH
echo "[.] 测试 SSH 连通性 ..."
if ! ssh -T -o StrictHostKeyChecking=no -o ConnectTimeout=5 git@github.com 2>&1 | grep -q "successfully authenticated"; then
    echo "[!] SSH 无法以当前密钥登录 GitHub"
    echo "    请确认 ~/.ssh/id_*.pub 已添加到 GitHub 账户的 SSH keys"
    echo "    或本机 ssh-agent 已加载对应私钥（ssh-add -l）"
    exit 1
fi
echo "[+] SSH 连接正常"

# 检查远程仓库
if ! git remote get-url origin >/dev/null 2>&1; then
    echo "[X] 未配置 git remote origin"
    exit 1
fi

# 检查是否有变更（quiet 时退出码 0 = 无变更；非 0 = 有变更）
git update-index -q --refresh 2>/dev/null || true
if git diff --quiet --ignore-submodules HEAD 2>/dev/null && \
   [ -z "$(git status --porcelain)" ]; then
    echo "[.] 工作区无改动，跳过代码提交"
else
    echo "[.] 检测到本地有改动，准备提交 ..."
    git add -A

    read -r -p "请输入本次提交说明（直接回车使用默认: chore: update blog）: " MSG
    if [ -z "$MSG" ]; then
        MSG="chore: update blog"
    fi

    git commit -m "$MSG"

    echo "[.] 推送到 master ..."
    git push origin master
    echo "[+] 源代码已 push 到 master"
fi

echo
echo "============================================================"
echo " 2) 构建并部署到 GitHub Pages (main 分支)"
echo "============================================================"

echo "[.] hexo clean ..."
npx hexo clean

echo "[.] hexo generate ..."
npx hexo generate

echo "[.] hexo deploy ..."
npx hexo deploy

echo
echo "============================================================"
echo " [+] 部署完成！"
echo "     代码: master 分支"
echo "     站点: main 分支 (GitHub Pages)"
echo "     几分钟后刷新博客即可看到最新内容"
echo "============================================================"