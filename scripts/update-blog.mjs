import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const IMAGES_DIR = path.join(ROOT, 'images');

const BLOG_ID = 'handy__';
const CATEGORY_NO = 26;
const STIBEE_URL = 'https://handy-professional.stibee.com/';

const fetchUrl = (url, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });

const downloadImage = async (url, destPath) => {
  const buffer = await fetchUrl(url, { Referer: 'https://blog.naver.com/' });
  fs.writeFileSync(destPath, buffer);
  console.log(`  ✓ ${path.basename(destPath)} (${(buffer.length / 1024).toFixed(0)}KB)`);
};

// ═══════════════════════════════════════════
// 블로그 업데이트
// ═══════════════════════════════════════════

const fetchLatestPosts = async () => {
  const listUrl = `https://blog.naver.com/PostList.naver?blogId=${BLOG_ID}&categoryNo=${CATEGORY_NO}&widgetTypeCall=true&noTrackingCode=true&directAccess=true`;
  const html = (await fetchUrl(listUrl)).toString('utf-8');

  const postRegex = /PostView\.naver\?blogId=handy__&logNo=(\d+)&categoryNo=26[^"]*"[^>]*>([^<]+)/g;
  const seen = new Set();
  const posts = [];

  let match = postRegex.exec(html);
  while (match !== null) {
    const logNo = match[1];
    const title = match[2].trim();
    if (!seen.has(logNo) && title.length > 5) {
      seen.add(logNo);
      posts.push({ logNo, title, url: `https://blog.naver.com/handy__/${logNo}` });
    }
    if (posts.length >= 3) break;
    match = postRegex.exec(html);
  }
  return posts;
};

const fetchPostMeta = async (logNo) => {
  const postUrl = `https://blog.naver.com/PostView.naver?blogId=${BLOG_ID}&logNo=${logNo}`;
  const html = (await fetchUrl(postUrl)).toString('utf-8');
  const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
  const dateMatch = html.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
  return {
    ogImage: ogMatch ? ogMatch[1] : null,
    date: dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}` : '',
  };
};

const categorize = (title) => {
  if (/AI|ChatGPT|Claude|바이브/i.test(title)) return 'AI · 마케팅';
  if (/블로그/i.test(title)) return '블로그 마케팅';
  if (/상위노출|SEO|검색/i.test(title)) return 'SEO · 상위노출';
  if (/홈페이지/i.test(title)) return '홈페이지';
  if (/인스타|SNS/i.test(title)) return 'SNS 마케팅';
  if (/숏폼|영상|유튜브/i.test(title)) return '숏폼 · 영상';
  if (/광고|규제/i.test(title)) return '광고 · 규제';
  return '마케팅 전략';
};

const getExt = (url) => {
  if (/\.gif/i.test(url)) return '.gif';
  if (/\.jpe?g/i.test(url)) return '.jpg';
  return '.png';
};

const updateBlogSection = (html, posts) => {
  const gridRegex = /(<div class="card-grid stagger">\s*)((?:<a href="https:\/\/blog\.naver\.com\/handy__\/.*?<\/a>\s*){3})/s;
  const cardsHtml = posts.map((p, i) => `        <a href="${p.url}" target="_blank" class="blog-card">
          <div class="blog-thumb">
            <img src="images/thumb${i + 1}${p.ext}" alt="${p.title}" loading="lazy">
          </div>
          <div class="blog-body">
            <div class="blog-category">${p.category}</div>
            <h3 class="blog-title">${p.title}</h3>
            <div class="blog-date">${p.date}</div>
          </div>
        </a>`).join('\n');
  return html.replace(gridRegex, `$1${cardsHtml}\n`);
};

// ═══════════════════════════════════════════
// 뉴스레터 아카이브 업데이트
// ═══════════════════════════════════════════

const decodeHtmlEntities = (str) =>
  str.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");

const fetchLatestNewsletters = async () => {
  const newsletters = [];

  // /p/N을 역순으로 탐색하여 최신 3개 찾기 (최대 20까지 탐색)
  for (let id = 20; id >= 1; id--) {
    const url = `https://handy-professional.stibee.com/p/${id}`;
    const html = (await fetchUrl(url)).toString('utf-8');
    const titleMatch = html.match(/og:title[^>]*content="([^"]+)"/);
    if (!titleMatch) continue;

    const descMatch = html.match(/og:description[^>]*content="([^"]+)"/);
    const title = decodeHtmlEntities(titleMatch[1]);
    const desc = descMatch ? decodeHtmlEntities(descMatch[1]).substring(0, 80) : '';

    newsletters.push({ title, desc, date: '', path: `/p/${id}` });
    if (newsletters.length >= 3) break;
  }

  return newsletters;
};

const formatStibeeDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};

const updateArchiveSection = (html, newsletters) => {
  if (newsletters.length < 3) return html;

  const n0 = newsletters[0];
  const n1 = newsletters[1];
  const n2 = newsletters[2];

  const archiveRegex = /(<div class="card-grid stagger">\s*)<a href="https:\/\/handy-professional\.stibee\.com\/p\/\d+"[^>]*class="archive-card">([\s\S]*?)<\/a>\s*<div class="archive-card-locked"[^>]*>([\s\S]*?)<\/div>\s*<div class="archive-card-locked"[^>]*>([\s\S]*?)<\/div>/;

  const archiveHtml = `$1<a href="https://handy-professional.stibee.com${n0.path}" target="_blank" class="archive-card">
          <div class="archive-badge">최신호 · 무료 공개</div>
          <h3 class="archive-title">${n0.title}</h3>
          <p class="archive-desc">${n0.desc}</p>
          <div class="archive-footer">${formatStibeeDate(n0.date)}  |  읽기 →</div>
        </a>
        <div class="archive-card-locked" aria-disabled="true" role="article">
          <div class="archive-badge-locked"><span aria-hidden="true">✦</span> 구독자 전용</div>
          <h3 class="archive-title">${n1.title}</h3>
          <div class="archive-desc-locked" aria-label="구독자 전용 콘텐츠">
            <p>${n1.desc}</p>
          </div>
          <div class="archive-footer">${formatStibeeDate(n1.date)}  |  구독 후 열람</div>
        </div>
        <div class="archive-card-locked" aria-disabled="true" role="article">
          <div class="archive-badge-locked"><span aria-hidden="true">✦</span> 구독자 전용</div>
          <h3 class="archive-title">${n2.title}</h3>
          <div class="archive-desc-locked" aria-label="구독자 전용 콘텐츠">
            <p>${n2.desc}</p>
          </div>
          <div class="archive-footer">${formatStibeeDate(n2.date)}  |  구독 후 열람</div>
        </div>`;

  return html.replace(archiveRegex, archiveHtml);
};

// ═══════════════════════════════════════════
// 메인
// ═══════════════════════════════════════════

const main = async () => {
  let html = fs.readFileSync(INDEX_PATH, 'utf-8');

  // ── 1. 블로그 최신글 ──
  console.log('📰 네이버 블로그 최신글 가져오는 중...');
  const posts = await fetchLatestPosts();
  if (posts.length === 0) {
    console.log('⚠ 블로그 글을 찾을 수 없습니다. 건너뜁니다.');
  } else {
    console.log(`✓ ${posts.length}개 글 발견`);
    for (const post of posts) {
      console.log(`  → ${post.title}`);
      const meta = await fetchPostMeta(post.logNo);
      post.ogImage = meta.ogImage;
      post.date = meta.date;
      post.category = categorize(post.title);
    }

    console.log('\n📥 블로그 썸네일 다운로드...');
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      if (post.ogImage) {
        post.ext = getExt(post.ogImage);
        const destPath = path.join(IMAGES_DIR, `thumb${i + 1}${post.ext}`);
        for (const ext of ['.png', '.jpg', '.gif', '.jpeg']) {
          const oldPath = path.join(IMAGES_DIR, `thumb${i + 1}${ext}`);
          if (fs.existsSync(oldPath) && oldPath !== destPath) fs.unlinkSync(oldPath);
        }
        await downloadImage(post.ogImage, destPath);
      } else {
        post.ext = '.png';
      }
    }

    html = updateBlogSection(html, posts);
    console.log('✓ 블로그 섹션 업데이트 완료\n');
  }

  // ── 2. 뉴스레터 아카이브 ──
  console.log('📬 스티비 뉴스레터 최신호 가져오는 중...');
  const newsletters = await fetchLatestNewsletters();
  if (newsletters.length < 3) {
    console.log('⚠ 뉴스레터를 3개 이상 찾을 수 없습니다. 건너뜁니다.');
  } else {
    console.log(`✓ ${newsletters.length}개 뉴스레터 발견`);
    for (let i = 0; i < newsletters.length; i++) {
      console.log(`  → ${newsletters[i].title} (${formatStibeeDate(newsletters[i].date)})`);
    }
    html = updateArchiveSection(html, newsletters);
    console.log('✓ 아카이브 섹션 업데이트 완료\n');
  }

  // ── 3. 저장 ──
  fs.writeFileSync(INDEX_PATH, html);
  console.log('✅ index.html 저장 완료');
};

main().catch((err) => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
