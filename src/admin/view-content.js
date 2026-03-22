/* ===== Content Management View ===== */

import { api } from './api.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

let viewState = { level: 'categories', categoryId: null, categoryTitle: '', seriesId: null, seriesTitle: '' };

export function renderContent(container) {
  viewState = { level: 'categories', categoryId: null, categoryTitle: '', seriesId: null, seriesTitle: '' };
  renderCategories(container);
}

/* ==================== Categories ==================== */

async function renderCategories(container) {
  viewState.level = 'categories';
  container.innerHTML = '<div class="adm-loading">加载中...</div>';
  const data = await api.get('/categories');
  if (!data) return;
  const cats = data.categories || [];
  container.innerHTML = '';

  const title = document.createElement('h2');
  title.className = 'adm-page-title';
  title.textContent = '内容管理';
  container.appendChild(title);

  const section = document.createElement('div');
  section.className = 'adm-section';
  section.innerHTML = `<div class="adm-section-title">分类列表</div>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>ID</th><th>标题</th><th>英文标题</th><th>排序</th><th>系列数</th><th class="actions">操作</th></tr></thead>
      <tbody>${cats.map(c =>
        `<tr data-cid="${esc(c.id)}">
          <td>${esc(c.id)}</td><td>${esc(c.title)}</td><td>${esc(c.title_en)}</td>
          <td>${c.sort_order}</td><td>${c.series_count || 0}</td>
          <td class="actions"><button class="adm-btn adm-btn-sm" data-edit="${esc(c.id)}">编辑</button></td>
        </tr>`
      ).join('') || '<tr><td colspan="6" style="text-align:center">暂无分类</td></tr>'}</tbody>
    </table></div>`;
  container.appendChild(section);

  section.querySelectorAll('tr[data-cid]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const id = tr.dataset.cid;
      const cat = cats.find(c => c.id === id);
      viewState.categoryId = id;
      viewState.categoryTitle = cat ? cat.title : id;
      renderSeries(container);
    });
  });

  section.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cat = cats.find(c => c.id === btn.dataset.edit);
      if (cat) showCategoryEditModal(cat, container);
    });
  });
}

