/* ===== 可复用折叠工具 ===== */
// 提供轻量级的折叠按钮与内容挂载，支持 ARIA、键盘、记忆状态及平滑动画
export function getRememberedState(key, fallback = null) {
    if (!key) return fallback;
    try {
        const v = localStorage.getItem('collapsible:' + key);
        if (v === null) return fallback;
        return v === '1' || v === 'true';
    } catch (e) {
        return fallback;
    }
}

export function initCollapsibleButton(btn, options = {}) {
    const { initialExpanded = false, rememberKey, onToggle } = options;
    let state = !!initialExpanded;
    if (rememberKey) {
        const mem = getRememberedState(rememberKey);
        if (mem !== null) state = !!mem;
    }
    if (!btn) return { getState: () => state, setState: () => { } };

    btn.setAttribute('aria-expanded', state ? 'true' : 'false');
    btn.classList.toggle('active', state);

    function updateUI(exp) {
        btn.setAttribute('aria-expanded', exp ? 'true' : 'false');
        btn.classList.toggle('active', exp);
    }

    function setState(exp) {
        state = !!exp;
        updateUI(state);
        if (rememberKey) {
            try { localStorage.setItem('collapsible:' + rememberKey, state ? '1' : '0'); } catch (e) { }
        }
        if (typeof onToggle === 'function') {
            try { onToggle(state); } catch (e) { console.error(e); }
        }
    }

    btn.addEventListener('click', (e) => { e.stopPropagation(); setState(!state); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setState(!state); } });

    return { getState: () => state, setState };
}

export function mountCollapsible(btn, body, options = {}) {
    const { initialExpanded = false, rememberKey, animate = true, onToggle } = options;
    if (!btn || !body) return { getState: () => false, setState: () => { } };

    let expanded = !!initialExpanded;
    if (rememberKey) {
        const mem = getRememberedState(rememberKey);
        if (mem !== null) expanded = !!mem;
    } else {
        expanded = !body.classList.contains('hidden');
    }

    if (!body.id) body.id = 'collapsible-' + Math.random().toString(36).slice(2, 9);
    btn.setAttribute('aria-controls', body.id);
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn.classList.toggle('active', expanded);

    if (expanded) body.classList.remove('hidden'); else body.classList.add('hidden');

    function animateOpen() {
        if (!animate) { body.classList.remove('hidden'); return; }
        body.style.display = 'block';
        const height = body.scrollHeight;
        body.style.overflow = 'hidden';
        body.style.maxHeight = '0px';
        body.classList.remove('hidden');
        // force reflow
        body.getBoundingClientRect();
        body.style.transition = 'max-height 220ms ease';
        body.style.maxHeight = height + 'px';
        function clean() {
            body.style.maxHeight = '';
            body.style.transition = '';
            body.style.overflow = '';
            body.removeEventListener('transitionend', clean);
        }
        body.addEventListener('transitionend', clean);
    }

    function animateClose() {
        if (!animate) { body.classList.add('hidden'); return; }
        const height = body.scrollHeight;
        body.style.overflow = 'hidden';
        body.style.maxHeight = height + 'px';
        body.getBoundingClientRect();
        body.style.transition = 'max-height 200ms ease';
        body.style.maxHeight = '0px';
        function onEnd() {
            body.classList.add('hidden');
            body.style.display = '';
            body.style.maxHeight = '';
            body.style.transition = '';
            body.style.overflow = '';
            body.removeEventListener('transitionend', onEnd);
        }
        body.addEventListener('transitionend', onEnd);
    }

    function setState(exp) {
        expanded = !!exp;
        btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        btn.classList.toggle('active', expanded);
        if (rememberKey) {
            try { localStorage.setItem('collapsible:' + rememberKey, expanded ? '1' : '0'); } catch (e) { }
        }
        if (expanded) animateOpen(); else animateClose();
        if (typeof onToggle === 'function') {
            try { onToggle(expanded); } catch (e) { console.error(e); }
        }
    }

    btn.addEventListener('click', (e) => { e.stopPropagation(); setState(!expanded); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setState(!expanded); } });

    return { getState: () => expanded, setState };
}

