/**
 * 下载 Friend-Circle-Lite 头像到本地
 * 用法: node scripts/download-fcircle-avatars.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API_URL = 'https://fc.liushen.fun/all.json';
const AVATAR_DIR = path.join(__dirname, '..', 'source', 'img', 'avatars');
const MAPPING_FILE = path.join(__dirname, '..', 'source', 'data', 'avatar-mapping.json');

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close();
                fs.unlinkSync(filepath);
                return downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
            }
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => {
            file.close();
            fs.unlinkSync(filepath);
            reject(err);
        });
    });
}

function hashUrl(url) {
    return crypto.createHash('md5').update(url).digest('hex').slice(0, 12);
}

async function main() {
    // 确保目录存在
    if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
    const dataDir = path.dirname(MAPPING_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    console.log('正在获取文章数据...');
    const data = await fetchJSON(API_URL);
    const articles = data.article_data || [];

    // 提取唯一头像 URL
    const avatarMap = new Map();
    articles.forEach(a => {
        if (a.avatar && !avatarMap.has(a.avatar)) {
            avatarMap.set(a.avatar, null);
        }
    });

    console.log(`发现 ${avatarMap.size} 个唯一头像，开始下载...`);

    let count = 0;
    for (const [url] of avatarMap) {
        const ext = path.extname(new URL(url).pathname) || '.webp';
        const filename = hashUrl(url) + ext;
        const filepath = path.join(AVATAR_DIR, filename);

        if (fs.existsSync(filepath)) {
            console.log(`[${++count}/${avatarMap.size}] 已存在，跳过: ${filename}`);
            avatarMap.set(url, `/img/avatars/${filename}`);
            continue;
        }

        try {
            await downloadImage(url, filepath);
            avatarMap.set(url, `/img/avatars/${filename}`);
            console.log(`[${++count}/${avatarMap.size}] 下载成功: ${filename}`);
        } catch (err) {
            console.error(`[${++count}/${avatarMap.size}] 下载失败: ${url} - ${err.message}`);
            avatarMap.set(url, null);
        }
    }

    // 保存映射文件
    const mapping = Object.fromEntries(avatarMap);
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2));
    console.log(`\n映射文件已保存到: ${MAPPING_FILE}`);
    console.log('下载完成！');
}

main().catch(console.error);