function showCategoryEditModal(cat, container) {
  const overlay = document.createElement('div');
  overlay.className = 'adm-modal-overlay';
  overlay.innerHTML = `<div class="adm-modal">
    <div class="adm-modal-header"><h3>编辑分类</h3><button class="adm-modal-close">&times;</button></div>
    <div class="adm-modal-body">
      <div class="adm-form-group"><label class="adm-form-label">标题</label><input class="adm-input" id="catTitle" value="${esc(cat.title)}"></div>
      <div class="adm-form-group"><label class="adm-form-label">英文标题</label><input class="adm-input" id="catTitleEn" value="${esc(cat.title_en)}"></div>
      <div class="adm-form-group"><label class="adm-form-label">排序</label><input class="adm-input" id="catSort" type="number" value="${cat.sort_order || 0}"></div>
    </div>
    <div class="adm-modal-footer">
      <button class="adm-btn" id="catCancel">取消</button>
      <button class="adm-btn adm-btn-primary" id="catSave">保存</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.adm-modal-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#catCancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#catSave').addEventListener('click', async () => {
    await api.put('/categories/' + cat.id, {
      title: overlay.querySelector('#catTitle').value.trim(),
      title_en: overlay.querySelector('#catTitleEn').value.trim(),
      sort_order: parseInt(overlay.querySelector('#catSort').value) || 0,
    });
    overlay.remove();
    renderCategories(container);
  });
}

/* ==================== Series ==================== */

async function renderSeries(container) {
  viewState.level = 'series';
  container.innerHTML = '<div class="adm-loading">加载中...</div>';
  const data = await api.get('/series?category=' + encodeURIComponent(viewState.categoryId));
  if (!data) return;
  const series = data.series || [];
  container.innerHTML = '';

  const bc = document.createElement('div');
  bc.className = 'adm-breadcrumb';
  bc.innerHTML = `<a data-nav="cats">内容管理</a> <span>/</span> <span>${esc(viewState.categoryTitle)}</span>`;
  bc.querySelector('[data-nav="cats"]').addEventListener('click', () => renderCategories(container));
  container.appendChild(bc);

  const toolbar = document.createElement('div');
  toolbar.className = 'adm-toolbar';
  toolbar.innerHTML = `<h2 class="adm-page-title" style="margin:0">系列列表 (${series.length})</h2>
    <button class="adm-btn adm-btn-primary" id="addSeriesBtn">添加系列</button>`;
  container.appendChild(toolbar);
  toolbar.querySelector('#addSeriesBtn').addEventListener('click', () => showSeriesModal(null, container));

  const section = document.createElement('div');
  section.className = 'adm-section';
  section.innerHTML = `<div class="adm-table-wrap"><table class="adm-table">
    <thead><tr><th>ID</th><th>标题</th><th>讲者</th><th>集数</th><th>播放</th><th>排序</th><th class="actions">操作</th></tr></thead>
    <tbody>${series.map(s =>
      `<tr data-sid="${esc(s.id)}">
        <td style="font-size:.72rem;color:var(--text-muted)">${esc(s.id)}</td>
        <td>${esc(s.title)}</td><td>${esc(s.speaker)}</td>
        <td>${s.episode_count || s.total_episodes || 0}</td><td>${s.play_count || 0}</td><td>${s.sort_order || 0}</td>
        <td class="actions">
          <button class="adm-btn adm-btn-sm" data-edit="${esc(s.id)}">编辑</button>
          <button class="adm-btn adm-btn-sm adm-btn-red" data-del="${esc(s.id)}">删除</button>
        </td>
      </tr>`
    ).join('') || '<tr><td colspan="7" style="text-align:center">暂无系列</td></tr>'}</tbody>
  </table></div>`;
  container.appendChild(section);

  section.querySelectorAll('tr[data-sid]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const s = series.find(x => x.id === tr.dataset.sid);
      viewState.seriesId = tr.dataset.sid;
      viewState.seriesTitle = s ? s.title : tr.dataset.sid;
      renderEpisodes(container);
    });
  });
  section.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const s = series.find(x => x.id === btn.dataset.edit);
      if (s) showSeriesModal(s, container);
    });
  });
  section.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('确定删除该系列及所有集数？')) return;
      await api.del('/series/' + btn.dataset.del);
      renderSeries(container);
    });
  });
}

function showSeriesModal(existing, container) {
  const isNew = !existing;
  const s = existing || { id:'', title:'', title_en:'', speaker:'', speaker_en:'', bucket:'', folder:'', total_episodes:0, intro:'', sort_order:0 };
  const overlay = document.createElement('div');
  overlay.className = 'adm-modal-overlay';
  overlay.innerHTML = `<div class="adm-modal">
    <div class="adm-modal-header"><h3>${isNew ? '添加系列' : '编辑系列'}</h3><button class="adm-modal-close">&times;</button></div>
    <div class="adm-modal-body">
      ${isNew ? '<div class="adm-form-group"><label class="adm-form-label">ID (slug)</label><input class="adm-input" id="sId" placeholder="e.g. jingtu-ziliangxin"></div>' : ''}
      <div class="adm-form-row">
        <div class="adm-form-group"><label class="adm-form-label">标题</label><input class="adm-input" id="sTitle" value="${esc(s.title)}"></div>
        <div class="adm-form-group"><label class="adm-form-label">英文标题</label><input class="adm-input" id="sTitleEn" value="${esc(s.title_en)}"></div>
      </div>
      <div class="adm-form-row">
        <div class="adm-form-group"><label class="adm-form-label">讲者</label><input class="adm-input" id="sSpeaker" value="${esc(s.speaker)}"></div>
        <div class="adm-form-group"><label class="adm-form-label">讲者(英文)</label><input class="adm-input" id="sSpeakerEn" value="${esc(s.speaker_en)}"></div>
      </div>
      <div class="adm-form-row">
        <div class="adm-form-group"><label class="adm-form-label">Bucket</label><input class="adm-input" id="sBucket" value="${esc(s.bucket)}"></div>
        <div class="adm-form-group"><label class="adm-form-label">Folder</label><input class="adm-input" id="sFolder" value="${esc(s.folder || '')}"></div>
      </div>
      <div class="adm-form-row">
        <div class="adm-form-group"><label class="adm-form-label">总集数</label><input class="adm-input" id="sTotal" type="number" value="${s.total_episodes || 0}" disabled></div>
        <div class="adm-form-group"><label class="adm-form-label">排序</label><input class="adm-input" id="sSort" type="number" value="${s.sort_order || 0}"></div>
      </div>
      <p class="adm-form-hint" style="color:#888;font-size:12px">总集数由系统按实际集数自动统计，无需手动维护</p>
      <div class="adm-form-group"><label class="adm-form-label">简介</label><textarea class="adm-input adm-textarea" id="sIntro">${esc(s.intro || '')}</textarea></div>
    </div>
    <div class="adm-modal-footer">
      <button class="adm-btn" id="sCancel">取消</button>
      <button class="adm-btn adm-btn-primary" id="sSave">保存</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.adm-modal-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#sCancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#sSave').addEventListener('click', async () => {
    const body = {
      category_id: viewState.categoryId,
      title: overlay.querySelector('#sTitle').value.trim(),
      title_en: overlay.querySelector('#sTitleEn').value.trim(),
      speaker: overlay.querySelector('#sSpeaker').value.trim(),
      speaker_en: overlay.querySelector('#sSpeakerEn').value.trim(),
      bucket: overlay.querySelector('#sBucket').value.trim(),
      folder: overlay.querySelector('#sFolder').value.trim(),
      sort_order: parseInt(overlay.querySelector('#sSort').value) || 0,
      intro: overlay.querySelector('#sIntro').value.trim(),
    };
    if (isNew) {
      body.id = overlay.querySelector('#sId').value.trim();
      if (!body.id) { alert('ID 不能为空'); return; }
      await api.post('/series', body);
    } else {
      await api.put('/series/' + s.id, body);
    }
    overlay.remove();
    renderSeries(container);
  });
}

