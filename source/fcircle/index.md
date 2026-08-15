---
title: Read Later
date: 2026-08-14 12:00:00
type: fcircle
aside: false
description: 好文章，在我抵达不了的知识盲区，总有人替我走在前头。无关社交，只论文章。
---

<div id="friend-circle-lite-root"></div>
<script>
    if (typeof UserConfig === 'undefined') {
        var UserConfig = {
            // 填写你的 Friend-Circle-Lite 静态地址（尾部带/）
            private_api_url: 'https://fc.liushen.fun/',
            // 点击加载更多时，一次最多加载几篇文章，默认20
            page_turning_number: 20,
            // 头像加载失败时，默认头像地址
            error_img: '/img/avatar.jpg',
        }
    }
</script>
<link rel="stylesheet" href="https://fastly.jsdelivr.net/gh/willow-god/Friend-Circle-Lite/main/fclite.min.css">
<script src="https://fastly.jsdelivr.net/gh/willow-god/Friend-Circle-Lite/main/fclite.min.js"></script>
<script>
(function() {
    var avatarMap = null;

    function loadMapping() {
        return fetch('/data/avatar-mapping.json')
            .then(function(r) { return r.json(); })
            .then(function(map) { avatarMap = map; })
            .catch(function() { avatarMap = {}; });
    }

    var PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><rect width="100%" height="100%" fill="%23e0e0e0"/><text x="50%" y="54%" text-anchor="middle" font-size="28" font-weight="bold" fill="%23999">404</text></svg>');

    function replaceAvatar(img) {
        var src = img.getAttribute('src');
        if (!src || !avatarMap || src.indexOf('/img/avatars/') !== -1) return;
        if (src.indexOf('liiiu.cn') !== -1) {
            img.setAttribute('src', avatarMap[src] || PLACEHOLDER);
            img.onerror = null;
        }
    }

    function processNode(node) {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'IMG') replaceAvatar(node);
        if (node.querySelectorAll) {
            node.querySelectorAll('img').forEach(replaceAvatar);
        }
    }

    loadMapping().then(function() {
        var root = document.getElementById('friend-circle-lite-root');
        if (!root) return;
        // 处理已有的图片
        root.querySelectorAll('img').forEach(replaceAvatar);
        // 监听后续渲染的图片
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                m.addedNodes.forEach(processNode);
            });
        });
        observer.observe(root, { childList: true, subtree: true });
    });
})();
</script>
