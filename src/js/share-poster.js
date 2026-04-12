/**
 * 水墨极简海报生成引擎
 * 
 * 纯 Canvas 渲染，不依赖额外库。
 * 风格：宣纸底色 + 焦墨标题 + 朱砂印 + QR 码
 */

import QRCode from 'qrcode';

// ============================================================
// 海报常量
// ============================================================
const W = 750;
const H = 1000;
// 固定 2x 缩放，确保输出 1500×2000 高清海报
const POSTER_DPR = 2;

const COLORS = {
  paper: '#F7F5F0',
  ink: '#2D2824',
  inkLight: 'rgba(45,40,36,.5)',
  inkMuted: 'rgba(45,40,36,.25)',
  cinnabar: '#C04B2D',
  white: '#FFFFFF',
};

const FONT = {
  serif: '"Noto Serif SC", "STSong", "SimSun", serif',
  sans: '"Noto Sans SC", system-ui, sans-serif',
};

// ============================================================
// 工具函数
// ============================================================

/** 等待字体加载（3s 超时兜底，避免无限等待） */
async function ensureFonts() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`600 40px ${FONT.serif}`),
        document.fonts.load(`500 24px ${FONT.sans}`),
        document.fonts.load(`400 18px ${FONT.sans}`),
      ]),
      new Promise(r => setTimeout(r, 3000)),
    ]);
  } catch { /* 字体加载失败则降级系统字体 */ }
}

/** Canvas 文字自动换行，返回实际行数 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = text.split('');
  let line = '';
  let lines = 0;
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = chars[i];
      y += lineHeight;
      lines++;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    lines++;
  }
  return { lines, endY: y };
}

/** 居中绘制文本 */
function drawCentered(ctx, text, y, maxWidth) {
  const w = ctx.measureText(text).width;
  ctx.fillText(text, (W - Math.min(w, maxWidth)) / 2, y);
}

/** 生成 QR 码 Canvas */
async function generateQR(url) {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, url, {
    width: 120,
    margin: 0,
    color: { dark: COLORS.ink, light: COLORS.paper },
    errorCorrectionLevel: 'M',
  });
  return canvas;
}

// ============================================================
// 海报模板
// ============================================================

/**
 * 单集/系列海报
 * @param {Object} config
 * @param {string} config.title - 系列名
 * @param {string} [config.subtitle] - 集名/法师名
 * @param {string} [config.quote] - 法语引用
 * @param {string} [config.author] - 引用出处
 * @param {string} config.url - 分享链接
 */
async function drawTrackPoster(ctx, config) {
  const { title, subtitle, quote, author, url } = config;
  const pad = 80;
  let y = 100;

  // 品牌
  ctx.font = `500 18px ${FONT.sans}`;
  ctx.fillStyle = COLORS.inkMuted;
  ctx.textAlign = 'center';
  ctx.fillText('净土法音', W / 2, y);
  y += 16;

  // 小装饰线
  ctx.strokeStyle = COLORS.inkMuted;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 30, y);
  ctx.lineTo(W / 2 + 30, y);
  ctx.stroke();
  y += 80;

  // 标题
  ctx.font = `600 40px ${FONT.serif}`;
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'center';
  const titleW = ctx.measureText(title).width;
  if (titleW > W - pad * 2) {
    // 标题过长，缩小字号
    ctx.font = `600 32px ${FONT.serif}`;
  }
  ctx.fillText(title, W / 2, y);
  y += 50;

  // 副标题
  if (subtitle) {
    ctx.font = `400 22px ${FONT.sans}`;
    ctx.fillStyle = COLORS.inkLight;
    ctx.fillText(subtitle, W / 2, y);
    y += 40;
  }

  // 法语引用
  if (quote) {
    y += 40;
    ctx.font = `500 24px ${FONT.serif}`;
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'center';

    const lines = quote.split('\n');
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += 42;
    }

    if (author) {
      y += 10;
      ctx.font = `400 18px ${FONT.sans}`;
      ctx.fillStyle = COLORS.inkLight;
      ctx.fillText(`— ${author}`, W / 2, y);
    }
  }

  // QR 码区 — 固定在底部
  const qrY = H - 180;
  try {
    const qrCanvas = await generateQR(url);
    ctx.drawImage(qrCanvas, W / 2 - 60, qrY);
  } catch { /* QR 失败静默 */ }

  ctx.font = `400 16px ${FONT.sans}`;
  ctx.fillStyle = COLORS.inkMuted;
  ctx.textAlign = 'center';
  ctx.fillText('扫码收听 · foyue.org', W / 2, qrY + 145);
}

