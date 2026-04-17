/**
 * 水墨极简海报生成引擎
 *
 * 纯 Canvas 渲染，不依赖额外库。
 * 风格：宣纸底色 + 焦墨标题 + 朱砂点缀 + QR 引导区
 */

import QRCode from 'qrcode';

// ============================================================
// 海报常量
// ============================================================
const W = 600;
const H = 800;
const POSTER_DPR = 1.5;

const COLORS = {
  paper: '#F7F3EA',
  paperDeep: '#EFE7D8',
  card: 'rgba(255,255,255,.46)',
  cardStrong: 'rgba(255,255,255,.62)',
  line: 'rgba(96,76,59,.14)',
  ink: '#2D2824',
  inkLight: 'rgba(45,40,36,.68)',
  inkSoft: 'rgba(45,40,36,.48)',
  inkMuted: 'rgba(45,40,36,.28)',
  inkFaint: 'rgba(45,40,36,.12)',
  cinnabar: '#BC4C31',
  cinnabarSoft: 'rgba(188,76,49,.14)',
  cinnabarMist: 'rgba(188,76,49,.08)',
  white: '#FFFFFF',
};

const FONT = {
  serif: '"Noto Serif SC", "STSong", "SimSun", serif',
  sans: '"Noto Sans SC", system-ui, sans-serif',
};

const TYPE_THEME = {
  track: {
    label: '单集法音',
    footerTitle: '扫码收听本期法音',
    footerNote: '静下片刻，随时安住身心。',
    seal: '闻',
    washes: [
      { x: 470, y: 150, rx: 180, ry: 96, color: COLORS.cinnabarMist, rotation: -0.18 },
      { x: 145, y: 330, rx: 170, ry: 120, color: 'rgba(45,40,36,.055)', rotation: 0.15 },
    ],
  },
  series: {
    label: '系列法音',
    footerTitle: '扫码进入系列法音',
    footerNote: '循序熏修，适合连续聆听。',
    seal: '修',
    washes: [
      { x: 452, y: 142, rx: 194, ry: 110, color: COLORS.cinnabarMist, rotation: -0.22 },
      { x: 138, y: 392, rx: 154, ry: 124, color: 'rgba(45,40,36,.05)', rotation: 0.2 },
    ],
  },
  quote: {
    label: '每日法语',
    footerTitle: '扫码收听法语开示',
    footerNote: '一段法语，一次回照。',
    seal: '诵',
    washes: [
      { x: 300, y: 222, rx: 240, ry: 126, color: COLORS.cinnabarMist, rotation: -0.06 },
      { x: 130, y: 540, rx: 150, ry: 105, color: 'rgba(45,40,36,.05)', rotation: 0.18 },
    ],
  },
  practice: {
    label: '修持记录',
    footerTitle: '扫码继续今日修持',
    footerNote: '愿此功德，回向法界众生。',
    seal: '持',
    washes: [
      { x: 300, y: 298, rx: 176, ry: 176, color: COLORS.cinnabarMist, rotation: 0 },
      { x: 458, y: 488, rx: 148, ry: 102, color: 'rgba(45,40,36,.05)', rotation: -0.12 },
    ],
  },
  wenku: {
    label: '文库摘录',
    footerTitle: '扫码阅读原文',
    footerNote: '静心阅读，断疑生信。',
    seal: '读',
    washes: [
      { x: 470, y: 190, rx: 180, ry: 110, color: COLORS.cinnabarMist, rotation: -0.1 },
      { x: 110, y: 508, rx: 178, ry: 112, color: 'rgba(45,40,36,.05)', rotation: 0.2 },
    ],
  },
  ai: {
    label: 'AI 答疑',
    footerTitle: '扫码继续提问',
    footerNote: 'AI 内容仅供参考，请依经典与善知识开示。',
    seal: '问',
    washes: [
      { x: 468, y: 160, rx: 190, ry: 100, color: COLORS.cinnabarMist, rotation: -0.16 },
      { x: 140, y: 420, rx: 164, ry: 120, color: 'rgba(45,40,36,.05)', rotation: 0.16 },
    ],
  },
};

// ============================================================
// 工具函数
// ============================================================