/* ==================== Episodes ==================== */

async function renderEpisodes(container) {
  viewState.level = 'episodes';
  container.innerHTML = '<div class="adm-loading">加载中...</div>';
  const data = await api.get('/episodes/' + encodeURIComponent(viewState.seriesId));
  if (!data) return;
  const episodes = data.episodes || [];
  container.innerHTML = '';

  const bc = document.createElement('div');
  bc.className = 'adm-breadcrumb';
  bc.innerHTML = `<a data-nav="cats">内容管理</a> <span>/</span> <a data-nav="series">${esc(viewState.categoryTitle)}</a> <span>/</span> <span>${esc(viewState.seriesTitle)}</span>`;
  bc.querySelector('[data-nav="cats"]').addEventListener('click', () => renderCategories(container));
  bc.querySelector('[data-nav="series"]').addEventListener('click', () => renderSeries(container));
  container.appendChild(bc);

  const toolbar = document.createElement('div');
  toolbar.className = 'adm-toolbar';
  toolbar.innerHTML = `<h2 class="adm-page-title" style="margin:0">集数列表 (${episodes.length})</h2>
    <button class="adm-btn adm-btn-primary" id="addEpBtn">添加集数</button>`;
  container.appendChild(toolbar);
  toolbar.querySelector('#addEpBtn').addEventListener('click', () => showEpisodeModal(null, container));

  const section = document.createElement('div');
  section.className = 'adm-section';
  section.innerHTML = `<div class="adm-table-wrap"><table class="adm-table">
    <thead><tr><th>集号</th><th>标题</th><th>文件名</th><th>播放</th><th class="actions">操作</th></tr></thead>
    <tbody>${episodes.map(e =>
      `<tr class="no-click" data-eid="${e.id}">
        <td>${e.episode_num}</td><td>${esc(e.title)}</td>
        <td style="font-size:.72rem;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.file_name)}</td>
        <td>${e.play_count || 0}</td>
        <td class="actions">
          <button class="adm-btn adm-btn-sm" data-edit="${e.id}">编辑</button>
          <button class="adm-btn adm-btn-sm adm-btn-red" data-del="${e.id}">删除</button>
        </td>
      </tr>`
    ).join('') || '<tr><td colspan="5" style="text-align:center">暂无集数</td></tr>'}</tbody>
  </table></div>`;
  container.appendChild(section);

  section.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ep = episodes.find(e => String(e.id) === btn.dataset.edit);
      if (ep) showEpisodeModal(ep, container);
    });
  });
  section.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('确定删除该集？')) return;
      await api.del('/episodes/' + btn.dataset.del);
      renderEpisodes(container);
    });
  });
}

