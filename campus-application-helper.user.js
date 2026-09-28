// ==UserScript==
// @name         秋招网申助手 · 通用信息库（稳定版）
// @namespace    https://github.com/local-only/campus-application-helper
// @version      1.1.0
// @description  跨网站手动填充本地信息库；收藏置顶、目标锁定、导入冲突预览和 JSON 备份，不自动提交。
// @author       Local User
// @match        http://*/*
// @match        https://*/*
// @noframes
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';

  // 本脚本不发起网络请求、不读取网页表单内容做备份，也不会自动提交表单。
  // GM_* 数据由 Tampermonkey 管理；浏览器/Tampermonkey 的同步设置不受本脚本控制。
  const STORAGE_KEY = 'campus-application-helper.entries.v1';
  const POSITION_KEY = 'campus-application-helper.position.v1';
  const SCHEMA = 'campus-application-helper';
  const SCHEMA_VERSION = 1;
  const MAX_ITEMS = 500;
  const MAX_TITLE = 120;
  const MAX_CONTENT = 20000;
  const MAX_TOTAL_CHARS = 1500000;
  const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
  const BUBBLE_SIZE = 46;
  const CATEGORIES = [
    '基本信息', '求职意向', '教育经历', '毕业设计', '实习经历',
    '项目经验', '自我评价', '获奖经历', '其他'
  ];
  const SUPPORTED_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'number']);

  let entries = [];
  let lastStoredRaw = null; // 乐观并发检查：跨标签页修改时不覆盖另一页的新数据。
  let pendingImport = null;
  let fillCheckToken = 0;
  let storageHealthy = true;
  let storageError = '';
  let selectedTarget = null;
  let editingId = null;
  let panelOpen = false;
  let dragging = null;
  let lastPointerUp = -Infinity;
  let bubblePosition = defaultBubblePosition();

  function defaultBubblePosition() {
    return {
      x: Math.max(10, window.innerWidth - BUBBLE_SIZE - 22),
      y: Math.max(10, window.innerHeight - BUBBLE_SIZE - 90)
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function safeNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  function newId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('备份中存在格式不正确的条目。');
    }
    if (!CATEGORIES.includes(raw.category)) {
      throw new Error('备份中存在不支持的信息类别。');
    }
    if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > MAX_TITLE) {
      throw new Error('备份中存在无效标题（长度上限 120 字符）。');
    }
    if (typeof raw.content !== 'string' || !raw.content.trim() || raw.content.length > MAX_CONTENT) {
      throw new Error('备份中存在无效正文（长度上限 20000 字符）。');
    }
    const now = Date.now();
    return {
      id: typeof raw.id === 'string' && /^[\w-]{1,100}$/.test(raw.id) ? raw.id : newId(),
      category: raw.category,
      title: raw.title.trim(),
      content: raw.content,
      createdAt: safeNumber(raw.createdAt, now),
      updatedAt: safeNumber(raw.updatedAt, now),
      favorite: raw.favorite === true // v1.0 无此字段时默认为未收藏，保持旧数据可读。
    };
  }

  function validateCollection(collection) {
    if (!Array.isArray(collection) || collection.length > MAX_ITEMS) {
      throw new Error(`条目数量必须不超过 ${MAX_ITEMS} 条。`);
    }
    const normalized = collection.map(normalizeEntry);
    const ids = new Set();
    let totalChars = 0;
    for (const item of normalized) {
      if (ids.has(item.id)) throw new Error('存在重复的条目 ID。');
      ids.add(item.id);
      totalChars += item.title.length + item.content.length;
    }
    if (totalChars > MAX_TOTAL_CHARS) {
      throw new Error('内容总量超出第一版的安全上限，请拆分备份后再导入。');
    }
    return normalized;
  }

  try {
    const raw = GM_getValue(STORAGE_KEY, null);
    lastStoredRaw = raw === null ? null : typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (raw !== null) {
      const decoded = typeof raw === 'string' ? JSON.parse(raw) : raw;
      entries = validateCollection(decoded);
    }
  } catch (error) {
    // 不能在读取失败时将空数组写回，否则可能覆盖用户原有数据。
    storageHealthy = false;
    storageError = error instanceof Error ? error.message : String(error);
    console.error('[秋招网申助手] 信息库读取失败，已保护原始数据：', error);
  }

  try {
    const savedPosition = GM_getValue(POSITION_KEY, null);
    if (savedPosition && typeof savedPosition === 'object') {
      const defaultPos = defaultBubblePosition();
      const maxX = Math.max(10, window.innerWidth - BUBBLE_SIZE - 10);
      const maxY = Math.max(10, window.innerHeight - BUBBLE_SIZE - 10);
      bubblePosition = {
        x: clamp(safeNumber(savedPosition.xRatio, defaultPos.x / maxX) * maxX, 10, maxX),
        y: clamp(safeNumber(savedPosition.yRatio, defaultPos.y / maxY) * maxY, 10, maxY)
      };
    }
  } catch (error) {
    console.warn('[秋招网申助手] 悬浮按钮位置读取失败，已使用默认位置：', error);
  }

  function persistEntries(nextEntries) {
    if (!storageHealthy) throw new Error('信息库读取异常，为防覆盖已禁用修改。');
    const currentRaw = GM_getValue(STORAGE_KEY, null);
    const currentSnapshot = currentRaw === null ? null
      : typeof currentRaw === 'string' ? currentRaw : JSON.stringify(currentRaw);
    if (currentSnapshot !== lastStoredRaw) {
      throw new Error('其他标签页已修改信息库。为防覆盖，请刷新当前页后重试。');
    }
    const checked = validateCollection(nextEntries);
    // 先写盘，再更新内存与界面；写盘失败时不制造“已保存”的假象。
    const serialized = JSON.stringify(checked);
    GM_setValue(STORAGE_KEY, serialized);
    lastStoredRaw = serialized;
    entries = checked;
  }

  function persistPosition() {
    try {
      const maxX = Math.max(10, window.innerWidth - BUBBLE_SIZE - 10);
      const maxY = Math.max(10, window.innerHeight - BUBBLE_SIZE - 10);
      GM_setValue(POSITION_KEY, {
        xRatio: bubblePosition.x / maxX,
        yRatio: bubblePosition.y / maxY
      });
    } catch (error) {
      console.warn('[秋招网申助手] 悬浮按钮位置保存失败：', error);
    }
  }

  const host = document.createElement('div');
  host.id = 'campus-application-helper-root';
  host.setAttribute('data-local-form-helper', 'true');
  const shadow = host.attachShadow({ mode: 'closed' });
  // 固定结构仅含脚本自带的静态 HTML；任何用户填写的内容一律通过 textContent/value 设置。
  shadow.innerHTML = `
    <style>
      :host { all: initial; position: fixed; inset: 0; width: 0; height: 0; pointer-events: none;
        z-index: 2147483647; color-scheme: light; font-family: system-ui, -apple-system,
        BlinkMacSystemFont, "Segoe UI", sans-serif; }
      *, *::before, *::after { box-sizing: border-box; }
      [hidden] { display: none !important; }
      button, input, select, textarea { font: inherit; }
      button { cursor: pointer; }
      button:disabled { opacity: .43; cursor: not-allowed; }
      button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
        outline: 2px solid #2563eb; outline-offset: 2px;
      }
      #launcher { position: fixed; width: 46px; height: 46px; border: 0; border-radius: 15px;
        background: #155eef; color: #fff; box-shadow: 0 4px 18px #0003; font-size: 22px;
        line-height: 1; touch-action: none; user-select: none; cursor: grab; pointer-events: auto;
        display: grid; place-items: center; }
      #launcher:active { cursor: grabbing; }
      #panel { position: fixed; width: min(380px, calc(100vw - 20px));
        max-height: min(76vh, calc(100vh - 20px)); min-height: 200px;
        overflow: hidden; display: flex; flex-direction: column; pointer-events: auto;
        border: 1px solid #d9e2ef; border-radius: 14px; background: #fff;
        color: #17243b; box-shadow: 0 12px 38px #0e244a33; font-size: 13px; line-height: 1.45; }
      .top { display: flex; align-items: center; justify-content: space-between;
        padding: 12px 12px 8px; gap: 8px; }
      .heading { font-size: 16px; font-weight: 750; letter-spacing: .1px; }
      .subheading { color: #64748b; font-size: 11px; }
      .icon-btn { background: transparent; border: 0; padding: 5px 8px; border-radius: 7px;
        color: #475569; font-size: 18px; }
      .icon-btn:hover { background: #eff4fb; }
      .target { padding: 7px 10px; margin: 0 12px 10px; border-radius: 8px;
        background: #f1f5f9; color: #475569; overflow-wrap: anywhere; font-size: 12px; }
      .target.ready { background: #eaf8ef; color: #17633b; }
      .target-row { display: flex; align-items: center; gap: 6px; margin: 0 12px 10px; }
      .target-row .target { flex: 1 1 auto; min-width: 0; margin: 0; }
      .target-row .btn { flex: 0 0 auto; }
      .btn.favorite { color: #a16207; }
      .entry.favorited { border-color: #f2d28b; background: #fffdf7; }
      #importView { overflow: auto; min-height: 0; flex: 1 1 auto; padding: 0 12px 12px; }
      .import-summary { font-size: 12px; color: #475569; white-space: pre-wrap; margin-bottom: 10px; }
      .import-row { padding: 8px; margin-bottom: 8px; border: 1px solid #e2e8f0; border-radius: 8px; }
      .import-compare { font-size: 11px; color: #475569; overflow-wrap: anywhere; white-space: pre-wrap; }
      .import-row select { margin-top: 6px; }
      .import-actions { display: flex; gap: 6px; justify-content: flex-end; }
      .toolbar { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px;
        padding: 0 12px 9px; }
      .control { min-width: 0; width: 100%; padding: 7px 8px; border: 1px solid #cbd5e1;
        border-radius: 8px; background: #fff; color: #16243b; font-size: 12px; }
      .btn { border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;
        color: #243750; padding: 6px 9px; font-size: 12px; white-space: nowrap; }
      .btn:hover:not(:disabled) { background: #f1f5f9; }
      .btn.primary { border-color: #155eef; color: #fff; background: #155eef; }
      .btn.primary:hover:not(:disabled) { background: #0a48c7; }
      .btn.danger { color: #b42318; }
      .list { overflow: auto; min-height: 65px; padding: 0 12px 8px; flex: 1 1 auto;
        overscroll-behavior: contain; }
      .entry { border: 1px solid #e2e8f0; border-radius: 9px; padding: 9px; margin-bottom: 8px;
        background: #fff; }
      .entry-top { display: flex; justify-content: space-between; align-items: baseline;
        gap: 8px; margin-bottom: 5px; }
      .entry-title { font-size: 13px; font-weight: 700; min-width: 0; overflow-wrap: anywhere; }
      .chip { flex: 0 0 auto; font-size: 10px; color: #415d80; background: #eff4fa;
        border-radius: 99px; padding: 2px 6px; }
      .preview { color: #64748b; font-size: 12px; overflow: hidden; white-space: pre-wrap;
        overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2;
        -webkit-box-orient: vertical; margin-bottom: 7px; }
      .actions { display: flex; flex-wrap: wrap; gap: 5px; }
      .empty { text-align: center; color: #64748b; padding: 22px 12px; }
      #editorView { padding: 0 12px 12px; overflow: auto; flex: 1 1 auto; }
      .editor-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
      .field-label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 8px; }
      .field-label .control { display: block; margin-top: 4px; font-weight: 400; }
      #entryContent { min-height: 124px; resize: vertical; line-height: 1.5; }
      .editor-actions { display: flex; justify-content: flex-end; gap: 7px; }
      .footer { flex: 0 0 auto; border-top: 1px solid #e2e8f0; padding: 9px 12px 10px; }
      .footer-buttons { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .muted { font-size: 11px; color: #64748b; margin-left: auto; }
      #status { font-size: 11px; color: #475569; padding-top: 7px; min-height: 0;
        white-space: pre-wrap; overflow-wrap: anywhere; }
      #status.error { color: #b42318; }
      #status.success { color: #17633b; }
      @media (max-width: 370px) {
        .toolbar { grid-template-columns: 1fr auto; }
        #filterCategory { grid-column: 1 / -1; grid-row: 2; }
      }
    </style>
    <button type="button" id="launcher" aria-label="打开秋招网申助手（可拖动）"
      title="秋招网申助手 · 点击展开 / 拖动位置">✎</button>
    <section id="panel" aria-label="秋招网申助手" hidden>
      <div class="top">
        <div><div class="heading">秋招网申助手</div><div class="subheading">本地信息库 · 选择字段后手动填入 · v1.1</div></div>
        <button type="button" class="icon-btn" id="closePanel" aria-label="收起面板" title="收起">×</button>
      </div>
      <div class="target-row">
        <div class="target" id="targetStatus" role="status">尚未选择网页输入框。先点击要填写的字段。</div>
        <button type="button" class="btn" id="clearTarget" title="主动取消已选中的网页字段">取消目标</button>
      </div>
      <div id="listView" style="display:flex;flex-direction:column;min-height:0;flex:1 1 auto;">
        <div class="toolbar">
          <input class="control" id="search" type="search" placeholder="搜索标题或内容" aria-label="搜索信息" />
          <select class="control" id="filterCategory" aria-label="按类别筛选"></select>
          <button type="button" class="btn primary" id="addEntry">＋ 新增</button>
        </div>
        <div class="list" id="entriesList"></div>
      </div>
      <form id="editorView" hidden>
        <div class="editor-title" id="editorHeading">新增信息</div>
        <label class="field-label">类别<select class="control" id="entryCategory" required></select></label>
        <label class="field-label">标题<input class="control" id="entryTitle" type="text"
          maxlength="120" placeholder="如：自我评价—AI 开发岗" required /></label>
        <label class="field-label">正文<textarea class="control" id="entryContent"
          maxlength="20000" rows="7" placeholder="在此保存可反复填写的内容" required></textarea></label>
        <div class="editor-actions">
          <button type="button" class="btn" id="cancelEdit">取消</button>
          <button type="submit" class="btn primary" id="saveEntry">保存</button>
        </div>
      </form>
      <section id="importView" hidden aria-label="JSON 导入预览">
        <div class="editor-title">导入预览 · 先确认再写入</div>
        <div class="import-summary" id="importSummary"></div>
        <div id="importConflicts"></div>
        <div class="import-actions">
          <button type="button" class="btn" id="cancelImport">取消导入</button>
          <button type="button" class="btn primary" id="applyImport">确认导入</button>
        </div>
      </section>
      <div class="footer">
        <div class="footer-buttons">
          <button type="button" class="btn" id="exportJson">导出 JSON</button>
          <button type="button" class="btn" id="importJson">导入 JSON</button>
          <span class="muted" id="countLabel">0 条</span>
          <input id="jsonFile" type="file" accept=".json,application/json" hidden />
        </div>
        <div id="status" role="status" aria-live="polite"></div>
      </div>
    </section>`;

  (document.documentElement || document.body).appendChild(host);
  const $ = (id) => shadow.getElementById(id);
  const launcher = $('launcher');
  const panel = $('panel');
  const listView = $('listView');
  const entriesList = $('entriesList');
  const editorView = $('editorView');
  const importView = $('importView');
  const categoryFilter = $('filterCategory');
  const entryCategory = $('entryCategory');

  function showStatus(message, kind = '') {
    const el = $('status');
    el.textContent = message;
    el.className = kind;
  }

  function createOption(value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  categoryFilter.appendChild(createOption('', '全部类别'));
  for (const category of CATEGORIES) {
    categoryFilter.appendChild(createOption(category, category));
    entryCategory.appendChild(createOption(category, category));
  }

  function renderList() {
    entriesList.replaceChildren();
    const query = $('search').value.trim().toLocaleLowerCase();
    const category = categoryFilter.value;
    const shown = entries.filter((entry) => {
      if (category && entry.category !== category) return false;
      if (!query) return true;
      return `${entry.title}\n${entry.content}\n${entry.category}`.toLocaleLowerCase().includes(query);
    }).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt);

    const fragment = document.createDocumentFragment();
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = entries.length ? '没有匹配的信息，试试其他关键词。' : '信息库为空。点击「＋ 新增」保存第一条信息。';
      fragment.appendChild(empty);
    }
    for (const entry of shown) {
      const card = document.createElement('div');
      card.className = 'entry' + (entry.favorite ? ' favorited' : '');
      card.dataset.id = entry.id;
      const top = document.createElement('div');
      top.className = 'entry-top';
      const title = document.createElement('span');
      title.className = 'entry-title';
      title.textContent = entry.title;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = entry.category;
      top.append(title, chip);
      const preview = document.createElement('div');
      preview.className = 'preview';
      preview.textContent = entry.content.length > 170 ? entry.content.slice(0, 170) + '…' : entry.content;
      const actions = document.createElement('div');
      actions.className = 'actions';
      for (const [action, label, primary] of [
        ['fill', '填入', true], ['copy', '复制', false],
        ['favorite', entry.favorite ? '★ 已收藏' : '☆ 收藏', false],
        ['edit', '编辑', false], ['delete', '删除', false]
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.action = action;
        button.className = 'btn' + (primary ? ' primary' : '')
          + (action === 'delete' ? ' danger' : '') + (action === 'favorite' ? ' favorite' : '');
        if (action === 'favorite') button.setAttribute('aria-pressed', String(entry.favorite));
        button.textContent = label;
        if (!storageHealthy && (action === 'edit' || action === 'delete' || action === 'favorite')) button.disabled = true;
        actions.appendChild(button);
      }
      card.append(top, preview, actions);
      fragment.appendChild(card);
    }
    entriesList.appendChild(fragment);
    $('countLabel').textContent = `${entries.length} 条`;
    $('addEntry').disabled = !storageHealthy || entries.length >= MAX_ITEMS;
    $('importJson').disabled = !storageHealthy;
    $('saveEntry').disabled = !storageHealthy;
  }

  function normalizeEditable(node) {
    if (!(node instanceof HTMLElement) || host.contains(node) || node === host) return null;
    if (node instanceof HTMLInputElement) {
      return SUPPORTED_INPUT_TYPES.has(node.type.toLowerCase()) ? node : null;
    }
    if (node instanceof HTMLTextAreaElement) return node;
    const editable = node.closest('[contenteditable]');
    return editable instanceof HTMLElement && editable.isContentEditable ? editable : null;
  }

  function isUsableTarget(target) {
    if (!(target instanceof HTMLElement) || !target.isConnected || target.ownerDocument !== document) return false;
    if (target instanceof HTMLInputElement) {
      if (!SUPPORTED_INPUT_TYPES.has(target.type.toLowerCase()) || target.disabled || target.readOnly) return false;
    } else if (target instanceof HTMLTextAreaElement) {
      if (target.disabled || target.readOnly) return false;
    } else if (!target.isContentEditable) return false;
    if (target.getClientRects().length === 0) return false;
    if (target.closest('[inert]')) return false;
    const style = window.getComputedStyle(target);
    return style.visibility !== 'hidden' && style.visibility !== 'collapse';
  }

  function describeTarget(target) {
    if (!target) return '尚未选择网页输入框。先点击要填写的字段。';
    if (!isUsableTarget(target)) return '上次选择的字段已不可填写，请重新点击网页输入框。';
    const kind = target instanceof HTMLTextAreaElement ? '多行输入框'
      : target instanceof HTMLInputElement ? '输入框' : '富文本区域';
    const hint = target.getAttribute('placeholder') || target.getAttribute('aria-label')
      || target.getAttribute('name') || target.getAttribute('id') || '';
    return `当前目标：${kind}${hint ? ' · ' + hint.slice(0, 56) : ''}`;
  }

  function renderTarget() {
    if (selectedTarget && !isUsableTarget(selectedTarget)) selectedTarget = null;
    const indicator = $('targetStatus');
    indicator.textContent = describeTarget(selectedTarget);
    indicator.classList.toggle('ready', isUsableTarget(selectedTarget));
    $('clearTarget').disabled = !selectedTarget;
  }

  function pageTargetFromEvent(event) {
    if (event.target === host || host.contains(event.target)) return null;
    return normalizeEditable(event.target);
  }

  // 只记住用户亲自点选或聚焦的网页字段；不会扫描表单或自动猜测字段含义。
  function recordTarget(event) {
    if (event.target === host || host.contains(event.target)) return;
    // 点到普通网页空白处时保留最近一次目标；新输入框将替换旧目标。
    // 点入 iframe 时清除旧目标，避免用户误以为选中了 iframe 内的字段。
    if (event.target instanceof HTMLIFrameElement) selectedTarget = null;
    else {
      const candidate = pageTargetFromEvent(event);
      if (!candidate) return;
      selectedTarget = candidate;
    }
    renderTarget();
  }
  document.addEventListener('pointerdown', recordTarget, true);
  document.addEventListener('focusin', recordTarget, true);
  $('clearTarget').addEventListener('click', () => {
    selectedTarget = null;
    fillCheckToken++;
    renderTarget();
    showStatus('已取消目标。下次填入前请重新点击网页字段。');
  });

  function nativeSetValue(target, value) {
    const prototype = target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (!descriptor || typeof descriptor.set !== 'function') throw new Error('浏览器不支持此输入框的填充方式。');
    // 使用原生 setter，绕开 React 在实例上添加的 value tracker setter。
    descriptor.set.call(target, value);
    try {
      target.dispatchEvent(new InputEvent('input', {
        bubbles: true, composed: true, inputType: 'insertReplacementText', data: value
      }));
    } catch (_) {
      target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    if (target.value !== value) {
      throw new Error('页面没有接受该值，请检查字段格式或使用「复制」手动粘贴。');
    }
    if (target.validity && (target.validity.typeMismatch || target.validity.patternMismatch
      || target.validity.rangeOverflow || target.validity.rangeUnderflow || target.validity.stepMismatch)) {
      return '网页提示字段格式、范围或步长不符，请检查后再提交。';
    }
    try {
      if (typeof target.setSelectionRange === 'function' && target.type !== 'number') {
        target.setSelectionRange(value.length, value.length);
      }
    } catch (_) { /* 某些输入框类型不支持设置光标位置。 */ }
  }

  function fillRichText(target, value) {
    // 只尝试真正空白且没有子元素的简单 contenteditable。
    // Quill/TinyMCE/ProseMirror 等通常包含结构化节点，统一要求复制后人工粘贴。
    if (target.textContent.length > 0 || target.querySelector('*')) {
      throw new Error('此富文本区域已有内容或排版结构；为了保护原文和格式，请使用「复制」后手动粘贴。');
    }
    if (typeof document.execCommand !== 'function') {
      throw new Error('此富文本编辑器不支持通用填充，请使用「复制」手动粘贴。');
    }
    target.focus({ preventScroll: true });
    const inserted = document.execCommand('insertText', false, value);
    if (!inserted || target.textContent !== value) {
      throw new Error('富文本未确认完整插入，请检查编辑器，必要时手动复制粘贴。');
    }
  }

  function fillEntry(entry) {
    const target = selectedTarget;
    if (!isUsableTarget(target)) {
      showStatus('先点击网页中要填写的输入框，再点击此条目的「填入」。', 'error');
      renderTarget();
      return;
    }
    const value = entry.content;
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
      && target.maxLength >= 0 && value.length > target.maxLength) {
      showStatus(`此字段最多允许 ${target.maxLength} 字符，条目内容过长。请换用短版或手动编辑。`, 'error');
      return;
    }
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      if (target instanceof HTMLInputElement && target.type === 'number'
        && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
        showStatus('目标是数字框，但该条目包含非数字内容。请改用合适的条目。', 'error');
        return;
      }
    }
    const isTextControl = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    const existing = isTextControl ? target.value : target.textContent;
    if (!isTextControl && (existing.length > 0 || target.querySelector('*'))) {
      showStatus('富文本已有内容或结构。为保护格式，不自动覆盖；请点击「复制」手动粘贴。', 'error');
      return;
    }
    if (existing === value) {
      showStatus('目标字段已经是相同内容，未重复修改。', 'success');
      return;
    }
    if (existing && !window.confirm(
      `目标字段已有内容。确定要用「${entry.title}」覆盖吗？\n\n${describeTarget(target)}\n\n取消可保留原内容。`
    )) {
      showStatus('已取消填充，网页原内容未修改。');
      return;
    }
    try {
      if (!isUsableTarget(target)) throw new Error('目标字段已不可填写，请重新选择。');
      if (isTextControl) {
        const warning = nativeSetValue(target, value);
        target.focus({ preventScroll: true });
        showStatus(warning || '已触发填入，正在复核网页字段。请自行检查并提交网申。', warning ? 'error' : 'success');
        const token = ++fillCheckToken;
        window.setTimeout(() => {
          if (token !== fillCheckToken || selectedTarget !== target) return;
          if (!isUsableTarget(target)) {
            showStatus('原网页字段已失效或被重新渲染，请重新选择输入框并核对内容。', 'error');
          } else if (target.value !== value) {
            showStatus('复核发现网页恢复或改写了内容；此字段可能不兼容，请使用「复制」手动粘贴。', 'error');
          } else if (!warning) {
            showStatus('复核通过：网页字段仍显示填入内容。请检查校验提示；不代表网申已保存或提交。', 'success');
          }
          renderTarget();
        }, 300);
      } else {
        fillRichText(target, value);
        showStatus('已尝试写入简单空白富文本区。请检查编辑器并自行提交。', 'success');
      }
      renderTarget();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : '填充失败，请复制后手动粘贴。', 'error');
    }
  }

  function legacyCopy(value) {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;';
    shadow.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } finally { textarea.remove(); }
    return copied;
  }

  async function copyEntry(entry) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(entry.content);
          showStatus(`已复制「${entry.title}」，可手动粘贴。`, 'success');
          return;
        } catch (_) { /* 站点不支持 Clipboard API 时，尝试传统复制方式。 */ }
      }
      if (!legacyCopy(entry.content)) throw new Error('浏览器拒绝访问剪贴板。');
      showStatus(`已复制「${entry.title}」，可手动粘贴。`, 'success');
    } catch (_) {
      showStatus('复制失败：请检查浏览器剪贴板权限，或进入「编辑」手动选择文字复制。', 'error');
    }
  }

  function beginEdit(entry = null) {
    if (!storageHealthy) return showStatus('数据读取异常，暂时不能修改信息库。', 'error');
    editingId = entry ? entry.id : null;
    $('editorHeading').textContent = entry ? '编辑信息' : '新增信息';
    entryCategory.value = entry ? entry.category : CATEGORIES[0];
    $('entryTitle').value = entry ? entry.title : '';
    $('entryContent').value = entry ? entry.content : '';
    listView.hidden = true;
    editorView.hidden = false;
    $('entryTitle').focus();
    positionPanel();
  }

  function cancelEdit() {
    editingId = null;
    editorView.hidden = true;
    listView.hidden = false;
    renderList();
    positionPanel();
  }

  function saveEdit(event) {
    event.preventDefault();
    if (!storageHealthy) return showStatus('数据读取异常，不能保存。', 'error');
    if (!editorView.reportValidity()) return;
    const title = $('entryTitle').value.trim();
    const content = $('entryContent').value;
    if (!title || !content.trim()) {
      showStatus('标题和正文不能为空。', 'error');
      return;
    }
    const now = Date.now();
    const previous = editingId ? entries.find((entry) => entry.id === editingId) : null;
    if (editingId && !previous) {
      showStatus('待编辑的信息已不存在，请取消后重新操作。', 'error');
      return;
    }
    const record = {
      id: previous ? previous.id : newId(),
      category: entryCategory.value,
      title,
      content,
      createdAt: previous ? previous.createdAt : now,
      updatedAt: now,
      favorite: previous ? previous.favorite : false
    };
    try {
      const next = previous ? entries.map((entry) => entry.id === previous.id ? record : entry)
        : [...entries, record];
      persistEntries(next);
      cancelEdit();
      showStatus(previous ? '编辑内容已保存到本地信息库。' : '新增内容已保存到本地信息库。', 'success');
    } catch (error) {
      showStatus(`保存失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  function toggleFavorite(entry) {
    if (!storageHealthy) return showStatus('信息库读取异常，不能修改收藏状态。', 'error');
    try {
      persistEntries(entries.map((item) => item.id === entry.id
        ? { ...item, favorite: !item.favorite } : item));
      renderList();
      showStatus(entry.favorite ? '已取消收藏。' : '已收藏并置顶。', 'success');
    } catch (error) {
      showStatus(`收藏失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  function deleteEntry(entry) {
    if (!storageHealthy) return showStatus('数据读取异常，不能删除。', 'error');
    if (!window.confirm(`确定删除「${entry.title}」吗？\n此操作不能撤销，请按需先导出 JSON 备份。`)) return;
    try {
      persistEntries(entries.filter((item) => item.id !== entry.id));
      renderList();
      showStatus(`已删除「${entry.title}」。`, 'success');
    } catch (error) {
      showStatus(`删除失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  function downloadBackup() {
    if (!storageHealthy) return showStatus('原始数据读取失败，不能生成可靠备份，请通过 Tampermonkey 检查脚本存储。', 'error');
    try {
      const backup = {
        schema: SCHEMA,
        version: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        entries
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `autumn-application-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.style.display = 'none';
      shadow.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      showStatus('已请求浏览器下载 JSON 备份，请在下载目录确认文件。备份包含个人信息，请妥善保管。', 'success');
    } catch (error) {
      showStatus(`导出失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  function entryKey(item) { return JSON.stringify([item.category, item.title]); }
  function entrySignature(item) { return JSON.stringify([item.category, item.title, item.content]); }

  function planBackup(incoming) {
    const currentById = new Map(entries.map((item) => [item.id, item]));
    const byTitle = new Map();
    for (const item of entries) {
      const key = entryKey(item);
      byTitle.set(key, [...(byTitle.get(key) || []), item]);
    }
    const knownExact = new Set(entries.map(entrySignature));
    const importedTitles = new Map();
    const additions = [], conflicts = [];
    let skipped = 0;
    for (const item of incoming) {
      const key = entryKey(item);
      const previousIncoming = importedTitles.get(key);
      if (previousIncoming && previousIncoming !== entrySignature(item)) {
        throw new Error(`备份内部的「${item.title}」存在同类别同标题、正文不同的多条信息，请先整理备份再导入。`);
      }
      importedTitles.set(key, entrySignature(item));
      if (knownExact.has(entrySignature(item))) { skipped++; continue; }
      const matchById = currentById.get(item.id);
      const titleMatches = byTitle.get(key) || [];
      if (!matchById && titleMatches.length > 1) {
        throw new Error(`当前信息库中「${item.title}」存在多条同类别同标题记录，请先区分标题再导入。`);
      }
      const matched = matchById || titleMatches[0];
      if (matched) {
        conflicts.push({ incoming: item, existing: matched });
        knownExact.add(entrySignature(item)); // 避免同一备份中重复展示相同冲突。
      } else {
        additions.push(item);
        knownExact.add(entrySignature(item));
      }
    }
    return { additions, conflicts, skipped };
  }

  function closeImport() {
    pendingImport = null;
    importView.hidden = true;
    listView.hidden = false;
    $('importConflicts').replaceChildren();
    renderList();
    positionPanel();
  }

  function previewImport(fileName, plan) {
    listView.hidden = true;
    editorView.hidden = true;
    importView.hidden = false;
    $('importSummary').textContent = `文件：${fileName}\n预计新增 ${plan.additions.length} 条；` +
      `存在 ${plan.conflicts.length} 处冲突；跳过完全重复 ${plan.skipped} 条。\n` +
      '冲突默认保留当前信息；只有你主动选择“使用备份版本”，才会替换对应条目。';
    const container = $('importConflicts');
    container.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const [index, conflict] of plan.conflicts.entries()) {
      const row = document.createElement('div');
      row.className = 'import-row';
      const heading = document.createElement('div');
      heading.className = 'entry-title';
      heading.textContent = `${index + 1}. ${conflict.incoming.category} / ${conflict.incoming.title}`;
      const compare = document.createElement('div');
      compare.className = 'import-compare';
      const shorten = (content) => content.length > 80 ? content.slice(0, 80) + '…' : content;
      compare.textContent = `当前：${shorten(conflict.existing.content)}\n备份：${shorten(conflict.incoming.content)}`;
      const select = document.createElement('select');
      select.className = 'control';
      select.dataset.conflictIndex = String(index);
      select.setAttribute('aria-label', `处理冲突 ${conflict.incoming.title}`);
      select.append(createOption('keep', '保留当前版本（默认）'), createOption('replace', '使用备份版本覆盖此条'));
      row.append(heading, compare, select);
      fragment.appendChild(row);
    }
    container.appendChild(fragment);
    positionPanel();
  }

  async function importBackup(file) {
    if (!file || !storageHealthy) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showStatus('备份文件超过 8 MB，为防止页面卡顿已取消导入。', 'error');
      return;
    }
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)
        || raw.schema !== SCHEMA || raw.version !== SCHEMA_VERSION) {
        throw new Error('不是本助手 v1 兼容格式的 JSON 备份。');
      }
      const incoming = validateCollection(raw.entries);
      const plan = planBackup(incoming);
      if (!plan.additions.length && !plan.conflicts.length) {
        showStatus('此备份中的记录已经存在，没有需要导入的内容。');
        return;
      }
      // 预览不写盘；保存用于提交前再次检查当前数据是否变化。
      pendingImport = { plan, snapshot: lastStoredRaw };
      previewImport(file.name, plan);
      showStatus('请查看导入预览并选择每条冲突的处理方式。');
    } catch (error) {
      showStatus(`无法预览导入，信息库未改变：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  function applyImport() {
    if (!pendingImport || !storageHealthy) return;
    try {
      if (pendingImport.snapshot !== lastStoredRaw) {
        throw new Error('信息库已发生变化，请取消并重新选择备份文件。');
      }
      const { additions, conflicts, skipped } = pendingImport.plan;
      const choices = [...$('importConflicts').querySelectorAll('select[data-conflict-index]')];
      const replacements = new Map();
      for (const select of choices) {
        if (select.value !== 'replace') continue;
        const conflict = conflicts[Number(select.dataset.conflictIndex)];
        if (!conflict) throw new Error('导入预览已失效，请重新选择备份。');
        const original = entries.find((item) => item.id === conflict.existing.id);
        if (!original) throw new Error('待替换信息已不存在，请重新选择备份。');
        if (replacements.has(original.id)) throw new Error('同一信息发生多次冲突，请先整理备份。');
        replacements.set(original.id, {
          ...conflict.incoming, id: original.id, createdAt: original.createdAt,
          favorite: original.favorite, updatedAt: Date.now()
        });
      }
      if (!additions.length && !replacements.size) {
        closeImport();
        showStatus(`没有选择新增或覆盖操作；已保留原信息，跳过 ${skipped + conflicts.length} 条。`);
        return;
      }
      const occupiedIds = new Set(entries.map((item) => item.id));
      const safeAdditions = additions.map((item) => {
        const fresh = { ...item };
        while (occupiedIds.has(fresh.id)) fresh.id = newId();
        occupiedIds.add(fresh.id);
        return fresh;
      });
      const next = validateCollection([
        ...entries.map((item) => replacements.get(item.id) || item), ...safeAdditions
      ]);
      if (!window.confirm(`准备新增 ${safeAdditions.length} 条、覆盖 ${replacements.size} 条、保留或跳过 ${skipped + conflicts.length - replacements.size} 条。\n\n确定写入本地信息库吗？`)) {
        showStatus('已取消本次写入，信息库没有改变。');
        return;
      }
      persistEntries(next);
      closeImport();
      showStatus(`导入成功：新增 ${safeAdditions.length} 条，覆盖 ${replacements.size} 条。请按需导出新备份。`, 'success');
    } catch (error) {
      showStatus(`导入未完成：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }

  function setBubblePosition(x, y) {
    bubblePosition = {
      x: clamp(x, 10, Math.max(10, window.innerWidth - BUBBLE_SIZE - 10)),
      y: clamp(y, 10, Math.max(10, window.innerHeight - BUBBLE_SIZE - 10))
    };
    launcher.style.left = `${bubblePosition.x}px`;
    launcher.style.top = `${bubblePosition.y}px`;
    if (panelOpen) positionPanel();
  }

  function positionPanel() {
    if (!panelOpen) return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelWidth = panel.getBoundingClientRect().width;
    const panelHeight = panel.getBoundingClientRect().height;
    let x = bubblePosition.x + BUBBLE_SIZE + 9;
    if (x + panelWidth > viewportWidth - 10) x = bubblePosition.x - panelWidth - 9;
    x = clamp(x, 10, Math.max(10, viewportWidth - panelWidth - 10));
    let y = bubblePosition.y - panelHeight - 8;
    if (y < 10) y = bubblePosition.y + BUBBLE_SIZE + 8;
    y = clamp(y, 10, Math.max(10, viewportHeight - panelHeight - 10));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  }

  function togglePanel(force) {
    panelOpen = typeof force === 'boolean' ? force : !panelOpen;
    panel.hidden = !panelOpen;
    launcher.setAttribute('aria-expanded', String(panelOpen));
    if (panelOpen) {
      renderTarget();
      renderList();
      positionPanel();
    }
  }

  launcher.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = {
      pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      initialX: bubblePosition.x, initialY: bubblePosition.y,
      moved: false
    };
    launcher.setPointerCapture(event.pointerId);
  });
  launcher.addEventListener('pointermove', (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragging.startX;
    const dy = event.clientY - dragging.startY;
    if (Math.hypot(dx, dy) > 5) dragging.moved = true;
    if (dragging.moved) setBubblePosition(dragging.initialX + dx, dragging.initialY + dy);
  });
  launcher.addEventListener('pointerup', (event) => {
    if (!dragging || dragging.pointerId !== event.pointerId) return;
    const wasMoved = dragging.moved;
    lastPointerUp = performance.now();
    dragging = null;
    if (launcher.hasPointerCapture(event.pointerId)) launcher.releasePointerCapture(event.pointerId);
    if (wasMoved) persistPosition();
    else togglePanel();
  });
  launcher.addEventListener('pointercancel', () => { dragging = null; });
  // 键盘激活按钮时没有 pointerup：保持 Enter / 空格键可用。
  launcher.addEventListener('click', (event) => {
    if (event.detail === 0 && performance.now() - lastPointerUp > 500) togglePanel();
  });

  $('closePanel').addEventListener('click', () => togglePanel(false));
  $('search').addEventListener('input', renderList);
  categoryFilter.addEventListener('change', renderList);
  $('addEntry').addEventListener('click', () => beginEdit());
  $('cancelEdit').addEventListener('click', cancelEdit);
  editorView.addEventListener('submit', saveEdit);
  $('exportJson').addEventListener('click', downloadBackup);
  $('importJson').addEventListener('click', () => $('jsonFile').click());
  $('cancelImport').addEventListener('click', () => { closeImport(); showStatus('已取消导入，原有信息未修改。'); });
  $('applyImport').addEventListener('click', applyImport);
  $('jsonFile').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = ''; // 允许连续导入同一个备份文件。
    if (file) await importBackup(file);
  });
  entriesList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('.entry');
    const entry = card && entries.find((item) => item.id === card.dataset.id);
    if (!entry) return showStatus('该条信息已不存在，请刷新列表。', 'error');
    switch (button.dataset.action) {
      case 'fill': fillEntry(entry); break;
      case 'copy': void copyEntry(entry); break;
      case 'favorite': toggleFavorite(entry); break;
      case 'edit': beginEdit(entry); break;
      case 'delete': deleteEntry(entry); break;
      default: break;
    }
  });
  shadow.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!editorView.hidden) cancelEdit();
    else if (!importView.hidden) closeImport();
    else if (panelOpen) togglePanel(false);
    else return;
    event.stopPropagation();
  });
  // 尽量不把面板上的交互冒泡给招聘网站的 document 点击处理器。
  shadow.addEventListener('click', (event) => event.stopPropagation());
  window.addEventListener('resize', () => {
    setBubblePosition(bubblePosition.x, bubblePosition.y);
    positionPanel();
  });

  setBubblePosition(bubblePosition.x, bubblePosition.y);
  renderList();
  renderTarget();
  if (!storageHealthy) {
    showStatus(`信息库读取失败，已禁用修改以防覆盖原数据。请检查 Tampermonkey 脚本存储。错误：${storageError}`, 'error');
  }
})();