/** 等待字体加载（3s 超时兜底，避免无限等待） */
async function ensureFonts() {
  if (!document.fonts?.load) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`600 40px ${FONT.serif}`),
        document.fonts.load(`500 24px ${FONT.sans}`),
        document.fonts.load(`400 18px ${FONT.sans}`),
      ]),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // 字体加载失败时直接使用系统回退字体
  }
}

function normalizeText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\r/g, '')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pickText(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
}

function formatNumber(value) {
  const num = Number(value) || 0;
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}亿`;
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  return num.toLocaleString('zh-CN');
}

function roundRectPath(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRoundRect(ctx, x, y, w, h, radius, fillStyle, strokeStyle) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function drawWash(ctx, x, y, rx, ry, color, rotation = 0) {
  const radius = Math.max(rx, ry);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(rx / radius, ry / radius);
  const gradient = ctx.createRadialGradient(0, 0, radius * 0.08, 0, 0, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.7, color.replace(/\.\d+\)$/u, '.03)'));
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPaperBackground(ctx, theme) {
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, COLORS.paper);
  base.addColorStop(1, COLORS.paperDeep);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  for (const wash of theme.washes || []) {
    drawWash(ctx, wash.x, wash.y, wash.rx, wash.ry, wash.color, wash.rotation);
  }

  ctx.save();
  for (let i = 0; i < 7; i++) {
    const y = 120 + i * 88;
    ctx.strokeStyle = `rgba(109,91,70,${0.035 - i * 0.003})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(36, y + (i % 2 ? -4 : 5));
    ctx.quadraticCurveTo(W * 0.5, y + (i % 2 ? 8 : -12), W - 36, y - (i % 2 ? 6 : 2));
    ctx.stroke();
  }

  for (let i = 0; i < 16; i++) {
    const x = 48 + (i % 4) * 132 + (i % 2 ? 18 : 0);
    const y = 66 + Math.floor(i / 4) * 164 + (i % 3) * 7;
    ctx.fillStyle = `rgba(92,76,58,${0.03 + (i % 3) * 0.004})`;
    ctx.fillRect(x, y, 1, 14 + (i % 4) * 2);
  }
  ctx.restore();

  drawRoundRect(ctx, 24, 24, W - 48, H - 48, 26, null, 'rgba(92,76,58,.10)');
}

function splitTextToLines(ctx, text, maxWidth, maxLines = Infinity) {
  const normalized = normalizeText(text);
  if (!normalized) return { lines: [], truncated: false };

  const paragraphs = normalized.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  const lines = [];
  let truncated = false;

  for (let p = 0; p < paragraphs.length; p++) {
    const chars = Array.from(paragraphs[p]);
    let line = '';

    for (let i = 0; i < chars.length; i++) {
      const next = line + chars[i];
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line.trim());
        line = chars[i].trim() ? chars[i] : '';
        if (lines.length >= maxLines) {
          truncated = true;
          break;
        }
      } else {
        line = next;
      }
    }

    if (truncated) break;

    if (line) {
      lines.push(line.trim());
      if (lines.length >= maxLines && p < paragraphs.length - 1) {
        truncated = true;
        break;
      }
    }

    if (lines.length >= maxLines) {
      truncated = p < paragraphs.length - 1;
      break;
    }
  }

  if (truncated && lines.length) {
    const lastIndex = Math.min(lines.length - 1, maxLines - 1);
    let lastLine = lines[lastIndex].replace(/[，。；：、,\s]+$/u, '');
    while (lastLine && ctx.measureText(`${lastLine}…`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }
    lines[lastIndex] = `${lastLine || ''}…`;
    lines.length = Math.min(lines.length, maxLines);
  }

  return { lines, truncated };
}

function drawTextBlock(ctx, options) {
  const {
    text,
    x,
    y,
    maxWidth,
    lineHeight,
    maxLines = Infinity,
    font,
    color = COLORS.ink,
    align = 'left',
  } = options;

  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';

  const { lines, truncated } = splitTextToLines(ctx, text, maxWidth, maxLines);
  let currentY = y;
  for (const line of lines) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  ctx.restore();

  return {
    lines,
    truncated,
    endY: lines.length ? currentY - lineHeight : y,
  };
}

