/**
 * 念佛计数 — 海报分享
 *
 * 生成一张 Canvas 海报，包含：
 *   - 圣号名称（大字，衬线）
 *   - 今日声数、累计声数、连续打卡天数
 *   - 莲池大师回向文尾句
 *   - 二维码（指向 foyue.org）
 *   - 净土法音水印
 * 然后通过 Web Share Files API 分享，或下载为图片。
 */

import QRCode from 'qrcode';
import { shareImageBlob, formatCount } from './utils.js';

const APP_URL = 'https://foyue.org';

/* ── Color palette (matches light theme accent) ── */
const COLORS = {
  bg:       '#FAF9F6',
  accent:   '#836A32',
  accentDim:'rgba(131,106,50,0.45)',
  text:     '#1A1A1A',
  textSec:  'rgba(26,26,26,0.55)',
  textMut:  'rgba(26,26,26,0.32)',
  border:   'rgba(131,106,50,0.18)',
  glow:     'rgba(131,106,50,0.06)',
};

// formatCount is imported from utils.js

/** Today's date in Chinese format: 2026年3月19日 */
function todayCN() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * Draw a rounded rectangle path.
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Generate the share poster as a Blob.
 *
 * @param {{ practice:string, daily:number, total:number, streak:number }} stats
 * @returns {Promise<Blob>}
 */
export async function generateSharePoster(stats) {
  const W = 375, H = 660; // taller to accommodate full 回向文
  const canvas = document.createElement('canvas');
  // Retina-quality output
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // ── Background ──
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, W, H * 0.65);
  grad.addColorStop(0, 'rgba(212,175,55,0.10)');
  grad.addColorStop(0.5, 'rgba(131,106,50,0.04)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Radial glow top-left
  const radial = ctx.createRadialGradient(60, 40, 0, 60, 40, 200);
  radial.addColorStop(0, 'rgba(212,175,55,0.16)');
  radial.addColorStop(1, 'transparent');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, W, H);

  // ── Top bar ──
  ctx.fillStyle = COLORS.accent;
  ctx.font = '500 13px "DM Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('净土法音', 24, 36);

  ctx.fillStyle = COLORS.textMut;
  ctx.font = '400 12px "DM Sans", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(todayCN(), W - 24, 36);

  // Top accent line
  ctx.beginPath();
  ctx.moveTo(24, 48);
  ctx.lineTo(W - 24, 48);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // ── Lotus ──
  ctx.font = '36px serif';
  ctx.textAlign = 'center';
  ctx.fillText('🪷', W / 2, 96);

  // ── Practice name ──
  ctx.fillStyle = COLORS.accent;
  ctx.font = '500 26px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.fillText(stats.practice || '南无阿弥陀佛', W / 2, 142);

  // ── Stats card ──
  const cardX = 24, cardY = 162, cardW = W - 48, cardH = 118;
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.fillStyle = COLORS.glow;
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Stats divider lines
  const col1 = cardX + cardW / 3;
  const col2 = cardX + (cardW * 2) / 3;
  ctx.beginPath();
  ctx.moveTo(col1, cardY + 20);
  ctx.lineTo(col1, cardY + cardH - 20);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(col2, cardY + 20);
  ctx.lineTo(col2, cardY + cardH - 20);
  ctx.stroke();

  // Stat values
  const statItems = [
    { label: '今日', value: formatCount(stats.daily) },
    { label: '累计', value: formatCount(stats.total) },
    { label: '连续打卡', value: (stats.streak || 0) + ' 天' },
  ];
  const cellW = cardW / 3;
  statItems.forEach(({ label, value }, i) => {
    const cx = cardX + cellW * i + cellW / 2;
    const cy = cardY + cardH / 2;
    // Value
    ctx.fillStyle = COLORS.accent;
    ctx.font = '700 22px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(value, cx, cy - 4);
    // Label
    ctx.fillStyle = COLORS.textMut;
    ctx.font = '400 11px "Noto Sans SC", sans-serif';
    ctx.fillText(label, cx, cy + 20);
  });

  // ── Divider with decoration ──
  const divY = cardY + cardH + 22;
  ctx.beginPath();
  ctx.moveTo(24, divY);
  ctx.lineTo(W - 24, divY);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Diamond decoration center
  ctx.save();
  ctx.translate(W / 2, divY);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = COLORS.accentDim;
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();

  // ── 完整回向文（莲池大师）——逐行绘制 ──
  const huixiangLines = [
    '愿以此功德，庄严佛净土，',
    '上报四重恩，下济三途苦，',
    '若有见闻者，悉发菩提心，',
    '尽此一报身，同生极乐国。',
  ];
  const lineH = 28;
  const textStartY = divY + 30;
  ctx.fillStyle = COLORS.textSec;
  ctx.font = '400 14px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  huixiangLines.forEach((line, i) => {
    ctx.fillText(line, W / 2, textStartY + i * lineH);
  });

  const attrY = textStartY + huixiangLines.length * lineH + 10;
  ctx.fillStyle = COLORS.textMut;
  ctx.font = '400 11px "Noto Serif SC", serif';
  ctx.fillText('— 莲池大师 回向文', W / 2, attrY);

  // Second thin divider before footer
  const div2Y = attrY + 18;
  ctx.beginPath();
  ctx.moveTo(24, div2Y);
  ctx.lineTo(W - 24, div2Y);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // ── QR code (positioned below the second divider) ──
  const qrTopY = div2Y + 14;
  let qrImageUrl = null;
  try {
    qrImageUrl = await QRCode.toDataURL(APP_URL, {
      width: 80,
      margin: 1,
      color: {
        dark: '#836A32',
        light: '#FAF9F600', // transparent background
      },
    });
  } catch (e) {
    console.warn('[Share] QR generation failed:', e);
  }

  if (qrImageUrl) {
    const qrImg = new Image();
    await new Promise((resolve, reject) => {
      qrImg.onload  = resolve;
      qrImg.onerror = reject;
      qrImg.src = qrImageUrl;
    });
    const qrSize = 64;
    const qrX = W - 24 - qrSize;
    ctx.drawImage(qrImg, qrX, qrTopY, qrSize, qrSize);
  }

  // ── Bottom: URL + Namo ──
  const bottomY = H - 22;
  ctx.fillStyle = COLORS.accent;
  ctx.font = '500 12px "DM Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('foyue.org', 24, bottomY);

  ctx.fillStyle = COLORS.textMut;
  ctx.font = '400 12px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.fillText('南无阿弥陀佛', W / 2, bottomY);

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

