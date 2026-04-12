/* audio-download.js — 音频下载模块（P0：展开播放器下载按钮） */
'use strict';

import { AUDIO_CACHE } from './audio-cache.js';
import { isAppleMobile } from './utils.js';
import { isInAppBrowser } from './pwa.js';

/**
 * 下载状态枚举
 */
export const DL_STATE = {
    IDLE: 'idle',
    DOWNLOADING: 'downloading',
    DONE: 'done',
    ERROR: 'error',
};

/**
 * 从音频 URL 提取合理的文件名
 */
function buildFilename(track) {
    // 优先用标题
    const name = track.title || track.fileName || 'audio';
    // 从 URL 推断扩展名
    const urlPath = new URL(track.url).pathname;
    const ext = urlPath.match(/\.(m4a|mp3|ogg|webm)$/i)?.[1] || 'm4a';
    // 清理标题中不适合文件名的字符
    const safe = name.replace(/[\\/:*?"<>|]/g, '_').trim();
    return `${safe}.${ext}`;
}

/**
 * 通过 blob 方式下载（iOS、PWA 内、Cache 命中时）
 */
function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // 延迟释放，给浏览器时间启动下载
    setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
    }, 1000);
}

/**
 * 检查 Cache API 中是否有该音频的缓存
 * @returns {Promise<Blob|null>}
 */
async function getCachedBlob(url) {
    try {
        const cache = await caches.open(AUDIO_CACHE);
        const resp = await cache.match(url);
        if (!resp) return null;
        return await resp.blob();
    } catch {
        return null;
    }
}

/**
 * 主下载函数
 * @param {Object} track - { url, title, fileName }
 * @param {function} onState - 状态回调 (state: DL_STATE) => void
 */
export async function downloadAudio(track, onState) {
    if (!track?.url) return;

    const filename = buildFilename(track);

    // 微信等 App 内浏览器无法触发下载
    if (isInAppBrowser()) {
        onState(DL_STATE.ERROR);
        // 提示用户在浏览器中打开
        showInAppHint();
        return;
    }

    onState(DL_STATE.DOWNLOADING);

    try {
        // 1. 先检查 Cache API 是否有缓存 → 直接 blob 下载
        const cachedBlob = await getCachedBlob(track.url);
        if (cachedBlob) {
            triggerBlobDownload(cachedBlob, filename);
            onState(DL_STATE.DONE);
            return;
        }

        // 2. iOS / iPadOS：必须走 fetch → blob（<a download> 跨域无效）
        if (isAppleMobile()) {
            const resp = await fetch(track.url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            triggerBlobDownload(blob, filename);
            onState(DL_STATE.DONE);
            return;
        }

        // 3. 桌面 / Android：?dl=1 原生下载（浏览器自行管理）
        const dlUrl = new URL(track.url);
        dlUrl.searchParams.set('dl', '1');
        window.open(dlUrl.href, '_blank');
        onState(DL_STATE.DONE);
    } catch (e) {
        console.warn('[audio-download] 下载失败', e);
        onState(DL_STATE.ERROR);
    }
}

/**
 * 微信内浏览器提示（简单 toast 提示）
 */
function showInAppHint() {
    // 复用项目中已有的 toast 机制（如果有），否则简单 alert
    const event = new CustomEvent('toast', {
        detail: { message: '请在浏览器中打开后下载', duration: 3000 },
    });
    window.dispatchEvent(event);
}