/**
 * 统一列表折叠工具 — 适用于专辑列表 / 集数列表
 *
 * 在已渲染了前 N 项的 listEl 之后操作 overflowEl 容器：
 * 展开时在 overflowEl 中懒渲染剩余项并以高度动画展示，
 * 收起时动画缩回（keepOverflowInDom=true 时保留节点供外部查询）。
 *
 * @param {HTMLElement}      listEl        已含可见项的列表容器
 * @param {HTMLElement}      overflowEl    溢出容器（由调用方创建并插入 DOM）
 * @param {HTMLElement}      toggleBtn     展开/收起按钮
 * @param {HTMLElement|null} toggleMeta    状态文字元素（可选）
 * @param {object}           options
 *   initialExpanded   {boolean}  初始是否展开
 *   rememberKey       {string}   localStorage key（前缀 'collapsible:'）
 *   extraItems        {Array}    待渲染的额外项目数组
 *   renderItem        {(item, index) => HTMLElement}  渲染单个额外项
 *   labelFn           {(expanded) => string}  按钮文字生成函数
 *   metaFn            {(expanded) => string}  状态文字生成函数
 *   onStateChange     {(expanded) => void}    状态变更回调
 *   keepOverflowInDom {boolean}  收起后是否保留 overflow 子节点（默认 false）
 * @returns {{ getState: () => boolean, setState: (exp: boolean) => void }}
 */
export function mountListCollapsible(listEl, overflowEl, toggleBtn, toggleMeta, options = {}) {
    const {
        initialExpanded = false,
        rememberKey,
        extraItems = [],
        renderItem,
        labelFn,
        metaFn,
        onStateChange,
        keepOverflowInDom = false,
    } = options;

    let expanded = !!initialExpanded;
    if (rememberKey) {
        const mem = getRememberedState(rememberKey);
        if (mem !== null) expanded = !!mem;
    }

    // 初始化展示状态
    if (expanded) {
        // 初始展开：立即渲染所有额外项
        if (extraItems.length > 0 && typeof renderItem === 'function') {
            const frag = document.createDocumentFragment();
            extraItems.forEach((item, i) => frag.appendChild(renderItem(item, i)));
            overflowEl.appendChild(frag);
        }
        listEl.classList.remove('is-collapsed');
    } else {
        // 初始收起：溢出容器高度为 0
        overflowEl.style.overflow = 'hidden';
        overflowEl.style.maxHeight = '0px';
        if (extraItems.length > 0) listEl.classList.add('is-collapsed');
    }

    function updateUI(exp) {
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', exp ? 'true' : 'false');
            toggleBtn.classList.toggle('active', exp);
            if (typeof labelFn === 'function') toggleBtn.textContent = labelFn(exp);
        }
        if (toggleMeta && typeof metaFn === 'function') {
            toggleMeta.textContent = metaFn(exp);
        }
    }

    updateUI(expanded);

    function expandList() {
        // 懒渲染：首次展开才生成 overflow DOM
        if (overflowEl.children.length === 0 && extraItems.length > 0 && typeof renderItem === 'function') {
            const frag = document.createDocumentFragment();
            extraItems.forEach((item, i) => frag.appendChild(renderItem(item, i)));
            overflowEl.appendChild(frag);
        }
        listEl.classList.remove('is-collapsed');
        const h = overflowEl.scrollHeight;
        overflowEl.style.overflow = 'hidden';
        overflowEl.style.maxHeight = '0px';
        overflowEl.getBoundingClientRect(); // 强制重排
        overflowEl.style.transition = 'max-height 280ms cubic-bezier(.22,1,.36,1)';
        overflowEl.style.maxHeight = h + 'px';
        const clean = () => {
            overflowEl.style.maxHeight = '';
            overflowEl.style.transition = '';
            overflowEl.style.overflow = '';
            overflowEl.removeEventListener('transitionend', clean);
        };
        overflowEl.addEventListener('transitionend', clean);
    }

    function collapseList() {
        const h = overflowEl.scrollHeight;
        overflowEl.style.overflow = 'hidden';
        overflowEl.style.maxHeight = h + 'px';
        overflowEl.getBoundingClientRect(); // 强制重排
        overflowEl.style.transition = 'max-height 220ms ease';
        overflowEl.style.maxHeight = '0px';
        const onEnd = () => {
            if (!keepOverflowInDom) {
                while (overflowEl.firstChild) overflowEl.removeChild(overflowEl.firstChild);
            }
            listEl.classList.add('is-collapsed');
            overflowEl.removeEventListener('transitionend', onEnd);
        };
        overflowEl.addEventListener('transitionend', onEnd);
    }

    function setState(exp) {
        if (expanded === !!exp) return;
        expanded = !!exp;
        updateUI(expanded);
        if (rememberKey) {
            try { localStorage.setItem('collapsible:' + rememberKey, expanded ? '1' : '0'); } catch { }
        }
        if (expanded) expandList(); else collapseList();
        if (typeof onStateChange === 'function') {
            try { onStateChange(expanded); } catch (e) { console.error(e); }
        }
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); setState(!expanded); });
        toggleBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setState(!expanded); }
        });
    }

    return { getState: () => expanded, setState };
}
