/**
 * Pages Function: /share/*
 * 处理分享链接，为社交媒体爬虫提供动态 OG 标签
 *
 * 路径格式:
 *   /share/{seriesId}          — 分享系列
 *   /share/{seriesId}/{epNum}  — 分享单集
 *
 * 爬虫请求: 返回包含 OG 标签的 HTML
 * 普通用户: 302 重定向到 SPA (带 hash)
 */

const CRAWLERS = /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|TelegramBot|WhatsApp|Discordbot|Pinterest|Applebot|Baiduspider|Sogou|YandexBot|DuckDuckBot|ia_archiver|bingbot|Googlebot/i;

const SITE_NAME = '净土法音';
const SITE_DESC = '净土法音 · 听经闻法 念佛修行';
const SITE_URL = 'https://amituofo.pages.dev';
const OG_IMAGE = 'https://amituofo.pages.dev/icons/icon-512.png';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/share\/?/, '').split('/').filter(Boolean);

  if (segments.length === 0) {
    return Response.redirect(SITE_URL, 302);
  }

  const seriesId = decodeURIComponent(segments[0]);
  const epNum = segments[1] != null ? parseInt(segments[1], 10) : null;
  const ua = request.headers.get('User-Agent') || '';
  const isCrawler = CRAWLERS.test(ua);

  // 普通用户: 直接重定向到 SPA 带 hash
  if (!isCrawler) {
    const hash = epNum != null && !isNaN(epNum)
      ? `#${encodeURIComponent(seriesId + '/' + epNum)}`
      : `#${encodeURIComponent(seriesId)}`;
    return Response.redirect(`${SITE_URL}/${hash}`, 302);
  }

  // 爬虫: 查找系列信息，生成 OG 标签
  let title = SITE_NAME;
  let description = SITE_DESC;

  try {
    // 尝试从 D1 获取系列信息
    const db = env.DB;
    if (db) {
      const series = await db.prepare(
        'SELECT title, speaker, total_episodes, intro FROM series WHERE id = ?'
      ).bind(seriesId).first();

      if (series) {
        if (epNum != null && !isNaN(epNum)) {
          // 单集分享
          const ep = await db.prepare(
            'SELECT title FROM episodes WHERE series_id = ? AND episode_num = ?'
          ).bind(seriesId, epNum).first();
          const epTitle = ep ? ep.title : `第${epNum}集`;
          title = `《${series.title}》${epTitle}`;
          description = series.intro
            ? series.intro.slice(0, 120)
            : `${series.speaker || ''} · 共${series.total_episodes || ''}集`;
        } else {
          // 系列分享
          title = `《${series.title}》共${series.total_episodes || ''}集`;
          description = series.intro
            ? series.intro.slice(0, 120)
            : `${series.speaker || ''} · ${SITE_DESC}`;
        }
      }
    }
  } catch (e) {
    // D1 查询失败时使用默认值
    console.error('OG lookup error:', e.message);
  }

  // 返回包含 OG 标签的 HTML（爬虫不执行 JS，但我们加一个 meta refresh 以防万一）
  const hash = epNum != null && !isNaN(epNum)
    ? `#${encodeURIComponent(seriesId + '/' + epNum)}`
    : `#${encodeURIComponent(seriesId)}`;
  const canonicalUrl = `${SITE_URL}${url.pathname}`;
  const redirectUrl = `${SITE_URL}/${hash}`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${esc(title)} - ${SITE_NAME}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<meta http-equiv="refresh" content="0;url=${esc(redirectUrl)}">
</head>
<body>
<p>正在跳转到 ${esc(title)}...</p>
<p><a href="${esc(redirectUrl)}">${esc(title)}</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
