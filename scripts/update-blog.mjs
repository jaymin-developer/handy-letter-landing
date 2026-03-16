/**
 * 네이버 블로그 최신글 3개를 가져와 index.html을 자동 업데이트하는 스크립트
 * 외부 의존성 없음 — Node.js 내장 모듈만 사용
 */

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

/** HTTPS GET 요청 (Promise) */
const fetchUrl = (url, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });

/** 바이너리 다운로드 (Referer 헤더 포함) */
const downloadImage = async (url, destPath) => {
  const buffer = await fetchUrl(url, { Referer: 'https://blog.naver.com/' });
  fs.writeFileSync(destPath, buffer);
  console.log(`  ✓ 다운로드: ${path.basename(destPath)} (${(buffer.length / 1024).toFixed(0)}KB)`);
};

/** 네이버 블로그 목록 페이지에서 최신 글 3개 추출 */
const fetchLatestPosts = async () => {
  const listUrl = `https://blog.naver.com/PostList.naver?blogId=${BLOG_ID}&categoryNo=${CATEGORY_NO}&widgetTypeCall=true&noTrackingCode=true&directAccess=true`;
  const html = (await fetchUrl(listUrl)).toString('utf-8');

  // PostView 링크 + 제목 추출
  const postRegex = /PostView\.naver\?blogId=handy__&logNo=(\d+)&categoryNo=26[^"]*"[^>]*>([^<]+)</g;
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

/** 개별 포스트에서 OG 이미지 + 날짜 추출 */
const fetchPostMeta = async (logNo) => {
  const postUrl = `https://blog.naver.com/PostView.naver?blogId=${BLOG_ID}&logNo=${logNo}`;
  const html = (await fetchUrl(postUrl)).toString('utf-8');

  const ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
  const ogImage = ogMatch ? ogMatch[1] : null;

  // 날짜 추출 (se-publishDate 또는 blog_date 클래스)
  const dateMatch = html.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
  const date = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    : '';

  return { ogImage, date };
};

/** 카테고리 자동 추출 (제목 기반 간단 분류) */
const categorize = (title) => {
  if (/AI|ChatGPT|Claude/i.test(title)) return 'AI · 마케팅';
  if (/블로그/i.test(title)) return '블로그 마케팅';
  if (/상위노출|SEO|검색/i.test(title)) return 'SEO · 상위노출';
  if (/홈페이지/i.test(title)) return '홈페이지';
  if (/인스타|SNS/i.test(title)) return 'SNS 마케팅';
  if (/숏폼|영상|유튜브/i.test(title)) return '숏폼 · 영상';
  if (/광고|규제/i.test(title)) return '광고 · 규제';
  return '마케팅 전략';
};

/** 썸네일 파일 확장자 결정 */
const getExt = (url) => {
  if (url.includes('.gif') || url.includes('.GIF')) return '.gif';
  if (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.JPEG')) return '.jpg';
  return '.png';
};

/** index.html 블로그 섹션 업데이트 */
const updateIndexHtml = (posts) => {
  let html = fs.readFileSync(INDEX_PATH, 'utf-8');

  // 블로그 카드 3개 영역을 정규식으로 찾아서 교체
  const blogGridStart = html.indexOf('<!-- BLOG_CARDS_START -->');
  const blogGridEnd = html.indexOf('<!-- BLOG_CARDS_END -->');

  if (blogGridStart === -1 || blogGridEnd === -1) {
    // 마커가 없으면 기존 카드 그리드를 찾아서 교체
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

    html = html.replace(gridRegex, `$1${cardsHtml}\n`);
  }

  fs.writeFileSync(INDEX_PATH, html);
  console.log('✓ index.html 업데이트 완료');
};

/** 메인 실행 */
const main = async () => {
  console.log('🔍 네이버 블로그 최신글 가져오는 중...');

  // 1. 최신 글 3개 목록 가져오기
  const posts = await fetchLatestPosts();
  if (posts.length === 0) {
    console.error('❌ 블로그 글을 찾을 수 없습니다.');
    process.exit(1);
  }
  console.log(`✓ ${posts.length}개 글 발견`);

  // 2. 각 글의 OG 이미지 + 날짜 가져오기
  for (const post of posts) {
    console.log(`  → ${post.title}`);
    const meta = await fetchPostMeta(post.logNo);
    post.ogImage = meta.ogImage;
    post.date = meta.date;
    post.category = categorize(post.title);
  }

  // 3. 썸네일 다운로드
  console.log('\n📥 썸네일 다운로드 중...');
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    if (post.ogImage) {
      post.ext = getExt(post.ogImage);
      const destPath = path.join(IMAGES_DIR, `thumb${i + 1}${post.ext}`);
      // 기존 thumb 파일 삭제 (확장자가 다를 수 있으므로)
      for (const ext of ['.png', '.jpg', '.gif', '.jpeg']) {
        const oldPath = path.join(IMAGES_DIR, `thumb${i + 1}${ext}`);
        if (fs.existsSync(oldPath) && oldPath !== destPath) fs.unlinkSync(oldPath);
      }
      await downloadImage(post.ogImage, destPath);
    } else {
      post.ext = '.png';
      console.log(`  ⚠ OG 이미지 없음: ${post.title}`);
    }
  }

  // 4. index.html 업데이트
  console.log('\n✏️ index.html 업데이트 중...');
  updateIndexHtml(posts);

  console.log('\n✅ 완료! 변경 사항:');
  for (let i = 0; i < posts.length; i++) {
    console.log(`  ${i + 1}. ${posts[i].title} (${posts[i].date})`);
  }
};

main().catch((err) => {
  console.error('❌ 오류:', err.message);
  process.exit(1);
});
