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
    // 图片代理：绕过 p.liiiu.cn 等图床的防盗链
    function proxyUrl(src) {
        if (!src || src.startsWith('data:') || src.startsWith('/')) return src;
        return 'https://wsrv.nl/?url=' + encodeURIComponent(src);
    }

    function proxyImage(img) {
        var src = img.getAttribute('src');
        if (src && src.indexOf('wsrv.nl') === -1 && src.indexOf('liiiu.cn') !== -1) {
            img.setAttribute('src', proxyUrl(src));
        }
        // 同时处理 onerror，避免代理失败后再次触发原始域名请求
        img.onerror = function() {
            this.onerror = null;
            this.src = '/img/avatar.jpg';
        };
    }

    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            m.addedNodes.forEach(function(node) {
                if (node.nodeType !== 1) return;
                if (node.classList && node.classList.contains('card-bg')) proxyImage(node);
                if (node.querySelectorAll) {
                    node.querySelectorAll('img').forEach(proxyImage);
                }
            });
        });
    });

    var root = document.getElementById('friend-circle-lite-root');
    if (root) observer.observe(root, { childList: true, subtree: true });
})();
</script>