/**
 * Show the share poster modal — preview before sharing.
 * Inserts a modal overlay with the generated poster image.
 */
export async function showSharePoster(counterView, stats) {
  // Remove existing modal
  document.querySelectorAll('.counter-share-modal').forEach(el => el.remove());

  const modal = document.createElement('div');
  modal.className = 'counter-share-modal';
  modal.innerHTML = `
    <div class="csm-backdrop" id="csmBackdrop"></div>
    <div class="csm-panel">
      <div class="csm-header">
        <span class="csm-title">分享海报</span>
        <button class="btn-icon csm-close" id="csmClose">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="csm-preview" id="csmPreview">
        <div class="csm-generating">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="12" cy="12" r="9" stroke-dasharray="28 56"/>
          </svg>
          生成中…
        </div>
      </div>
      <div class="csm-actions" id="csmActions" style="display:none">
        <button class="csm-btn csm-btn--primary" id="csmShare">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          分享海报
        </button>
        <button class="csm-btn csm-btn--secondary" id="csmDownload">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          保存图片
        </button>
      </div>
    </div>`;

  (counterView || document.getElementById('app')).appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('counter-share-modal--in'));

  const close = () => {
    modal.classList.remove('counter-share-modal--in');
    setTimeout(() => modal.remove(), 300);
  };

  modal.querySelector('#csmBackdrop').addEventListener('click', close);
  modal.querySelector('#csmClose').addEventListener('click', close);

  // Generate poster
  let blob = null;
  try {
    blob = await generateSharePoster(stats);
    const imgUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.src = imgUrl;
    img.style.cssText = 'width:100%;border-radius:12px;display:block;box-shadow:0 4px 20px rgba(0,0,0,0.12)';
    modal.querySelector('#csmPreview').innerHTML = '';
    modal.querySelector('#csmPreview').appendChild(img);
    modal.querySelector('#csmActions').style.display = '';
  } catch (err) {
    modal.querySelector('#csmPreview').innerHTML = `<div class="csm-error">海报生成失败，请重试</div>`;
    console.error('[Share] Poster generation failed:', err);
    return;
  }

  const filename = `foyue-${stats.practice || 'chanting'}-${new Date().toISOString().slice(0, 10)}.png`;

  modal.querySelector('#csmShare').addEventListener('click', async () => {
    if (!blob) return;
    await shareImageBlob(blob, filename, `${stats.practice || '念佛'} · 净土法音`);
  });

  modal.querySelector('#csmDownload').addEventListener('click', () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
