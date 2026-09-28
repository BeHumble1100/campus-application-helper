// ==UserScript==
// @name         秋招网申资料库 v3.4.5
// @namespace    campus-application-helper
// @version      3.4.5
// @description  Shadow DOM 样式隔离；分类/卡片/字段三级自定义；可移动、可缩放、拖拽排序；卡片自动换行；JSON 导入导出。
// @match        http://*/*
// @match        https://*/*
// @run-at       document-end
// @noframes
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  const HOST_ID = 'campus-helper-v345-host';
  const DB_KEY = 'campus-helper-v32-db';
  const UI_KEY = 'campus-helper-v345-ui';
  const OLD_UI_KEYS = [
    'campus-helper-v344-ui',
    'campus-helper-v343-ui',
    'campus-helper-v342-ui',
    'campus-helper-v341-ui',
    'campus-helper-v34-ui',
    'campus-helper-v33-ui'
  ];

  const DEF = {
    width: 450,
    height: 760,
    top: 64,
    rail: 56,
    gap: 8
  };

  const MIN_W = 340;
  const MIN_H = 400;

  if (document.getElementById(HOST_ID)) return;

  const uid = prefix =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const str = value => String(value ?? '');

  // =========================================================
  // 数据结构 / 迁移
  // =========================================================

  function defaultDB() {
    return {
      version: 2,
      categories: [
        { id: 'basic', name: '基本信息与求职意向', shortName: '基本', cards: [] },
        { id: 'education', name: '教育经历', shortName: '教育', cards: [] },
        { id: 'intern', name: '实习经历', shortName: '实习', cards: [] },
        { id: 'project', name: '项目经验', shortName: '项目', cards: [] },
        { id: 'skills', name: '技能与语言', shortName: '技能', cards: [] },
        { id: 'campus', name: '校园经历与奖项', shortName: '校园', cards: [] },
        { id: 'writing', name: '常用文案', shortName: '文案', cards: [] }
      ],
      updatedAt: Date.now()
    };
  }

  function cleanItem(item) {
    if (!item || typeof item !== 'object' || item.kind === 'note') return null;

    const kind = ['field', 'text', 'period'].includes(item.kind)
      ? item.kind
      : 'field';

    if (kind === 'period') {
      return {
        label: str(item.label),
        kind,
        start: str(item.start),
        end: str(item.end)
      };
    }

    return {
      label: str(item.label),
      kind,
      value: str(item.value)
    };
  }

  function cleanCard(card) {
    return {
      id: str(card?.id) || uid('card'),
      title: str(card?.title) || '未命名卡片',
      shortName: str(card?.shortName || card?.title) || '卡片',
      subtitle: str(card?.subtitle),
      items: Array.isArray(card?.items)
        ? card.items.map(cleanItem).filter(Boolean)
        : []
    };
  }

  function normalize(raw) {
    if (!raw || !Array.isArray(raw.categories) || !raw.categories.length) {
      return null;
    }

    return {
      version: 2,
      categories: raw.categories.map(category => ({
        id: str(category.id) || uid('cat'),
        name: str(category.name) || '未命名分类',
        shortName: str(category.shortName || category.name) || '分类',
        cards: Array.isArray(category.cards)
          ? category.cards.map(cleanCard)
          : []
      })),
      updatedAt: Date.now()
    };
  }

  function migrateV32(raw) {
    if (!raw?.data) return null;

    const old = raw.data;
    const allCards = Object.values(old).flatMap(group =>
      Array.isArray(group?.cards) ? group.cards : []
    );

    const byId = new Map(allCards.map(card => [card.id, card]));
    const used = new Set();
    const db = defaultDB();
    const map = Object.fromEntries(db.categories.map(category => [category.id, category]));

    function take(ids) {
      return ids.flatMap(id => {
        const card = byId.get(id);
        if (!card) return [];
        used.add(card);
        return [cleanCard(card)];
      });
    }

    map.basic.cards = take(['basic', 'job']);
    map.education.cards = take(['master', 'bachelor', 'highschool']);
    map.intern.cards = take(['uaes', 'zhida']);
    map.project.cards = take(['prism', 'checklist', 'deepresearch', 'robot']);
    map.skills.cards = take(['skills']);
    map.campus.cards = take(['campus', 'awards']);
    map.writing.cards = take(['self', 'advantage', 'career', 'hobby']);

    const oldToNew = {
      basic: 'basic',
      education: 'education',
      intern: 'intern',
      project: 'project',
      writing: 'writing'
    };

    Object.entries(oldToNew).forEach(([oldKey, newKey]) => {
      (old[oldKey]?.cards || []).forEach(card => {
        if (used.has(card)) return;
        map[newKey].cards.push(cleanCard(card));
        used.add(card);
      });
    });

    const leftovers = allCards
      .filter(card => !used.has(card))
      .map(cleanCard);

    if (leftovers.length) {
      db.categories.push({
        id: uid('cat'),
        name: '其他资料',
        shortName: '其他',
        cards: leftovers
      });
    }

    return db;
  }

  function loadDB() {
    try {
      const raw = GM_getValue(DB_KEY, null);
      const result = normalize(raw) || migrateV32(raw) || defaultDB();
      GM_setValue(DB_KEY, result);
      return result;
    } catch (error) {
      console.error('[秋招助手] 读取数据库失败', error);
      return defaultDB();
    }
  }

  let db = loadDB();

  // =========================================================
  // UI 状态
  // =========================================================

  const state = {
    open: false,
    manage: false,
    categoryId: db.categories[0]?.id || '',
    cardId: db.categories[0]?.cards[0]?.id || '',
    search: '',
    left: Math.max(
      8,
      window.innerWidth - DEF.width - DEF.rail - DEF.gap - 16
    ),
    top: DEF.top,
    width: DEF.width,
    height: DEF.height
  };

  for (const key of [UI_KEY, ...OLD_UI_KEYS]) {
    try {
      const saved = GM_getValue(key, null);
      if (!saved || typeof saved !== 'object') continue;

      if (typeof saved.categoryId === 'string') state.categoryId = saved.categoryId;
      if (typeof saved.cardId === 'string') state.cardId = saved.cardId;

      ['left', 'top', 'width', 'height'].forEach(name => {
        if (Number.isFinite(saved[name])) state[name] = saved[name];
      });
      break;
    } catch (_) {}
  }

  // =========================================================
  // Shadow DOM 宿主
  // =========================================================

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('inset', '0', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  host.style.setProperty('pointer-events', 'none', 'important');
  host.style.setProperty('width', '100vw', 'important');
  host.style.setProperty('height', '100vh', 'important');
  host.style.setProperty('overflow', 'visible', 'important');

  (document.body || document.documentElement).appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="ch345-shell">
      <aside class="ch345-rail"></aside>

      <section class="ch345-panel">
        <header class="ch345-drag">
          <div class="ch345-top">
            <div class="ch345-titlebox">
              <b class="ch345-title"></b>
              <small>拖标题栏移动 · 右下角调整大小 · 点击复制后手动粘贴</small>
            </div>
            <div class="ch345-topactions">
              <button class="ch345-manage" type="button">管理</button>
              <button class="ch345-close" type="button">×</button>
            </div>
          </div>
          <input class="ch345-search" type="search" placeholder="搜索当前分类…" autocomplete="off">
        </header>

        <div class="ch345-tabs"></div>

        <div class="ch345-toolbar">
          <button class="ch345-addcat" type="button">＋分类</button>
          <button class="ch345-editcat" type="button">编辑分类</button>
          <button class="ch345-delcat" type="button">删除分类</button>
          <span class="ch345-divider"></span>
          <button class="ch345-addcard" type="button">＋卡片</button>
          <button class="ch345-editcard" type="button">编辑卡片</button>
          <button class="ch345-delcard" type="button">删除卡片</button>
          <button class="ch345-additem" type="button">＋字段</button>
          <span class="ch345-divider"></span>
          <button class="ch345-export" type="button">导出</button>
          <button class="ch345-import" type="button">导入</button>
          <button class="ch345-reset" type="button">重置布局</button>
          <input class="ch345-file" type="file" accept=".json,application/json">
        </div>

        <main class="ch345-content"></main>
        <footer class="ch345-footer">v3.4.5 · Shadow DOM 隔离版</footer>
        <div class="ch345-toast"></div>
        <div class="ch345-resize" title="拖动调整大小；双击恢复默认大小">↘</div>
      </section>
    </div>

    <div class="ch345-modal-overlay">
      <div class="ch345-modalbox">
        <b class="ch345-modal-title"></b>
        <div class="ch345-modal-body"></div>
        <div class="ch345-modal-actions">
          <button class="ch345-cancel" type="button">取消</button>
          <button class="ch345-save ch345-primary" type="button">保存</button>
        </div>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    :host, *, *::before, *::after {
      box-sizing: border-box;
    }

    * {
      font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
    }

    .ch345-shell {
      position: fixed;
      z-index: 2147483647;
      pointer-events: auto;
    }

    button {
      appearance: none;
      -webkit-appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: auto;
      height: auto;
      min-width: 0;
      min-height: 0;
      margin: 0;
      padding: 5px 8px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      color: #334155;
      box-shadow: none;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.2;
      white-space: nowrap;
      cursor: pointer;
    }

    button:hover {
      background: #f8fafc;
    }

    button.ch345-primary {
      background: #155eef;
      border-color: #155eef;
      color: #fff;
    }

    input, textarea, select {
      appearance: none;
      -webkit-appearance: none;
      display: block;
      width: 100%;
      min-width: 0;
      height: auto;
      min-height: 0;
      margin: 0;
      padding: 7px 9px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #fff;
      color: #17243b;
      box-shadow: none;
      outline: none;
      font-size: 12px;
      line-height: 1.4;
      pointer-events: auto;
      user-select: text;
    }

    input:focus, textarea:focus, select:focus {
      border-color: #155eef;
      box-shadow: 0 0 0 2px rgba(21,94,239,.12);
    }

    textarea {
      min-height: 130px;
      resize: vertical;
      white-space: pre-wrap;
    }

    .ch345-rail {
      position: absolute;
      top: 0;
      width: ${DEF.rail}px;
      max-height: 760px;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      overflow-x: hidden;
      overflow-y: auto;
      background: #f8fbff;
      border: 1px solid #d9e2ef;
      border-radius: 14px;
      box-shadow: 0 8px 28px rgba(15,23,42,.2);
    }

    .ch345-rail button {
      width: 42px;
      min-height: 40px;
      padding: 5px 2px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.15;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .ch345-rail button:hover {
      background: #e7eef9;
    }

    .ch345-rail .ch345-toggle {
      font-size: 20px;
      color: #155eef;
    }

    .ch345-rail button.ch345-on {
      background: #155eef;
      color: #fff;
    }

    .ch345-panel {
      position: relative;
      display: none;
      flex-direction: column;
      min-width: ${MIN_W}px;
      min-height: ${MIN_H}px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #fff;
      color: #17243b;
      border: 1px solid #d9e2ef;
      border-radius: 15px;
      box-shadow: 0 16px 48px rgba(15,23,42,.26);
      font-size: 13px;
      line-height: 1.55;
    }

    .ch345-drag {
      flex: 0 0 auto;
      display: block;
      width: 100%;
      padding: 12px;
      border-bottom: 1px solid #e5eaf1;
      background: #fff;
      cursor: move;
      user-select: none;
    }

    .ch345-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
    }

    .ch345-titlebox {
      min-width: 0;
      flex: 1 1 auto;
    }

    .ch345-title {
      display: block;
      margin: 0;
      color: #17243b;
      font-size: 17px;
      font-weight: 700;
      line-height: 1.3;
    }

    .ch345-drag small {
      display: block;
      margin-top: 2px;
      color: #64748b;
      font-size: 11px;
      line-height: 1.4;
    }

    .ch345-topactions {
      display: flex;
      flex: 0 0 auto;
      gap: 5px;
    }

    .ch345-search {
      margin-top: 10px;
      height: 35px;
      cursor: text;
    }

    .ch345-tabs {
      flex: 0 0 auto;
      display: flex;
      flex-wrap: wrap;
      align-content: flex-start;
      align-items: flex-start;
      justify-content: flex-start;
      gap: 6px;
      width: 100%;
      height: auto;
      min-height: 48px;
      margin: 0;
      padding: 9px 10px;
      overflow: visible;
      border-bottom: 1px solid #e5eaf1;
      background: #fbfdff;
    }

    .ch345-tab {
      flex: 0 0 auto;
      max-width: 100%;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 11px;
      white-space: nowrap;
    }

    .ch345-tab.ch345-on {
      background: #17243b;
      border-color: #17243b;
      color: #fff;
    }

    .ch345-toolbar {
      flex: 0 0 auto;
      display: none;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      width: 100%;
      padding: 8px 10px;
      border-bottom: 1px solid #e5eaf1;
      background: #f8fafc;
    }

    .ch345-divider {
      display: block;
      flex: 0 0 1px;
      align-self: stretch;
      min-height: 24px;
      margin: 2px;
      background: #d8dee8;
    }

    .ch345-file {
      display: none;
    }

    .ch345-content {
      flex: 1 1 auto;
      display: block;
      width: 100%;
      min-width: 0;
      min-height: 0;
      margin: 0;
      padding: 11px;
      overflow-x: hidden;
      overflow-y: auto;
      background: #fff;
      color: #17243b;
    }

    .ch345-cardhead {
      display: block;
      width: 100%;
      margin: 0 0 10px;
      padding: 0;
    }

    .ch345-cardhead > b {
      display: block;
      color: #17243b;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.35;
    }

    .ch345-subtitle {
      display: block;
      margin-top: 2px;
      color: #64748b;
      font-size: 11px;
      line-height: 1.4;
    }

    .ch345-item {
      position: static;
      display: block;
      width: 100%;
      height: auto;
      min-width: 0;
      min-height: 0;
      margin: 0 0 9px;
      padding: 10px;
      overflow: visible;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #fff;
      color: #17243b;
      box-shadow: none;
    }

    .ch345-item.ch345-textitem {
      background: #fbfdff;
    }

    .ch345-dragging {
      opacity: .4;
    }

    .ch345-labelrow {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      margin: 0 0 5px;
    }

    .ch345-label {
      display: block;
      flex: 1 1 auto;
      min-width: 0;
      color: #334155;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.4;
    }

    .ch345-handle {
      display: block;
      flex: 0 0 auto;
      color: #94a3b8;
      font-size: 16px;
      line-height: 1;
      cursor: grab;
    }

    .ch345-value {
      display: block;
      width: auto;
      min-width: 0;
      margin: 0;
      padding: 0;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      color: #475569;
      font-size: 12px;
      line-height: 1.65;
      user-select: text;
    }

    .ch345-value.ch345-cut {
      max-height: 112px;
      overflow: hidden;
    }

    .ch345-fieldrow {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      width: 100%;
    }

    .ch345-fieldrow .ch345-value {
      color: #17243b;
      font-size: 13px;
    }

    .ch345-period {
      display: block;
      color: #17243b;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.45;
    }

    .ch345-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      margin-top: 8px;
    }

    .ch345-empty {
      display: block;
      width: 100%;
      padding: 30px 10px;
      color: #64748b;
      font-size: 12px;
      text-align: center;
    }

    .ch345-footer {
      flex: 0 0 auto;
      display: block;
      width: 100%;
      padding: 7px 30px 7px 11px;
      border-top: 1px solid #e5eaf1;
      background: #fbfdff;
      color: #64748b;
      font-size: 10px;
      line-height: 1.4;
    }

    .ch345-toast {
      position: absolute;
      right: 12px;
      bottom: 38px;
      padding: 8px 10px;
      border-radius: 9px;
      background: #17243b;
      color: #fff;
      font-size: 12px;
      opacity: 0;
      transition: opacity .15s;
      pointer-events: none;
      z-index: 4;
    }

    .ch345-toast.ch345-show {
      opacity: 1;
    }

    .ch345-resize {
      position: absolute;
      right: 2px;
      bottom: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: transparent;
      color: #64748b;
      font-size: 16px;
      cursor: nwse-resize;
      user-select: none;
      z-index: 5;
    }

    .ch345-resize:hover {
      background: #eef3f8;
      color: #155eef;
    }

    .ch345-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(15,23,42,.45);
      pointer-events: auto;
    }

    .ch345-modalbox {
      display: block;
      width: min(520px, 92vw);
      max-height: 88vh;
      padding: 14px;
      overflow-x: hidden;
      overflow-y: auto;
      background: #fff;
      color: #17243b;
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0,0,0,.34);
      pointer-events: auto;
    }

    .ch345-modal-title {
      display: block;
      margin: 0 0 10px;
      color: #17243b;
      font-size: 16px;
      font-weight: 700;
      line-height: 1.35;
    }

    .ch345-modal-body > div {
      display: block;
      width: 100%;
      margin: 0;
      padding: 0;
    }

    .ch345-modalbox label {
      display: block;
      margin: 9px 0 4px;
      color: #17243b;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.4;
    }

    .ch345-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 7px;
      width: 100%;
      margin-top: 12px;
    }
  `;

  shadow.appendChild(style);
  shadow.appendChild(wrap);

  const $ = selector => shadow.querySelector(selector);

  const shell = $('.ch345-shell');
  const rail = $('.ch345-rail');
  const panel = $('.ch345-panel');
  const title = $('.ch345-title');
  const tabs = $('.ch345-tabs');
  const toolbar = $('.ch345-toolbar');
  const content = $('.ch345-content');
  const search = $('.ch345-search');
  const toast = $('.ch345-toast');
  const modalOverlay = $('.ch345-modal-overlay');
  const modalBox = $('.ch345-modalbox');
  const modalTitle = $('.ch345-modal-title');
  const modalBody = $('.ch345-modal-body');
  const resizeHandle = $('.ch345-resize');

  // =========================================================
  // 事件隔离：避免招聘网站抢走 modal/input 事件
  // =========================================================

  ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup'].forEach(type => {
    modalOverlay.addEventListener(type, event => {
      event.stopPropagation();
    }, true);
  });

  modalOverlay.addEventListener('wheel', event => {
    event.stopPropagation();
  }, { capture: true, passive: true });

  function armEditable(element) {
    if (!element) return;

    element.addEventListener('pointerdown', event => {
      event.stopPropagation();
      element.focus({ preventScroll: true });
    });

    element.addEventListener('mousedown', event => {
      event.stopPropagation();
    });

    element.addEventListener('click', event => {
      event.stopPropagation();
      element.focus({ preventScroll: true });
    });
  }

  // =========================================================
  // 保存
  // =========================================================

  function saveDB() {
    db.updatedAt = Date.now();
    GM_setValue(DB_KEY, db);
  }

  function saveUI() {
    GM_setValue(UI_KEY, {
      categoryId: state.categoryId,
      cardId: state.cardId,
      left: state.left,
      top: state.top,
      width: state.width,
      height: state.height
    });
  }

  // =========================================================
  // 当前分类 / 卡片
  // =========================================================

  function currentCategory() {
    let category = db.categories.find(item => item.id === state.categoryId);

    if (!category) {
      category = db.categories[0] || null;
      state.categoryId = category?.id || '';
    }

    return category;
  }

  function currentCard() {
    const category = currentCategory();
    if (!category) return null;

    let card = category.cards.find(item => item.id === state.cardId);

    if (!card) {
      card = category.cards[0] || null;
      state.cardId = card?.id || '';
    }

    return card;
  }

  // =========================================================
  // 布局
  // =========================================================

  function applyLayout() {
    const reserved = DEF.rail + DEF.gap + 12;

    const maxLeft = Math.max(0, window.innerWidth - MIN_W - reserved);
    state.left = Math.max(0, Math.min(maxLeft, state.left));

    const maxTop = Math.max(0, window.innerHeight - 80);
    state.top = Math.max(0, Math.min(maxTop, state.top));

    const maxW = Math.max(MIN_W, window.innerWidth - state.left - reserved);
    const maxH = Math.max(MIN_H, window.innerHeight - state.top - 8);

    state.width = Math.max(MIN_W, Math.min(maxW, state.width));
    state.height = Math.max(MIN_H, Math.min(maxH, state.height));

    shell.style.left = `${state.left}px`;
    shell.style.top = `${state.top}px`;

    panel.style.width = `${state.width}px`;
    panel.style.height = `${state.height}px`;

    rail.style.left = `${state.width + DEF.gap}px`;
    rail.style.maxHeight = `${state.height}px`;
  }

  function resetLayout() {
    state.width = DEF.width;
    state.height = DEF.height;
    state.left = Math.max(
      8,
      window.innerWidth - state.width - DEF.rail - DEF.gap - 16
    );
    state.top = DEF.top;

    applyLayout();
    saveUI();
  }

  // =========================================================
  // Toast / Copy
  // =========================================================

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('ch345-show');

    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => {
      toast.classList.remove('ch345-show');
    }, 1200);
  }

  async function copy(value, label) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(str(value), 'text');
      } else {
        await navigator.clipboard.writeText(str(value));
      }

      notify(`已复制：${label}`);
    } catch (error) {
      console.error(error);
      notify('复制失败');
    }
  }

  // =========================================================
  // 通用组件
  // =========================================================

  function button(label, onClick, primary = false) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    if (primary) element.classList.add('ch345-primary');
    element.addEventListener('click', onClick);
    return element;
  }

  function control(label, value = '', type = 'input') {
    const field = document.createElement('div');
    const lab = document.createElement('label');

    const element = document.createElement(
      type === 'textarea'
        ? 'textarea'
        : type === 'select'
          ? 'select'
          : 'input'
    );

    lab.textContent = label;

    if (type !== 'select') {
      element.value = value;
    }

    armEditable(element);

    field.append(lab, element);

    return {
      wrap: field,
      element
    };
  }

  // =========================================================
  // Modal
  // =========================================================

  function openModal(name, body, onSave) {
    modalTitle.textContent = name;
    modalBody.replaceChildren(body);
    modalOverlay.style.display = 'flex';

    const saveBtn = $('.ch345-save');
    const cancelBtn = $('.ch345-cancel');

    saveBtn.onclick = event => {
      event.stopPropagation();
      if (onSave() !== false) closeModal();
    };

    cancelBtn.onclick = event => {
      event.stopPropagation();
      closeModal();
    };

    requestAnimationFrame(() => {
      const firstInput = modalBody.querySelector('input, textarea, select');
      if (firstInput) firstInput.focus({ preventScroll: true });
    });
  }

  function closeModal() {
    modalOverlay.style.display = 'none';
    $('.ch345-save').onclick = null;
    $('.ch345-cancel').onclick = null;
  }

  modalOverlay.addEventListener('click', event => {
    if (event.composedPath()[0] === modalOverlay) {
      closeModal();
    }
  });

  modalBox.addEventListener('click', event => {
    event.stopPropagation();
  });

  // =========================================================
  // 分类 CRUD
  // =========================================================

  function editCategory(target = null) {
    const box = document.createElement('div');

    const name = control('分类名称', target?.name || '');
    const shortName = control('侧栏短名', target?.shortName || '');

    box.append(name.wrap, shortName.wrap);

    openModal(
      target ? '编辑分类' : '新增分类',
      box,
      () => {
        const fullName = name.element.value.trim();
        const short = shortName.element.value.trim();

        if (!fullName) {
          alert('分类名称不能为空');
          return false;
        }

        if (target) {
          target.name = fullName;
          target.shortName = short || fullName.slice(0, 4);
        } else {
          const category = {
            id: uid('cat'),
            name: fullName,
            shortName: short || fullName.slice(0, 4),
            cards: []
          };

          db.categories.push(category);
          state.categoryId = category.id;
          state.cardId = '';
        }

        saveDB();
        saveUI();
        render();
        return true;
      }
    );
  }

  function deleteCategory() {
    const category = currentCategory();
    if (!category) return;

    if (db.categories.length <= 1) {
      alert('至少保留一个分类。');
      return;
    }

    if (!confirm(`确定删除分类「${category.name}」吗？\n其中 ${category.cards.length} 张卡片也会一并删除。`)) {
      return;
    }

    const index = db.categories.findIndex(item => item.id === category.id);
    db.categories.splice(index, 1);

    const next = db.categories[
      Math.min(index, db.categories.length - 1)
    ];

    state.categoryId = next.id;
    state.cardId = next.cards[0]?.id || '';

    saveDB();
    saveUI();
    render();
  }

  // =========================================================
  // 卡片 CRUD
  // =========================================================

  function editCard(target = null) {
    const category = currentCategory();
    if (!category) return;

    const box = document.createElement('div');

    const titleControl = control('卡片标题', target?.title || '');
    const shortControl = control('顶部按钮短名', target?.shortName || '');
    const subtitleControl = control('副标题（可选）', target?.subtitle || '');

    box.append(
      titleControl.wrap,
      shortControl.wrap,
      subtitleControl.wrap
    );

    openModal(
      target ? '编辑卡片' : '新增卡片',
      box,
      () => {
        const cardTitle = titleControl.element.value.trim();

        if (!cardTitle) {
          alert('卡片标题不能为空');
          return false;
        }

        if (target) {
          target.title = cardTitle;
          target.shortName = shortControl.element.value.trim() || cardTitle;
          target.subtitle = subtitleControl.element.value.trim();
        } else {
          const card = {
            id: uid('card'),
            title: cardTitle,
            shortName: shortControl.element.value.trim() || cardTitle,
            subtitle: subtitleControl.element.value.trim(),
            items: []
          };

          category.cards.push(card);
          state.cardId = card.id;
        }

        saveDB();
        saveUI();
        render();
        return true;
      }
    );
  }

  function deleteCard() {
    const category = currentCategory();
    const card = currentCard();

    if (!category || !card) return;

    if (!confirm(`确定删除卡片「${card.title}」及其全部字段吗？`)) {
      return;
    }

    const index = category.cards.findIndex(item => item.id === card.id);
    category.cards.splice(index, 1);

    state.cardId = category.cards[
      Math.min(index, category.cards.length - 1)
    ]?.id || '';

    saveDB();
    saveUI();
    render();
  }

  // =========================================================
  // 字段 CRUD
  // =========================================================

  function editItem(target = null, index = -1) {
    const card = currentCard();

    if (!card) {
      notify('请先添加卡片');
      return;
    }

    const box = document.createElement('div');

    const kind = control('类型', '', 'select');

    [
      ['field', '短字段'],
      ['text', '长文本'],
      ['period', '时间区间']
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      kind.element.appendChild(option);
    });

    kind.element.value = target?.kind || 'field';

    const labelControl = control('字段名称', target?.label || '');
    const valueControl = control('内容', target?.value || '', 'textarea');
    const startControl = control('开始时间', target?.start || '');
    const endControl = control('结束时间', target?.end || '');

    box.append(
      kind.wrap,
      labelControl.wrap,
      valueControl.wrap,
      startControl.wrap,
      endControl.wrap
    );

    function sync() {
      const isPeriod = kind.element.value === 'period';
      valueControl.wrap.style.display = isPeriod ? 'none' : '';
      startControl.wrap.style.display = isPeriod ? '' : 'none';
      endControl.wrap.style.display = isPeriod ? '' : 'none';
    }

    kind.element.addEventListener('change', sync);
    sync();

    openModal(
      target ? '编辑字段' : '新增字段',
      box,
      () => {
        const label = labelControl.element.value.trim();

        if (!label) {
          alert('字段名称不能为空');
          return false;
        }

        const item = {
          label,
          kind: kind.element.value
        };

        if (item.kind === 'period') {
          item.start = startControl.element.value.trim();
          item.end = endControl.element.value.trim();
        } else {
          item.value = valueControl.element.value;
        }

        if (target) {
          card.items[index] = item;
        } else {
          card.items.push(item);
        }

        saveDB();
        render();
        return true;
      }
    );
  }

  function deleteItem(index) {
    const card = currentCard();
    const item = card?.items[index];

    if (!item) return;

    if (!confirm(`确定删除「${item.label}」吗？`)) {
      return;
    }

    card.items.splice(index, 1);
    saveDB();
    render();
  }

  // =========================================================
  // Item 渲染
  // =========================================================

  function itemView(item, index, allowManage = true) {
    const box = document.createElement('section');

    box.className = `ch345-item${
      item.kind === 'text'
        ? ' ch345-textitem'
        : ''
    }`;

    box.dataset.index = String(index);
    box.draggable = Boolean(state.manage && allowManage);

    const labelRow = document.createElement('div');
    labelRow.className = 'ch345-labelrow';

    const label = document.createElement('div');
    label.className = 'ch345-label';
    label.textContent = item.label;
    labelRow.appendChild(label);

    if (state.manage && allowManage) {
      const handle = document.createElement('span');
      handle.className = 'ch345-handle';
      handle.textContent = '≡';
      labelRow.appendChild(handle);
    }

    box.appendChild(labelRow);

    if (item.kind === 'period') {
      const value = document.createElement('div');
      value.className = 'ch345-period';
      value.textContent = `${str(item.start)} — ${str(item.end)}`;
      box.appendChild(value);

      const actions = document.createElement('div');
      actions.className = 'ch345-actions';

      actions.append(
        button(
          '复制区间',
          () => copy(`${str(item.start)} — ${str(item.end)}`, item.label),
          true
        ),
        button('开始', () => copy(item.start, `${item.label} · 开始`)),
        button('结束', () => copy(item.end, `${item.label} · 结束`))
      );

      box.appendChild(actions);

    } else if (item.kind === 'field') {
      const row = document.createElement('div');
      row.className = 'ch345-fieldrow';

      const value = document.createElement('div');
      value.className = 'ch345-value';
      value.textContent = str(item.value);

      row.append(
        value,
        button('复制', () => copy(item.value, item.label), true)
      );

      box.appendChild(row);

    } else {
      const value = document.createElement('div');
      value.className = 'ch345-value';
      value.textContent = str(item.value);

      const needCut = str(item.value).length > 180;
      if (needCut) value.classList.add('ch345-cut');

      box.appendChild(value);

      const actions = document.createElement('div');
      actions.className = 'ch345-actions';
      actions.appendChild(
        button('复制整段', () => copy(item.value, item.label), true)
      );

      if (needCut) {
        const expand = button('展开', () => {
          const collapsed = value.classList.toggle('ch345-cut');
          expand.textContent = collapsed ? '展开' : '收起';
        });
        actions.appendChild(expand);
      }

      box.appendChild(actions);
    }

    if (state.manage && allowManage) {
      const actions = document.createElement('div');
      actions.className = 'ch345-actions';

      actions.append(
        button('编辑', () => editItem(item, index)),
        button('删除', () => deleteItem(index))
      );

      box.appendChild(actions);
    }

    return box;
  }

  // =========================================================
  // 分类栏
  // =========================================================

  function renderRail() {
    rail.replaceChildren();

    const toggle = button('☷', () => {
      state.open = !state.open;
      render();
    });

    toggle.className = 'ch345-toggle';
    toggle.title = '展开 / 收起';
    rail.appendChild(toggle);

    db.categories.forEach((category, index) => {
      const element = button(
        category.shortName || category.name,
        () => {
          if (state.open && state.categoryId === category.id) {
            state.open = false;
          } else {
            state.categoryId = category.id;
            state.cardId = category.cards[0]?.id || '';
            state.search = '';
            search.value = '';
            state.open = true;
            saveUI();
          }

          render();
        }
      );

      element.title = category.name;
      element.classList.toggle(
        'ch345-on',
        state.open && state.categoryId === category.id
      );

      element.draggable = state.manage;

      if (state.manage) {
        element.addEventListener('dragstart', event => {
          element.classList.add('ch345-dragging');
          event.dataTransfer.setData('text/category', String(index));
        });

        element.addEventListener('dragend', () => {
          element.classList.remove('ch345-dragging');
        });

        element.addEventListener('dragover', event => {
          event.preventDefault();
        });

        element.addEventListener('drop', event => {
          event.preventDefault();

          const from = Number(event.dataTransfer.getData('text/category'));
          if (!Number.isInteger(from) || from === index) return;

          const [moved] = db.categories.splice(from, 1);
          db.categories.splice(index, 0, moved);
          saveDB();
          render();
        });
      }

      rail.appendChild(element);
    });
  }

  // =========================================================
  // 卡片按钮
  // =========================================================

  function renderTabs() {
    tabs.replaceChildren();

    const category = currentCategory();
    if (!category) return;

    category.cards.forEach((card, index) => {
      const element = button(
        card.shortName || card.title,
        () => {
          state.cardId = card.id;
          state.search = '';
          search.value = '';
          saveUI();
          render();
        }
      );

      element.className = `ch345-tab${
        card.id === state.cardId
          ? ' ch345-on'
          : ''
      }`;

      element.title = card.title;
      element.draggable = state.manage;

      if (state.manage) {
        element.addEventListener('dragstart', event => {
          element.classList.add('ch345-dragging');
          event.dataTransfer.setData('text/card', String(index));
        });

        element.addEventListener('dragend', () => {
          element.classList.remove('ch345-dragging');
        });

        element.addEventListener('dragover', event => {
          event.preventDefault();
        });

        element.addEventListener('drop', event => {
          event.preventDefault();

          const from = Number(event.dataTransfer.getData('text/card'));
          if (!Number.isInteger(from) || from === index) return;

          const [moved] = category.cards.splice(from, 1);
          category.cards.splice(index, 0, moved);
          saveDB();
          render();
        });
      }

      tabs.appendChild(element);
    });
  }

  // =========================================================
  // 当前卡片
  // =========================================================

  function renderCard() {
    content.replaceChildren();

    const card = currentCard();

    if (!card) {
      const empty = document.createElement('div');
      empty.className = 'ch345-empty';
      empty.textContent = state.manage
        ? '这个分类还没有卡片，点“＋卡片”添加。'
        : '这个分类暂无资料。';
      content.appendChild(empty);
      return;
    }

    const head = document.createElement('div');
    head.className = 'ch345-cardhead';

    const titleElement = document.createElement('b');
    titleElement.textContent = card.title;
    head.appendChild(titleElement);

    if (card.subtitle) {
      const subtitle = document.createElement('div');
      subtitle.className = 'ch345-subtitle';
      subtitle.textContent = card.subtitle;
      head.appendChild(subtitle);
    }

    content.appendChild(head);

    card.items.forEach((item, index) => {
      content.appendChild(itemView(item, index, true));
    });

    if (!card.items.length) {
      const empty = document.createElement('div');
      empty.className = 'ch345-empty';
      empty.textContent = state.manage
        ? '这个卡片还没有字段，点“＋字段”添加。'
        : '这个卡片暂无内容。';
      content.appendChild(empty);
    }

    if (state.manage) {
      content.querySelectorAll('.ch345-item').forEach(element => {
        element.addEventListener('dragstart', event => {
          element.classList.add('ch345-dragging');
          event.dataTransfer.setData('text/item', element.dataset.index);
        });

        element.addEventListener('dragend', () => {
          element.classList.remove('ch345-dragging');
        });

        element.addEventListener('dragover', event => {
          event.preventDefault();
        });

        element.addEventListener('drop', event => {
          event.preventDefault();

          const from = Number(event.dataTransfer.getData('text/item'));
          const to = Number(element.dataset.index);

          if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) {
            return;
          }

          const [moved] = card.items.splice(from, 1);
          card.items.splice(to, 0, moved);
          saveDB();
          render();
        });
      });
    }
  }

  // =========================================================
  // 搜索
  // =========================================================

  function renderSearch(query) {
    content.replaceChildren();

    const category = currentCategory();
    if (!category) return;

    const needle = query.toLowerCase();
    let count = 0;

    category.cards.forEach(card => {
      const hits = card.items.filter(item =>
        [
          card.title,
          card.subtitle,
          item.label,
          item.value,
          item.start,
          item.end
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      );

      if (!hits.length) return;

      const head = document.createElement('div');
      head.className = 'ch345-cardhead';

      const titleElement = document.createElement('b');
      titleElement.textContent = card.title;
      head.appendChild(titleElement);
      content.appendChild(head);

      hits.forEach(item => {
        content.appendChild(itemView(item, -1, false));
        count++;
      });
    });

    if (!count) {
      const empty = document.createElement('div');
      empty.className = 'ch345-empty';
      empty.textContent = '当前分类没有匹配内容。';
      content.appendChild(empty);
    }
  }

  // =========================================================
  // 总渲染
  // =========================================================

  function render() {
    const category = currentCategory();
    currentCard();

    renderRail();

    title.textContent = `${category?.name || '资料库'}${
      state.manage
        ? ' · 管理模式'
        : ''
    }`;

    panel.style.display = state.open ? 'flex' : 'none';
    toolbar.style.display = state.manage ? 'flex' : 'none';
    $('.ch345-manage').textContent = state.manage ? '完成' : '管理';

    applyLayout();

    if (!state.open) return;

    renderTabs();

    if (state.search.trim()) {
      renderSearch(state.search.trim());
    } else {
      renderCard();
    }
  }

  // =========================================================
  // 主按钮
  // =========================================================

  $('.ch345-close').addEventListener('click', event => {
    event.stopPropagation();
    state.open = false;
    render();
  });

  $('.ch345-manage').addEventListener('click', event => {
    event.stopPropagation();
    state.manage = !state.manage;
    render();
  });

  search.addEventListener('input', event => {
    state.search = event.target.value || '';
    render();
  });

  $('.ch345-addcat').addEventListener('click', () => editCategory());
  $('.ch345-editcat').addEventListener('click', () => {
    const category = currentCategory();
    if (category) editCategory(category);
  });
  $('.ch345-delcat').addEventListener('click', deleteCategory);

  $('.ch345-addcard').addEventListener('click', () => editCard());
  $('.ch345-editcard').addEventListener('click', () => {
    const card = currentCard();
    if (card) editCard(card);
  });
  $('.ch345-delcard').addEventListener('click', deleteCard);

  $('.ch345-additem').addEventListener('click', () => editItem());

  $('.ch345-reset').addEventListener('click', () => {
    resetLayout();
    notify('布局已重置');
  });

  // =========================================================
  // 导出 / 导入
  // =========================================================

  $('.ch345-export').addEventListener('click', () => {
    const blob = new Blob(
      [JSON.stringify(db, null, 2)],
      { type: 'application/json;charset=utf-8' }
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `campus-helper-v345-${new Date().toISOString().slice(0, 10)}.json`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 20000);
    notify('已导出');
  });

  const fileInput = $('.ch345-file');

  $('.ch345-import').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    try {
      const raw = JSON.parse(await file.text());
      const next = normalize(raw) || migrateV32(raw);

      if (!next) {
        throw new Error('不支持的资料库格式');
      }

      if (!confirm('导入会覆盖当前资料库。确定继续吗？')) {
        return;
      }

      db = next;
      state.categoryId = db.categories[0]?.id || '';
      state.cardId = db.categories[0]?.cards[0]?.id || '';

      saveDB();
      saveUI();
      render();
      notify('导入完成');

    } catch (error) {
      alert(`导入失败：${error.message}`);
    }
  });

  // =========================================================
  // 拖动整个窗口
  // =========================================================

  (() => {
    const drag = $('.ch345-drag');

    let active = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    drag.addEventListener('pointerdown', event => {
      if (event.target.closest('button,input,textarea,select')) return;

      active = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = state.left;
      startTop = state.top;

      drag.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });

    drag.addEventListener('pointermove', event => {
      if (!active) return;

      state.left = startLeft + event.clientX - startX;
      state.top = startTop + event.clientY - startY;
      applyLayout();
    });

    function stop() {
      if (!active) return;
      active = false;
      saveUI();
    }

    drag.addEventListener('pointerup', stop);
    drag.addEventListener('pointercancel', stop);
  })();

  // =========================================================
  // 调整大小
  // =========================================================

  (() => {
    let active = false;
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    resizeHandle.addEventListener('pointerdown', event => {
      active = true;
      startX = event.clientX;
      startY = event.clientY;
      startW = state.width;
      startH = state.height;

      resizeHandle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });

    resizeHandle.addEventListener('pointermove', event => {
      if (!active) return;

      const maxW = Math.max(
        MIN_W,
        window.innerWidth - state.left - DEF.rail - DEF.gap - 12
      );

      const maxH = Math.max(
        MIN_H,
        window.innerHeight - state.top - 8
      );

      state.width = Math.max(
        MIN_W,
        Math.min(maxW, startW + event.clientX - startX)
      );

      state.height = Math.max(
        MIN_H,
        Math.min(maxH, startH + event.clientY - startY)
      );

      applyLayout();
    });

    function stop() {
      if (!active) return;
      active = false;
      saveUI();
    }

    resizeHandle.addEventListener('pointerup', stop);
    resizeHandle.addEventListener('pointercancel', stop);

    resizeHandle.addEventListener('dblclick', event => {
      event.preventDefault();
      event.stopPropagation();

      state.width = DEF.width;
      state.height = DEF.height;
      applyLayout();
      saveUI();
      notify('大小已恢复默认');
    });
  })();

  // =========================================================
  // ESC / 浏览器窗口变化
  // =========================================================

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;

    if (modalOverlay.style.display === 'flex') {
      closeModal();
      return;
    }

    if (state.open) {
      state.open = false;
      render();
    }
  }, true);

  window.addEventListener('resize', () => {
    applyLayout();
    saveUI();
  });

  // =========================================================
  // 初始化
  // =========================================================

  modalOverlay.style.display = 'none';
  toolbar.style.display = 'none';
  panel.style.display = 'none';

  applyLayout();
  render();

  console.log('[秋招网申资料库 v3.4.5] 已启动');
})();