function drawFittedTitle(ctx, options) {
  const { text, x, y, maxWidth, maxLines = 2, align = 'center', sizes } = options;
  const title = normalizeText(text) || '净土法音';
  const fontSizes = sizes || [42, 40, 38, 36, 34, 32, 30];

  for (const size of fontSizes) {
    ctx.font = `600 ${size}px ${FONT.serif}`;
    const { lines } = splitTextToLines(ctx, title, maxWidth, maxLines);
    if (lines.length <= maxLines) {
      return drawTextBlock(ctx, {
        text: title,
        x,
        y,
        maxWidth,
        lineHeight: size + 14,
        maxLines,
        font: `600 ${size}px ${FONT.serif}`,
        color: COLORS.ink,
        align,
      });
    }
  }

  const minSize = fontSizes[fontSizes.length - 1];
  return drawTextBlock(ctx, {
    text: title,
    x,
    y,
    maxWidth,
    lineHeight: minSize + 12,
    maxLines,
    font: `600 ${minSize}px ${FONT.serif}`,
    color: COLORS.ink,
    align,
  });
}

function drawPill(ctx, x, y, text, options = {}) {
  const {
    fill = COLORS.cinnabarSoft,
    stroke = 'rgba(188,76,49,.14)',
    textColor = COLORS.cinnabar,
    height = 28,
    paddingX = 14,
    font = `600 13px ${FONT.sans}`,
  } = options;

  ctx.save();
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width + paddingX * 2);
  drawRoundRect(ctx, x, y, width, height, height / 2, fill, stroke);
  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + paddingX, y + height / 2 + 0.5);
  ctx.restore();
  return width;
}

function drawHeader(ctx, theme) {
  const top = 48;
  drawSeal(ctx, 66, top + 17, '净', 28);

  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 19px ${FONT.serif}`;
  ctx.fillText('净土法音', 92, top + 18);
  ctx.fillStyle = COLORS.inkSoft;
  ctx.font = `400 12px ${FONT.sans}`;
  ctx.fillText('foyue.org', 92, top + 38);
  ctx.restore();

  const pillWidth = measurePillWidth(ctx, theme.label || '分享海报');
  drawPill(ctx, W - 56 - pillWidth, top + 2, theme.label || '分享海报');

  ctx.save();
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 94);
  ctx.lineTo(W - 56, 94);
  ctx.stroke();
  ctx.restore();
}

function measurePillWidth(ctx, text, options = {}) {
  ctx.save();
  ctx.font = options.font || `600 13px ${FONT.sans}`;
  const width = Math.ceil(ctx.measureText(text).width + (options.paddingX || 14) * 2);
  ctx.restore();
  return width;
}

function drawPanel(ctx, x, y, w, h, options = {}) {
  const {
    label,
    radius = 28,
    fillTop = COLORS.cardStrong,
    fillBottom = COLORS.card,
    stroke = COLORS.line,
  } = options;

  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, fillTop);
  gradient.addColorStop(1, fillBottom);
  drawRoundRect(ctx, x, y, w, h, radius, gradient, stroke);

  if (label) {
    drawPill(ctx, x + 22, y + 18, label, {
      fill: 'rgba(255,255,255,.5)',
      stroke: 'rgba(92,76,58,.08)',
      textColor: COLORS.cinnabar,
    });
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 22, y + 44);
  ctx.lineTo(x + w - 22, y + 44);
  ctx.stroke();
  ctx.restore();
}

function drawMetricCard(ctx, x, y, w, h, label, value) {
  drawPanel(ctx, x, y, w, h, {
    label,
    radius: 22,
    fillTop: 'rgba(255,255,255,.56)',
    fillBottom: 'rgba(255,255,255,.42)',
  });

  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 30px ${FONT.serif}`;
  ctx.fillText(value, x + w / 2, y + 72);
  ctx.fillStyle = COLORS.inkSoft;
  ctx.font = `400 14px ${FONT.sans}`;
  ctx.fillText('随喜精进', x + w / 2, y + 96);
  ctx.restore();
}

/** 生成 QR 码 Canvas */
async function generateQR(url, size = 96) {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, url, {
    width: size,
    margin: 0,
    color: { dark: COLORS.ink, light: COLORS.white },
    errorCorrectionLevel: 'M',
  });
  return canvas;
}