/**
 * 法语海报
 */
async function drawQuotePoster(ctx, config) {
  const { quote, author, url } = config;
  let y = 200;

  // 品牌
  ctx.font = `500 16px ${FONT.sans}`;
  ctx.fillStyle = COLORS.inkMuted;
  ctx.textAlign = 'center';
  ctx.fillText('净土法音 · 每日法语', W / 2, 80);

  // 法语 — 大字居中
  ctx.font = `600 36px ${FONT.serif}`;
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = 'center';

  const lines = quote.split('\n');
  // 根据行数调整起始位置
  const totalH = lines.length * 60;
  y = Math.max(200, (H - totalH) / 2 - 80);

  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += 60;
  }

  // 作者
  if (author) {
    y += 20;
    ctx.font = `400 22px ${FONT.sans}`;
    ctx.fillStyle = COLORS.inkLight;
    ctx.fillText(`— ${author}`, W / 2, y);
  }

  // QR 码
  const qrY = H - 180;
  try {
    const qrCanvas = await generateQR(url);
    ctx.drawImage(qrCanvas, W / 2 - 60, qrY);
  } catch { /* */ }

  ctx.font = `400 16px ${FONT.sans}`;
  ctx.fillStyle = COLORS.inkMuted;
  ctx.textAlign = 'center';
  ctx.fillText('扫码收听 · foyue.org', W / 2, qrY + 145);
}

/**
 * 念佛计数海报
 */
async function drawPracticePoster(ctx, config) {
  const { count, totalCount, practice = '念佛', url } = config;
  let y = 120;

  // 品牌
  ctx.font = `500 16px ${FONT.sans}`;
  ctx.fillStyle = COLORS.inkMuted;
  ctx.textAlign = 'center';
  ctx.fillText('净土法音', W / 2, y);
  y += 120;

  // 修行名
  ctx.font = `500 24px ${FONT.sans}`;
  ctx.fillStyle = COLORS.inkLight;
  ctx.fillText(`今日${practice}`, W / 2, y);
  y += 70;

  // 计数大字
  ctx.font = `600 72px ${FONT.serif}`;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(formatNumber(count), W / 2, y);
  y += 50;

  // 累计
  if (totalCount) {
    ctx.font = `400 20px ${FONT.sans}`;
    ctx.fillStyle = COLORS.inkMuted;
    ctx.fillText(`累计 ${formatNumber(totalCount)}`, W / 2, y);
  }

  // 朱砂印 — 小方章
  drawSeal(ctx, W / 2 + 120, y + 50);

  // QR 码
  const qrY = H - 180;
  try {
    const qrCanvas = await generateQR(url);
    ctx.drawImage(qrCanvas, W / 2 - 60, qrY);
  } catch { /* */ }

  ctx.font = `400 16px ${FONT.sans}`;
  ctx.fillStyle = COLORS.inkMuted;
  ctx.textAlign = 'center';
  ctx.fillText('扫码收听 · foyue.org', W / 2, qrY + 145);
}

/** 朱砂印章 — 小方块 */
function drawSeal(ctx, x, y) {
  const size = 36;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.08); // 微微歪斜
  ctx.fillStyle = COLORS.cinnabar;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.font = `600 16px ${FONT.sans}`;
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('佛', 0, 1);
  ctx.restore();
}

function formatNumber(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString('zh-CN');
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 生成海报 Blob
 * @param {Object} config
 * @param {'track'|'series'|'quote'|'practice'} config.type
 * @returns {Promise<Blob>}
 */
export async function generatePoster(config) {
  await ensureFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W * POSTER_DPR;
  canvas.height = H * POSTER_DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(POSTER_DPR, POSTER_DPR);

  // 宣纸底色
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, W, H);

  switch (config.type) {
    case 'quote':
      await drawQuotePoster(ctx, config);
      break;
    case 'practice':
      await drawPracticePoster(ctx, config);
      break;
    case 'track':
    case 'series':
    default:
      await drawTrackPoster(ctx, config);
      break;
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
