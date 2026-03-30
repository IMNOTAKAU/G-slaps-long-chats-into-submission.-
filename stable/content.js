(function () {
  'use strict';

  const CONFIG = {
    KEEP_VISIBLE: 30,
    COLLAPSE_BATCH: 100,
    RESTORE_MARGIN: 1500,
    RECOLLAPSE_MARGIN: 3000,
    DEBUG: false
  };

  let scrollContainer = null;
  let messageContainer = null;
  let isEnabled = true;
  let collapsed = new Map();
  let scrollRestored = new Set();
  let allMessages = [];
  let statusBadge = null;
  let messageObserver = null;
  let messageDebounce = null;
  let lastMessageCount = 0;
  let collapseInProgress = false;
  let selfMutating = false;
  let restoreObserver = null;
  let recollapseObserver = null;

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get(['keepVisible', 'enabled'], (data) => {
      if (data.keepVisible) CONFIG.KEEP_VISIBLE = data.keepVisible;
      if (data.enabled !== undefined) isEnabled = data.enabled;
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.keepVisible) {
        CONFIG.KEEP_VISIBLE = changes.keepVisible.newValue;
        restoreAll();
        setTimeout(run, 100);
      }
      if (changes.enabled !== undefined) {
        isEnabled = changes.enabled.newValue;
        if (!isEnabled) {
          restoreAll();
          updateBadge(0, 0);
        } else {
          run();
        }
      }
    });
  }

  function log(...args) {
    if (CONFIG.DEBUG) console.log('[G Slaps]', ...args);
  }

  // ── Site-specific container finders ──

  const SITES = {
    'claude.ai': {
      findMC: () => document.querySelector('.flex-1.flex.flex-col.px-4.max-w-3xl'),
      scrollUp: 3
    },
    'chatgpt.com': {
      findMC: () => {
        const msg = document.querySelector('[data-message-id]');
        if (!msg) return null;
        let el = msg;
        for (let i = 0; i < 5; i++) { el = el.parentElement; if (!el) return null; }
        return el;
      },
      scrollUp: null
    }
  };
  SITES['chat.openai.com'] = SITES['chatgpt.com'];

  function findContainers() {
    const site = SITES[location.hostname];
    if (!site) return false;

    const mc = site.findMC();
    if (!mc || mc.children.length < 2) return false;

    let sc = null;

    // Try fixed levels up first (Claude)
    if (site.scrollUp) {
      sc = mc;
      for (let i = 0; i < site.scrollUp; i++) {
        sc = sc.parentElement;
        if (!sc) break;
      }
      if (sc) {
        const style = window.getComputedStyle(sc);
        if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') sc = null;
      }
    }

    // Dynamic search fallback (ChatGPT, or Claude if fixed path fails)
    if (!sc) {
      let el = mc.parentElement;
      for (let i = 0; i < 10; i++) {
        if (!el) break;
        const s = window.getComputedStyle(el);
        if (s.overflowY === 'auto' || s.overflowY === 'scroll') {
          sc = el;
          break;
        }
        el = el.parentElement;
      }
    }

    if (!sc) return false;

    scrollContainer = sc;
    messageContainer = mc;
    log('Containers found on', location.hostname, '| Messages:', mc.children.length);
    return true;
  }

  function findMessages() {
    if (!messageContainer) return [];
    return Array.from(messageContainer.children).filter(el =>
      !el.dataset.gSlapsSpacer && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE'
    );
  }

  // ── IntersectionObservers — replace scroll handler entirely ──

  function setupObservers() {
    if (!scrollContainer) return;

    // When a spacer scrolls into view → restore its message
    restoreObserver = new IntersectionObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target._slapsEl) {
          doRestore(entry.target._slapsEl);
          changed = true;
        }
      }
      if (changed) updateBadge(collapsed.size, allMessages.length);
    }, {
      root: scrollContainer,
      rootMargin: CONFIG.RESTORE_MARGIN + 'px 0px ' + CONFIG.RESTORE_MARGIN + 'px 0px'
    });

    // When a restored message scrolls far away → re-collapse it
    recollapseObserver = new IntersectionObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          const el = entry.target;
          const idx = allMessages.indexOf(el);
          const cutoff = allMessages.length - CONFIG.KEEP_VISIBLE;
          if (idx >= 0 && idx < cutoff) {
            recollapseObserver.unobserve(el);
            scrollRestored.delete(el);
            doCollapse(el);
            changed = true;
          }
        }
      }
      if (changed) updateBadge(collapsed.size, allMessages.length);
    }, {
      root: scrollContainer,
      rootMargin: CONFIG.RECOLLAPSE_MARGIN + 'px 0px ' + CONFIG.RECOLLAPSE_MARGIN + 'px 0px'
    });
  }

  function destroyObservers() {
    if (restoreObserver) { restoreObserver.disconnect(); restoreObserver = null; }
    if (recollapseObserver) { recollapseObserver.disconnect(); recollapseObserver = null; }
    if (messageObserver) { messageObserver.disconnect(); messageObserver = null; }
  }

  // Watch message container for added/removed children → instant reaction
  function watchMessages() {
    if (!messageContainer || messageObserver) return;
    messageObserver = new MutationObserver(() => {
      if (selfMutating) return;
      clearTimeout(messageDebounce);
      messageDebounce = setTimeout(run, 200);
    });
    messageObserver.observe(messageContainer, { childList: true });
    log('Message observer attached');
  }

  // ── Single-element collapse/restore ──

  function doCollapse(el) {
    if (collapsed.has(el) || el.style.display === 'none') return;

    const height = el.offsetHeight;
    if (height === 0) return;

    const style = window.getComputedStyle(el);
    const totalHeight = height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);

    const spacer = document.createElement('div');
    spacer.style.cssText = 'height:' + totalHeight + 'px;min-height:' + totalHeight + 'px;width:100%;pointer-events:none;';
    spacer.dataset.gSlapsSpacer = 'true';
    spacer._slapsEl = el;

    selfMutating = true;
    el.parentNode.insertBefore(spacer, el);
    el.style.display = 'none';
    selfMutating = false;

    collapsed.set(el, { spacer, height: totalHeight });
    if (restoreObserver) restoreObserver.observe(spacer);
  }

  function doRestore(el) {
    const data = collapsed.get(el);
    if (!data) return;

    if (restoreObserver) restoreObserver.unobserve(data.spacer);

    selfMutating = true;
    el.style.display = '';
    if (data.spacer.parentNode) data.spacer.parentNode.removeChild(data.spacer);
    selfMutating = false;
    collapsed.delete(el);

    // Track as scroll-restored so run() doesn't re-collapse it
    scrollRestored.add(el);
    // Watch this element so it re-collapses when scrolled far away
    if (recollapseObserver) recollapseObserver.observe(el);
  }

  function restoreAll() {
    destroyObservers();
    selfMutating = true;
    for (const [el, data] of collapsed) {
      el.style.display = '';
      if (data.spacer && data.spacer.parentNode) data.spacer.parentNode.removeChild(data.spacer);
    }
    selfMutating = false;
    collapsed.clear();
    scrollRestored.clear();
    log('All restored');
  }

  // ── Chunked collapse — yields main thread between batches ──

  function collapseBatch(elements, startIdx) {
    if (!isEnabled) { collapseInProgress = false; return; }

    const end = Math.min(startIdx + CONFIG.COLLAPSE_BATCH, elements.length);

    // Read phase — measure all heights in one pass (single reflow)
    const measurements = [];
    for (let i = startIdx; i < end; i++) {
      const el = elements[i];
      if (collapsed.has(el) || el.style.display === 'none') { measurements.push(null); continue; }
      const h = el.offsetHeight;
      if (h === 0) { measurements.push(null); continue; }
      const s = window.getComputedStyle(el);
      measurements.push({
        el,
        totalHeight: h + (parseFloat(s.marginTop) || 0) + (parseFloat(s.marginBottom) || 0)
      });
    }

    // Write phase — DOM mutations only
    selfMutating = true;
    for (const m of measurements) {
      if (!m) continue;
      const spacer = document.createElement('div');
      spacer.style.cssText = 'height:' + m.totalHeight + 'px;min-height:' + m.totalHeight + 'px;width:100%;pointer-events:none;';
      spacer.dataset.gSlapsSpacer = 'true';
      spacer._slapsEl = m.el;

      m.el.parentNode.insertBefore(spacer, m.el);
      m.el.style.display = 'none';
      collapsed.set(m.el, { spacer, height: m.totalHeight });
      if (restoreObserver) restoreObserver.observe(spacer);
    }
    selfMutating = false;

    updateBadge(collapsed.size, allMessages.length);

    if (end < elements.length) {
      // Yield to browser, then continue next chunk
      requestAnimationFrame(() => collapseBatch(elements, end));
    } else {
      collapseInProgress = false;
      log('Collapse complete. Collapsed:', collapsed.size);
    }
  }

  // ── Main ──

  function run() {
    if (!isEnabled || collapseInProgress) return;

    if (!scrollContainer || !messageContainer) {
      if (!findContainers()) {
        log('Containers not found yet');
        return;
      }
      setupObservers();
      watchMessages();
    }

    if (!document.contains(messageContainer)) {
      log('Container detached, resetting');
      reset();
      return;
    }

    allMessages = findMessages();
    const total = allMessages.length;

    if (total <= CONFIG.KEEP_VISIBLE) {
      updateBadge(0, total);
      return;
    }

    const cutoff = total - CONFIG.KEEP_VISIBLE;

    // Ensure recent messages are always visible
    for (let i = cutoff; i < total; i++) {
      doRestore(allMessages[i]);
    }

    // Gather messages that need collapsing
    const toCollapse = [];
    for (let i = 0; i < cutoff; i++) {
      if (!collapsed.has(allMessages[i]) && !scrollRestored.has(allMessages[i])) toCollapse.push(allMessages[i]);
    }

    lastMessageCount = total;

    if (toCollapse.length > 0) {
      collapseInProgress = true;
      log('Collapsing', toCollapse.length, 'messages in batches of', CONFIG.COLLAPSE_BATCH);
      requestAnimationFrame(() => collapseBatch(toCollapse, 0));
    } else {
      updateBadge(collapsed.size, total);
    }
  }

  // ── Badge — bottom-right ──

  function createBadge() {
    if (statusBadge && document.contains(statusBadge)) return;
    statusBadge = document.createElement('div');
    statusBadge.id = 'g-slaps-badge';
    statusBadge.style.cssText = 'position:fixed;top:50%;transform:translateY(-50%);background:#1a1a2e;color:#7c83ff;font-family:SF Mono,Fira Code,monospace;font-size:11px;padding:6px 10px;border-radius:6px;z-index:99999;opacity:0.75;transition:opacity 0.3s,left 0.3s;pointer-events:none;border:1px solid #2a2a4e;user-select:none;';
    document.body.appendChild(statusBadge);
    positionBadge();
    window.addEventListener('resize', positionBadge);
  }

  function positionBadge() {
    if (!statusBadge) return;
    const mc = messageContainer || document.querySelector('.flex-1.flex.flex-col.px-4.max-w-3xl') || document.querySelector('[data-message-id]');
    if (mc) {
      const rect = mc.getBoundingClientRect();
      const gap = window.innerWidth - rect.right;
      statusBadge.style.left = (rect.right + (gap - statusBadge.offsetWidth) / 2) + 'px';
    } else {
      statusBadge.style.right = '40px';
    }
  }

  function updateBadge(collapsedCount, totalCount) {
    createBadge();
    // Push stats to storage for popup
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ stats: { collapsed: collapsedCount, visible: totalCount - collapsedCount, total: totalCount } });
    }
    if (!isEnabled) {
      statusBadge.textContent = '\u26A1 OFF';
      statusBadge.style.color = '#666';
      return;
    }
    if (collapsedCount === 0 && totalCount === 0) {
      statusBadge.textContent = '\u26A1 scanning...';
      statusBadge.style.color = '#888';
    } else if (collapsedCount === 0) {
      statusBadge.textContent = '\u26A1 ' + totalCount + ' msgs';
      statusBadge.style.color = '#4ade80';
    } else {
      statusBadge.textContent = '\u26A1 ' + collapsedCount + '\u2193 ' + (totalCount - collapsedCount) + '\u2191 / ' + totalCount;
      statusBadge.style.color = '#7c83ff';
    }
  }

  function reset() {
    collapseInProgress = false;
    restoreAll();
    scrollContainer = null;
    messageContainer = null;
    allMessages = [];
    lastMessageCount = 0;
  }

  // URL change detection
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      log('URL changed, resetting');
      reset();
      setTimeout(run, 2000);
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  function boot() {
    log('G Slaps starting...');
    createBadge();
    updateBadge(0, 0);

    // Try immediately
    if (findContainers()) {
      setupObservers();
      watchMessages();
      run();
      return;
    }

    // Not ready yet — watch DOM for the message container to appear
    const bootObserver = new MutationObserver(() => {
      if (findContainers()) {
        bootObserver.disconnect();
        setupObservers();
        watchMessages();
        run();
      }
    });
    bootObserver.observe(document.body, { childList: true, subtree: true });

    // Safety timeout — stop watching after 30s
    setTimeout(() => {
      bootObserver.disconnect();
      log('Gave up finding containers after 30s');
    }, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