async function drawFooter(ctx, theme, url, options = {}) {
  const x = 54;
  const y = 620;
  const w = W - x * 2;
  const h = 128;
  const footerTitle = options.title || theme.footerTitle || '扫码查看';
  const footerNote = options.note || theme.footerNote || '长按识别二维码';

  drawPanel(ctx, x, y, w, h, {
    radius: 30,
    fillTop: 'rgba(255,255,255,.66)',
    fillBottom: 'rgba(255,255,255,.48)',
  });
  drawWash(ctx, x + w - 82, y + 40, 112, 46, COLORS.cinnabarMist, -0.16);

  drawRoundRect(ctx, x + 18, y + 16, 94, 94, 22, 'rgba(255,255,255,.82)', 'rgba(92,76,58,.10)');
  try {
    const qrCanvas = await generateQR(url, 94);
    ctx.drawImage(qrCanvas, x + 18, y + 16, 94, 94);
  } catch {
    ctx.save();
    ctx.fillStyle = COLORS.inkSoft;
    ctx.textAlign = 'center';
    ctx.font = `500 14px ${FONT.sans}`;
    ctx.fillText('foyue', x + 65, y + 60);
    ctx.restore();
  }

  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 22px ${FONT.serif}`;
  ctx.fillText(footerTitle, x + 132, y + 46);
  drawTextBlock(ctx, {
    text: footerNote,
    x: x + 132,
    y: y + 78,
    maxWidth: 260,
    lineHeight: 22,
    maxLines: 2,
    font: `400 15px ${FONT.sans}`,
    color: COLORS.inkSoft,
    align: 'left',
  });
  ctx.fillStyle = COLORS.inkMuted;
  ctx.font = `400 13px ${FONT.sans}`;
  ctx.fillText('foyue.org', x + 132, y + 108);
  ctx.restore();

  drawSeal(ctx, x + w - 34, y + 28, theme.seal || '佛', 24);
}

/** 朱砂印章 */
function drawSeal(ctx, x, y, text = '佛', size = 36) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.08);
  ctx.fillStyle = COLORS.cinnabar;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.font = `600 ${Math.max(14, size * 0.46)}px ${FONT.sans}`;
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 1);
  ctx.restore();
}

function getTheme(type) {
  return TYPE_THEME[type] || TYPE_THEME.track;
}

function getTrackIntro(config) {
  if (config.type === 'series') {
    return pickText(
      config.summary,
      config.quote,
      '围绕同一修学主题整理法音内容，适合循序渐进地连续聆听。',
    );
  }

  return pickText(
    config.summary,
    config.quote,
    config.subtitle ? `本期内容围绕“${normalizeText(config.subtitle)}”展开，适合静心片刻时聆听。` : '',
    '一段适合当下安住身心的净土法音。',
  );
}

function getPracticeSummary(config) {
  return pickText(
    config.summary,
    `今日已记录 ${formatNumber(config.count)}，愿以此善行长养正念，渐次归向净土。`,
  );
}

// ============================================================
// 海报模板
// ============================================================

async function drawTrackPoster(ctx, config) {
  const theme = getTheme(config.type === 'series' ? 'series' : 'track');
  const title = pickText(config.title, '净土法音');
  const subtitle = normalizeText(config.subtitle);
  const intro = getTrackIntro(config);

  drawHeader(ctx, theme);
  drawFittedTitle(ctx, {
    text: title,
    x: W / 2,
    y: 146,
    maxWidth: 420,
    maxLines: 2,
  });

  if (subtitle) {
    drawTextBlock(ctx, {
      text: subtitle,
      x: W / 2,
      y: 228,
      maxWidth: 420,
      lineHeight: 28,
      maxLines: 2,
      font: `400 18px ${FONT.sans}`,
      color: COLORS.inkSoft,
      align: 'center',
    });
  }

  drawPanel(ctx, 56, 268, 488, 206, { label: '内容介绍' });
  ctx.save();
  ctx.fillStyle = COLORS.cinnabar;
  ctx.fillRect(82, 332, 4, 94);
  ctx.restore();
  drawTextBlock(ctx, {
    text: intro,
    x: 102,
    y: 332,
    maxWidth: 404,
    lineHeight: 34,
    maxLines: 5,
    font: `400 22px ${FONT.serif}`,
    color: COLORS.ink,
    align: 'left',
  });

  drawPanel(ctx, 56, 494, 488, 92, {
    label: config.type === 'series' ? '系列信息' : '本期题目',
    radius: 24,
    fillTop: 'rgba(255,255,255,.55)',
    fillBottom: 'rgba(255,255,255,.38)',
  });
  drawTextBlock(ctx, {
    text: subtitle || (config.type === 'series' ? '适合按次第连续收听。' : '单集分享，适合转发给同修共听。'),
    x: 84,
    y: 548,
    maxWidth: 420,
    lineHeight: 26,
    maxLines: 2,
    font: `400 17px ${FONT.sans}`,
    color: COLORS.inkLight,
    align: 'left',
  });

  await drawFooter(ctx, theme, config.url);
}

async function drawQuotePoster(ctx, config) {
  const theme = getTheme('quote');
  const quote = pickText(config.summary, config.quote, '愿闻佛法音，心地自然明。');

  drawHeader(ctx, theme);
  drawPanel(ctx, 54, 160, 492, 390, { label: '法语摘录', radius: 32 });

  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.inkFaint;
  ctx.font = `600 80px ${FONT.serif}`;
  ctx.fillText('“', 82, 258);
  ctx.restore();

  drawTextBlock(ctx, {
    text: quote,
    x: W / 2,
    y: 286,
    maxWidth: 370,
    lineHeight: 46,
    maxLines: 6,
    font: `500 30px ${FONT.serif}`,
    color: COLORS.ink,
    align: 'center',
  });

  if (normalizeText(config.author)) {
    drawTextBlock(ctx, {
      text: `— ${normalizeText(config.author)}`,
      x: W / 2,
      y: 496,
      maxWidth: 320,
      lineHeight: 24,
      maxLines: 1,
      font: `400 18px ${FONT.sans}`,
      color: COLORS.inkSoft,
      align: 'center',
    });
  }

  await drawFooter(ctx, theme, config.url);
}

async function drawPracticePoster(ctx, config) {
  const theme = getTheme('practice');
  const practice = pickText(config.practice, config.title, '念佛');
  const count = formatNumber(config.count);
  const totalCount = formatNumber(config.totalCount);

  drawHeader(ctx, theme);
  drawTextBlock(ctx, {
    text: `今日${practice}`,
    x: W / 2,
    y: 160,
    maxWidth: 360,
    lineHeight: 24,
    maxLines: 1,
    font: `500 20px ${FONT.sans}`,
    color: COLORS.inkSoft,
    align: 'center',
  });

  ctx.save();
  ctx.strokeStyle = 'rgba(188,76,49,.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, 306, 132, 0.1 * Math.PI, 1.94 * Math.PI);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.inkMuted;
  ctx.font = `500 16px ${FONT.sans}`;
  ctx.fillText('今日记数', W / 2, 238);
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 78px ${FONT.serif}`;
  ctx.fillText(count, W / 2, 332);
  ctx.fillStyle = COLORS.inkSoft;
  ctx.font = `400 18px ${FONT.sans}`;
  ctx.fillText('愿声声佛号，渐归一心', W / 2, 370);
  ctx.restore();

  drawMetricCard(ctx, 56, 420, 228, 118, '修持项目', practice);
  drawMetricCard(ctx, 316, 420, 228, 118, '累计修持', totalCount);

  drawPanel(ctx, 56, 556, 488, 42, {
    radius: 22,
    fillTop: 'rgba(255,255,255,.52)',
    fillBottom: 'rgba(255,255,255,.38)',
  });
  drawTextBlock(ctx, {
    text: getPracticeSummary(config),
    x: 82,
    y: 583,
    maxWidth: 436,
    lineHeight: 22,
    maxLines: 1,
    font: `400 15px ${FONT.sans}`,
    color: COLORS.inkLight,
    align: 'left',
  });

  await drawFooter(ctx, theme, config.url);
}