function showEpisodeModal(existing, container) {
  const isNew = !existing;
  const e = existing || { episode_num:'', title:'', file_name:'', intro:'', story_number:'', duration:'' };
  const overlay = document.createElement('div');
  overlay.className = 'adm-modal-overlay';
  overlay.innerHTML = `<div class="adm-modal">
    <div class="adm-modal-header"><h3>${isNew ? '添加集数' : '编辑集数'}</h3><button class="adm-modal-close">&times;</button></div>
    <div class="adm-modal-body">
      <div class="adm-form-row">
        <div class="adm-form-group"><label class="adm-form-label">集号</label><input class="adm-input" id="eNum" type="number" value="${e.episode_num}"></div>
        <div class="adm-form-group"><label class="adm-form-label">故事编号 (可选)</label><input class="adm-input" id="eStory" type="number" value="${e.story_number || ''}"></div>
      </div>
      <div class="adm-form-group"><label class="adm-form-label">标题</label><input class="adm-input" id="eTitle" value="${esc(e.title)}"></div>
      <div class="adm-form-group"><label class="adm-form-label">文件名</label><input class="adm-input" id="eFile" value="${esc(e.file_name)}" placeholder="例: 第1讲.mp3"></div>
      <div class="adm-form-group"><label class="adm-form-label">时长(秒，可选)</label><input class="adm-input" id="eDur" type="number" value="${e.duration || ''}"></div>
      <div class="adm-form-group"><label class="adm-form-label">简介 (可选)</label><textarea class="adm-input adm-textarea" id="eIntro">${esc(e.intro || '')}</textarea></div>
      <p class="adm-form-hint" style="color:#888;font-size:12px">音频 URL 由系统从 bucket + folder + 文件名自动生成</p>
    </div>
    <div class="adm-modal-footer">
      <button class="adm-btn" id="eCancel">取消</button>
      <button class="adm-btn adm-btn-primary" id="eSave">保存</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.adm-modal-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#eCancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
  overlay.querySelector('#eSave').addEventListener('click', async () => {
    const body = {
      series_id: viewState.seriesId,
      episode_num: parseInt(overlay.querySelector('#eNum').value) || 0,
      title: overlay.querySelector('#eTitle').value.trim(),
      file_name: overlay.querySelector('#eFile').value.trim(),
      intro: overlay.querySelector('#eIntro').value.trim() || null,
      story_number: parseInt(overlay.querySelector('#eStory').value) || null,
      duration: parseInt(overlay.querySelector('#eDur').value) || 0,
    };
    if (isNew) {
      await api.post('/episodes', body);
    } else {
      await api.put('/episodes/' + e.id, body);
    }
    overlay.remove();
    renderEpisodes(container);
  });
}
