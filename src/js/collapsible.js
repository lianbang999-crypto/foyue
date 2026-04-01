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