async function drawWenkuPoster(ctx, config) {
  const theme = getTheme('wenku');
  const title = pickText(config.title, '净土文库');
  const subtitle = normalizeText(config.subtitle);
  const excerpt = pickText(config.summary, config.quote, '开经释义，断疑生信。');

  drawHeader(ctx, theme);
  drawFittedTitle(ctx, {
    text: `《${title}》`,
    x: 66,
    y: 142,
    maxWidth: 392,
    maxLines: 2,
    align: 'left',
    sizes: [34, 32, 30, 28],
  });

  if (subtitle) {
    drawTextBlock(ctx, {
      text: subtitle,
      x: 66,
      y: 222,
      maxWidth: 392,
      lineHeight: 26,
      maxLines: 2,
      font: `400 17px ${FONT.sans}`,
      color: COLORS.inkSoft,
      align: 'left',
    });
  }

  ctx.save();
  ctx.strokeStyle = COLORS.cinnabar;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(514, 132);
  ctx.lineTo(514, 246);
  ctx.stroke();
  ctx.restore();

  drawPanel(ctx, 54, 268, 492, 312, { label: '摘录' });
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.inkFaint;
  ctx.font = `600 78px ${FONT.serif}`;
  ctx.fillText('“', 82, 348);
  ctx.restore();

  drawTextBlock(ctx, {
    text: excerpt,
    x: 98,
    y: 348,
    maxWidth: 398,
    lineHeight: 38,
    maxLines: 6,
    font: `400 24px ${FONT.serif}`,
    color: COLORS.ink,
    align: 'left',
  });

  drawTextBlock(ctx, {
    text: '愿以文字般若，导归净土。',
    x: 98,
    y: 540,
    maxWidth: 280,
    lineHeight: 22,
    maxLines: 1,
    font: `400 14px ${FONT.sans}`,
    color: COLORS.inkSoft,
    align: 'left',
  });

  await drawFooter(ctx, theme, config.url);
}

