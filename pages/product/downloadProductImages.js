// features/product/downloadProductImages.js
const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

// 建立不驗證 SSL 的 agent 用於重試
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

// 以專案根目錄為基準
const projectRoot = process.cwd();

// 1. 讀取 Database.json
const dbPath = path.join(projectRoot, 'app', 'data', 'Database.json');
console.log('📦 dbPath =', dbPath);
const db = fs.readJsonSync(dbPath);
const products = db.products || [];
console.log('📦 Loaded products:', products.map(p => p.id));

// 2. 設定 public 下的 product_images 目錄
const imagesDir = path.join(projectRoot, 'public', 'product_images');
console.log('📂 imagesDir =', imagesDir);
fs.ensureDirSync(imagesDir);

// 取得目錄中僅限 jpg/png 的檔案列表
const listImages = () =>
  fs.readdirSync(imagesDir).filter(f => /\.(jpe?g|png)$/i.test(f));
console.log('🗂 Before download, contents =', listImages());

// fetch 時間上限（毫秒）與最大重試次數
const FETCH_TIMEOUT = 1000;  // 15 seconds
const MAX_RETRIES = 1;

/**
 * doFetch: 嘗試 fetch 並對超時或停滯自動重試
 * @param {string} url
 * @param {object} opts  可包含 agent
 * @param {number} retries 剩餘重試次數
 * @returns {Promise<import('node-fetch').Response|null>}
 */
async function doFetch(url, opts = {}, retries = MAX_RETRIES) {
  try {
    return await fetch(url, { ...opts, timeout: FETCH_TIMEOUT });
  } catch (err) {
    // node-fetch v2 超時型別：request-timeout 或 body-timeout
    if (
      (err.type === 'request-timeout' || err.type === 'body-timeout') &&
      retries > 0
    ) {
      console.warn(`⏱️ fetch timeout (${err.type}), retries left: ${retries - 1}`);
      return doFetch(url, opts, retries - 1);
    }
    console.warn(`⚠️ fetch error: ${err.message}`);
    return null;
  }
}

(async () => {
  for (const p of products) {
    const url = (p.imageLink || '').trim();
    p.localImage = '';

    // 若本地已存在 JPG 或 PNG，跳過
    for (const ext of ['jpg', 'png']) {
      const existing = path.join(imagesDir, `${p.id}.${ext}`);
      if (fs.existsSync(existing)) {
        p.localImage = `/product_images/${p.id}.${ext}`;
        console.log(`⏭️ ${p.id} local .${ext} exists, skip`);
        break;
      }
    }
    if (p.localImage) continue;

    // 1) data URI 支援
    if (url.startsWith('data:image/')) {
      const match = url.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const ext = match[1];   // jpeg, png, gif…
        const b64 = match[2];
        const buffer = Buffer.from(b64, 'base64');
        const filename = `${p.id}.${ext}`;
        const filePath = path.join(imagesDir, filename);
        await fs.writeFile(filePath, buffer);
        p.localImage = `/product_images/${filename}`;
        console.log(`✅ ${p.id} saved data URI as ${filename}`);
      } else {
        console.warn(`⚠️ ${p.id} invalid data URI, skip`);
      }
      continue;
    }

    // 2) HTTP(S) URL 支援
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // 正常 agent 嘗試
      let res = await doFetch(url);

      // 若 fetch 成功但 HTTP 狀態非 200-299，再用 insecureAgent 重試
      if (res && !res.ok) {
        console.warn(`⚠️ ${p.id} HTTP ${res.status}, retry with insecure agent`);
        res = await doFetch(url, { agent: insecureAgent });
      }
      if (!res || !res.ok) {
        console.warn(`❌ ${p.id} cannot fetch image, skip`);
        continue;
      }

      // 根據 Content-Type 判斷副檔名
      const ct = res.headers.get('content-type') || '';
      const ext = ct.includes('png') ? 'png' : 'jpg';
      const filename = `${p.id}.${ext}`;
      const filePath = path.join(imagesDir, filename);

      // 使用 stream pipeline 直接寫入檔案
      try {
        await streamPipeline(res.body, fs.createWriteStream(filePath));
        p.localImage = `/product_images/${filename}`;
        console.log(`✅ ${p.id} downloaded and saved as ${filename}`);
      } catch (err) {
        console.warn(`⚠️ ${p.id} stream write error: ${err.message}`);
      }
      continue;
    }

    // 3) 其他一律跳過
    console.warn(`⚠️ ${p.id} invalid imageLink, skip`);
  }

  // 3. 寫回 Database.json
  await fs.writeJson(dbPath, db, { spaces: 2 });
  console.log('💾 Database.json updated with localImage');

  // 4. 下載後再次列出檔案
  console.log('🗂 After download, contents =', listImages());
})();