async function drawAIPoster(ctx, config) {
  const theme = getTheme('ai');
  const question = pickText(config.title, '如何安心念佛？');
  const answer = pickText(
    config.summary,
    config.quote,
    '围绕所问问题做简明梳理，帮助先把握关键脉络。',
  );

  drawHeader(ctx, theme);
  drawPanel(ctx, 58, 148, 484, 152, {
    label: '问题',
    radius: 28,
    fillTop: 'rgba(255,255,255,.60)',
    fillBottom: 'rgba(255,255,255,.46)',
  });
  drawTextBlock(ctx, {
    text: question,
    x: 84,
    y: 214,
    maxWidth: 432,
    lineHeight: 32,
    maxLines: 3,
    font: `600 22px ${FONT.sans}`,
    color: COLORS.ink,
    align: 'left',
  });

  drawPanel(ctx, 58, 320, 484, 254, {
    label: '答复摘要',
    radius: 28,
    fillTop: 'rgba(255,255,255,.58)',
    fillBottom: 'rgba(255,255,255,.40)',
  });
  drawTextBlock(ctx, {
    text: answer,
    x: 84,
    y: 388,
    maxWidth: 432,
    lineHeight: 34,
    maxLines: 5,
    font: `400 21px ${FONT.serif}`,
    color: COLORS.ink,
    align: 'left',
  });
  drawTextBlock(ctx, {
    text: 'AI 生成内容仅供参考，请以经典与善知识开示为准。',
    x: 84,
    y: 550,
    maxWidth: 408,
    lineHeight: 20,
    maxLines: 2,
    font: `400 13px ${FONT.sans}`,
    color: COLORS.inkSoft,
    align: 'left',
  });

  await drawFooter(ctx, theme, config.url, {
    note: '进入净土法音 AI 页面，继续提问与查看完整答复。',
  });
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 生成海报 Blob
 * @param {Object} config
 * @param {'track'|'series'|'quote'|'practice'|'wenku'|'ai'} config.type
 * @param {string} [config.summary] - 可选摘要，不传则自动回退到现有字段
 * @returns {Promise<Blob>}
 */
export async function generatePoster(config) {
  await ensureFonts();

  const canvas = document.createElement('canvas');
  canvas.width = W * POSTER_DPR;
  canvas.height = H * POSTER_DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(POSTER_DPR, POSTER_DPR);

  const posterType = config.type === 'series' ? 'series' : config.type;
  drawPaperBackground(ctx, getTheme(posterType));

  switch (config.type) {
    case 'quote':
      await drawQuotePoster(ctx, config);
      break;
    case 'practice':
      await drawPracticePoster(ctx, config);
      break;
    case 'wenku':
      await drawWenkuPoster(ctx, config);
      break;
    case 'ai':
      await drawAIPoster(ctx, config);
      break;
    case 'track':
    case 'series':
    default:
      await drawTrackPoster(ctx, config);
      break;
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.72);
  });
}
