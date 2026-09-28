// ==UserScript==
// @name         秋招网申资料库 v3.4.2
// @namespace    campus-application-helper
// @version      3.4.2
// @description  分类/卡片/字段三级自定义；可移动、可缩放、拖拽排序；顶部卡片自动换行；强化样式隔离。
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

  const ROOT = 'campus-helper-v342';
  const STYLE = 'campus-helper-v342-style';
  const DB_KEY = 'campus-helper-v32-db';
  const UI_KEY = 'campus-helper-v342-ui';
  const OLD_UI_KEYS = ['campus-helper-v341-ui', 'campus-helper-v34-ui', 'campus-helper-v33-ui'];

  const DEF = { w: 450, h: 760, top: 64, gap: 8, rail: 56 };
  const MIN_W = 340;
  const MIN_H = 400;

  if (document.getElementById(ROOT)) return;

  const uid = p => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const txt = v => String(v ?? '');

  function baseDB() {
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

    const kind = ['field', 'text', 'period'].includes(item.kind) ? item.kind : 'field';

    if (kind === 'period') {
      return {
        label: txt(item.label),
        kind,
        start: txt(item.start),
        end: txt(item.end)
      };
    }

    return {
      label: txt(item.label),
      kind,
      value: txt(item.value)
    };
  }

  function cleanCard(card) {
    return {
      id: txt(card?.id) || uid('card'),
      title: txt(card?.title) || '未命名卡片',
      shortName: txt(card?.shortName || card?.title) || '卡片',
      subtitle: txt(card?.subtitle),
      items: Array.isArray(card?.items) ? card.items.map(cleanItem).filter(Boolean) : []
    };
  }

  function normalize(raw) {
    if (!raw || !Array.isArray(raw.categories) || !raw.categories.length) return null;

    return {
      version: 2,
      categories: raw.categories.map(category => ({
        id: txt(category.id) || uid('cat'),
        name: txt(category.name) || '未命名分类',
        shortName: txt(category.shortName || category.name) || '分类',
        cards: Array.isArray(category.cards) ? category.cards.map(cleanCard) : []
      })),
      updatedAt: Date.now()
    };
  }

  function migrate(raw) {
    if (!raw?.data) return null;

    const old = raw.data;
    const all = Object.values(old).flatMap(group => Array.isArray(group?.cards) ? group.cards : []);
    const byId = new Map(all.map(card => [card.id, card]));
    const used = new Set();
    const db = baseDB();
    const map = Object.fromEntries(db.categories.map(category => [category.id, category]));

    const take = ids => ids.flatMap(id => {
      const card = byId.get(id);
      if (!card) return [];
      used.add(card);
      return [cleanCard(card)];
    });

    map.basic.cards = take(['basic', 'job']);
    map.education.cards = take(['master', 'bachelor', 'highschool']);
    map.intern.cards = take(['uaes', 'zhida']);
    map.project.cards = take(['prism', 'checklist', 'deepresearch', 'robot']);
    map.skills.cards = take(['skills']);
    map.campus.cards = take(['campus', 'awards']);
    map.writing.cards = take(['self', 'advantage', 'career', 'hobby']);

    const remap = {
      basic: 'basic',
      education: 'education',
      intern: 'intern',
      project: 'project',
      writing: 'writing'
    };

    Object.entries(remap).forEach(([oldKey, newKey]) => {
      (old[oldKey]?.cards || []).forEach(card => {
        if (!used.has(card)) {
          map[newKey].cards.push(cleanCard(card));
          used.add(card);
        }
      });
    });

    const leftovers = all.filter(card => !used.has(card)).map(cleanCard);
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
    let raw = null;
    try {
      raw = GM_getValue(DB_KEY, null);
    } catch (_) {}

    const out = normalize(raw) || migrate(raw) || baseDB();

    try {
      GM_setValue(DB_KEY, out);
    } catch (_) {}

    return out;
  }

  let db = loadDB();

  const state = {
    open: false,
    manage: false,
    categoryId: db.categories[0]?.id || '',
    cardId: db.categories[0]?.cards[0]?.id || '',
    search: '',
    left: Math.max(8, window.innerWidth - DEF.w - DEF.rail - DEF.gap - 16),
    top: DEF.top,
    width: DEF.w,
    height: DEF.h
  };

  function readSavedUI() {
    const keys = [UI_KEY, ...OLD_UI_KEYS];
    for (const key of keys) {
      try {
        const saved = GM_getValue(key, null);
        if (saved && typeof saved === 'object') return saved;
      } catch (_) {}
    }
    return null;
  }

  const savedUI = readSavedUI();
  if (savedUI) {
    for (const key of ['categoryId', 'cardId']) {
      if (typeof savedUI[key] === 'string') state[key] = savedUI[key];
    }
    for (const key of ['left', 'top', 'width', 'height']) {
      if (Number.isFinite(savedUI[key])) state[key] = savedUI[key];
    }
  }

  const root = document.createElement('div');
  root.id = ROOT;
  root.innerHTML = `
    <div id="ch342-shell">
      <aside id="ch342-rail"></aside>

      <section id="ch342-panel" hidden>
        <header id="ch342-drag">
          <div class="ch342-topbar">
            <div class="ch342-titlebox">
              <b id="ch342-title"></b>
              <small>拖标题栏移动 · 右下角调整大小 · 点击复制后手动粘贴</small>
            </div>
            <div class="ch342-topactions">
              <button id="ch342-manage" type="button">管理</button>
              <button id="ch342-close" type="button">×</button>
            </div>
          </div>

          <input id="ch342-search" type="search" placeholder="搜索当前分类…" autocomplete="off">
        </header>

        <div id="ch342-tabs"></div>

        <div id="ch342-toolbar" hidden>
          <button id="ch342-addcat" type="button">＋分类</button>
          <button id="ch342-editcat" type="button">编辑分类</button>
          <button id="ch342-delcat" type="button">删除分类</button>
          <span class="ch342-divider"></span>
          <button id="ch342-addcard" type="button">＋卡片</button>
          <button id="ch342-editcard" type="button">编辑卡片</button>
          <button id="ch342-delcard" type="button">删除卡片</button>
          <button id="ch342-additem" type="button">＋字段</button>
          <span class="ch342-divider"></span>
          <button id="ch342-export" type="button">导出</button>
          <button id="ch342-import" type="button">导入</button>
          <button id="ch342-reset" type="button">重置布局</button>
          <input id="ch342-file" type="file" accept=".json,application/json" hidden>
        </div>

        <main id="ch342-content"></main>

        <footer id="ch342-footer">v3.4.2 · 样式隔离版 · 卡片自动换行</footer>
        <div id="ch342-toast"></div>
        <div id="ch342-resize" title="拖动调整大小；双击恢复默认大小">↘</div>
      </section>
    </div>

    <div id="ch342-modal" hidden>
      <div class="ch342-modalbox">
        <b id="ch342-modal-title"></b>
        <div id="ch342-modal-body"></div>
        <div class="ch342-modal-actions">
          <button id="ch342-cancel" type="button">取消</button>
          <button id="ch342-save" type="button" class="ch342-primary">保存</button>
        </div>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.id = STYLE;
  style.textContent = `
#${ROOT} {
  all: initial !important;
  position: fixed !important;
  inset: 0 !important;
  width: 0 !important;
  height: 0 !important;
  z-index: 2147483647 !important;
  pointer-events: none !important;
  color-scheme: light !important;
}

#${ROOT},
#${ROOT} * {
  box-sizing: border-box !important;
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", Arial, sans-serif !important;
  text-shadow: none !important;
  letter-spacing: normal !important;
  text-transform: none !important;
}

#${ROOT} #ch342-shell,
#${ROOT} #ch342-modal {
  pointer-events: auto !important;
}

#${ROOT} #ch342-shell {
  position: fixed !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  transform: none !important;
  z-index: 2147483647 !important;
}

#${ROOT} button {
  all: revert !important;
  box-sizing: border-box !important;
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", Arial, sans-serif !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  line-height: 1.2 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
  appearance: none !important;
  -webkit-appearance: none !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 5px 8px !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 8px !important;
  background: #fff !important;
  color: #334155 !important;
  box-shadow: none !important;
  cursor: pointer !important;
  white-space: nowrap !important;
  text-decoration: none !important;
  vertical-align: middle !important;
}

#${ROOT} button:hover {
  filter: brightness(.985) !important;
}

#${ROOT} button.ch342-primary {
  background: #155eef !important;
  border-color: #155eef !important;
  color: #fff !important;
}

#${ROOT} input,
#${ROOT} textarea,
#${ROOT} select {
  all: revert !important;
  box-sizing: border-box !important;
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", Arial, sans-serif !important;
  font-size: 12px !important;
  font-weight: 400 !important;
  line-height: 1.4 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
  appearance: none !important;
  -webkit-appearance: none !important;
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: none !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 7px 9px !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 8px !important;
  background: #fff !important;
  color: #17243b !important;
  box-shadow: none !important;
  outline: none !important;
}

#${ROOT} textarea {
  min-height: 130px !important;
  resize: vertical !important;
  white-space: pre-wrap !important;
}

#${ROOT} #ch342-file[hidden],
#${ROOT} #ch342-panel[hidden],
#${ROOT} #ch342-toolbar[hidden],
#${ROOT} #ch342-modal[hidden] {
  display: none !important;
}

#${ROOT} #ch342-rail {
  all: revert !important;
  box-sizing: border-box !important;
  position: absolute !important;
  top: 0 !important;
  width: ${DEF.rail}px !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 6px !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: stretch !important;
  gap: 5px !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  background: #f8fbff !important;
  border: 1px solid #d9e2ef !important;
  border-radius: 14px !important;
  box-shadow: 0 8px 28px #0f172a33 !important;
  transform: none !important;
}

#${ROOT} #ch342-rail button {
  width: 42px !important;
  height: auto !important;
  min-height: 40px !important;
  padding: 5px 2px !important;
  border: 0 !important;
  border-radius: 9px !important;
  background: transparent !important;
  color: #475569 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1.15 !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
}

#${ROOT} #ch342-rail button.ch342-toggle {
  font-size: 20px !important;
  color: #155eef !important;
}

#${ROOT} #ch342-rail button:hover {
  background: #e7eef9 !important;
}

#${ROOT} #ch342-rail button.ch342-on {
  background: #155eef !important;
  color: #fff !important;
}

#${ROOT} #ch342-panel {
  all: revert !important;
  box-sizing: border-box !important;
  position: relative !important;
  display: flex !important;
  flex-direction: column !important;
  width: auto !important;
  height: auto !important;
  min-width: ${MIN_W}px !important;
  min-height: ${MIN_H}px !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  background: #fff !important;
  color: #17243b !important;
  border: 1px solid #d9e2ef !important;
  border-radius: 15px !important;
  box-shadow: 0 16px 48px #0f172a42 !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
  transform: none !important;
}

#${ROOT} #ch342-drag {
  all: revert !important;
  box-sizing: border-box !important;
  position: static !important;
  display: block !important;
  width: auto !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 12px !important;
  border: 0 !important;
  border-bottom: 1px solid #e5eaf1 !important;
  background: #fff !important;
  color: #17243b !important;
  cursor: move !important;
  user-select: none !important;
  transform: none !important;
}

#${ROOT} .ch342-topbar {
  all: revert !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 10px !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}

#${ROOT} .ch342-titlebox {
  all: revert !important;
  box-sizing: border-box !important;
  min-width: 0 !important;
  flex: 1 1 auto !important;
}

#${ROOT} #ch342-title {
  all: revert !important;
  display: block !important;
  margin: 0 !important;
  padding: 0 !important;
  color: #17243b !important;
  font-size: 17px !important;
  font-weight: 700 !important;
  line-height: 1.3 !important;
}

#${ROOT} #ch342-drag small {
  all: revert !important;
  display: block !important;
  margin: 2px 0 0 !important;
  padding: 0 !important;
  color: #64748b !important;
  font-size: 11px !important;
  font-weight: 400 !important;
  line-height: 1.4 !important;
}

#${ROOT} .ch342-topactions {
  all: revert !important;
  display: flex !important;
  flex: 0 0 auto !important;
  gap: 5px !important;
  margin: 0 !important;
  padding: 0 !important;
}

#${ROOT} #ch342-search {
  margin-top: 10px !important;
  height: 35px !important;
}

#${ROOT} #ch342-tabs {
  all: revert !important;
  box-sizing: border-box !important;
  position: static !important;
  display: flex !important;
  flex-wrap: wrap !important;
  align-content: flex-start !important;
  align-items: flex-start !important;
  justify-content: flex-start !important;
  gap: 6px !important;
  width: 100% !important;
  height: auto !important;
  min-height: 48px !important;
  max-height: 130px !important;
  margin: 0 !important;
  padding: 9px 10px !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  border: 0 !important;
  border-bottom: 1px solid #e5eaf1 !important;
  background: #fbfdff !important;
  transform: none !important;
}

#${ROOT} .ch342-tab {
  flex: 0 0 auto !important;
  max-width: 100% !important;
  min-height: 0 !important;
  height: auto !important;
  padding: 6px 10px !important;
  border-radius: 999px !important;
  font-size: 11px !important;
  white-space: nowrap !important;
}

#${ROOT} .ch342-tab.ch342-on {
  background: #17243b !important;
  border-color: #17243b !important;
  color: #fff !important;
}

#${ROOT} #ch342-toolbar {
  all: revert !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 5px !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 8px 10px !important;
  border: 0 !important;
  border-bottom: 1px solid #e5eaf1 !important;
  background: #f8fafc !important;
}

#${ROOT} .ch342-divider {
  display: block !important;
  flex: 0 0 1px !important;
  align-self: stretch !important;
  width: 1px !important;
  min-height: 24px !important;
  margin: 2px !important;
  background: #d8dee8 !important;
}

#${ROOT} #ch342-content {
  all: revert !important;
  box-sizing: border-box !important;
  position: static !important;
  display: block !important;
  flex: 1 1 auto !important;
  width: 100% !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 11px !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  background: #fff !important;
  color: #17243b !important;
  border: 0 !important;
  transform: none !important;
}

#${ROOT} .ch342-cardhead {
  all: revert !important;
  box-sizing: border-box !important;
  display: block !important;
  position: static !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 0 10px !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  transform: none !important;
}

#${ROOT} .ch342-cardhead > b {
  all: revert !important;
  display: block !important;
  margin: 0 !important;
  padding: 0 !important;
  color: #17243b !important;
  font-size: 15px !important;
  font-weight: 700 !important;
  line-height: 1.35 !important;
}

#${ROOT} .ch342-subtitle {
  all: revert !important;
  display: block !important;
  margin: 2px 0 0 !important;
  padding: 0 !important;
  color: #64748b !important;
  font-size: 11px !important;
  font-weight: 400 !important;
  line-height: 1.4 !important;
}

#${ROOT} .ch342-item {
  all: revert !important;
  box-sizing: border-box !important;
  position: static !important;
  float: none !important;
  display: block !important;
  width: 100% !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 0 9px !important;
  padding: 10px !important;
  overflow: visible !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 10px !important;
  background: #fff !important;
  color: #17243b !important;
  box-shadow: none !important;
  transform: none !important;
}

#${ROOT} .ch342-item.ch342-textitem {
  background: #fbfdff !important;
}

#${ROOT} .ch342-dragging {
  opacity: .4 !important;
}

#${ROOT} .ch342-labelrow {
  all: revert !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: flex-start !important;
  justify-content: space-between !important;
  gap: 8px !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 0 5px !important;
  padding: 0 !important;
}

#${ROOT} .ch342-label {
  all: revert !important;
  box-sizing: border-box !important;
  display: block !important;
  flex: 1 1 auto !important;
  min-width: 0 !important;
  width: auto !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  color: #334155 !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
  white-space: normal !important;
}

#${ROOT} .ch342-handle {
  all: revert !important;
  display: block !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
  padding: 0 !important;
  color: #94a3b8 !important;
  font-size: 16px !important;
  line-height: 1 !important;
  cursor: grab !important;
}

#${ROOT} .ch342-value {
  all: revert !important;
  box-sizing: border-box !important;
  position: static !important;
  display: block !important;
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow-wrap: anywhere !important;
  white-space: pre-wrap !important;
  color: #475569 !important;
  font-size: 12px !important;
  font-weight: 400 !important;
  line-height: 1.65 !important;
  user-select: text !important;
  transform: none !important;
}

#${ROOT} .ch342-value.ch342-cut {
  max-height: 112px !important;
  overflow: hidden !important;
}

#${ROOT} .ch342-fieldrow {
  all: revert !important;
  box-sizing: border-box !important;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto !important;
  align-items: center !important;
  gap: 8px !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}

#${ROOT} .ch342-fieldrow .ch342-value {
  color: #17243b !important;
  font-size: 13px !important;
}

#${ROOT} .ch342-period {
  all: revert !important;
  display: block !important;
  width: auto !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  color: #17243b !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  line-height: 1.45 !important;
}

#${ROOT} .ch342-actions {
  all: revert !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  gap: 5px !important;
  width: auto !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 8px 0 0 !important;
  padding: 0 !important;
}

#${ROOT} .ch342-empty {
  all: revert !important;
  box-sizing: border-box !important;
  display: block !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 30px 10px !important;
  color: #64748b !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
  text-align: center !important;
}

#${ROOT} #ch342-footer {
  all: revert !important;
  box-sizing: border-box !important;
  display: block !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 7px 30px 7px 11px !important;
  border: 0 !important;
  border-top: 1px solid #e5eaf1 !important;
  background: #fbfdff !important;
  color: #64748b !important;
  font-size: 10px !important;
  font-weight: 400 !important;
  line-height: 1.4 !important;
}

#${ROOT} #ch342-toast {
  all: revert !important;
  box-sizing: border-box !important;
  position: absolute !important;
  right: 12px !important;
  bottom: 38px !important;
  display: block !important;
  width: auto !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 8px 10px !important;
  border: 0 !important;
  border-radius: 9px !important;
  background: #17243b !important;
  color: #fff !important;
  font-size: 12px !important;
  line-height: 1.4 !important;
  opacity: 0 !important;
  transition: opacity .15s !important;
  pointer-events: none !important;
  z-index: 4 !important;
}

#${ROOT} #ch342-toast.ch342-show {
  opacity: 1 !important;
}

#${ROOT} #ch342-resize {
  all: revert !important;
  box-sizing: border-box !important;
  position: absolute !important;
  right: 2px !important;
  bottom: 2px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 22px !important;
  height: 22px !important;
  min-width: 22px !important;
  min-height: 22px !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 6px !important;
  background: transparent !important;
  color: #64748b !important;
  font-size: 16px !important;
  line-height: 1 !important;
  cursor: nwse-resize !important;
  user-select: none !important;
  z-index: 5 !important;
}

#${ROOT} #ch342-resize:hover {
  background: #eef3f8 !important;
  color: #155eef !important;
}

#${ROOT} #ch342-modal {
  all: revert !important;
  box-sizing: border-box !important;
  position: fixed !important;
  inset: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: auto !important;
  height: auto !important;
  margin: 0 !important;
  padding: 0 !important;
  background: #0f172a55 !important;
  z-index: 2147483647 !important;
}

#${ROOT} .ch342-modalbox {
  all: revert !important;
  box-sizing: border-box !important;
  display: block !important;
  width: min(520px, 92vw) !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: 88vh !important;
  margin: 0 !important;
  padding: 14px !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  background: #fff !important;
  color: #17243b !important;
  border: 0 !important;
  border-radius: 14px !important;
  box-shadow: 0 20px 60px #0005 !important;
  transform: none !important;
}

#${ROOT} #ch342-modal-title {
  all: revert !important;
  display: block !important;
  margin: 0 0 10px !important;
  padding: 0 !important;
  color: #17243b !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  line-height: 1.35 !important;
}

#${ROOT} #ch342-modal-body > div {
  all: revert !important;
  box-sizing: border-box !important;
  display: block !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}

#${ROOT} .ch342-modalbox label {
  all: revert !important;
  display: block !important;
  margin: 9px 0 4px !important;
  padding: 0 !important;
  color: #17243b !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
}

#${ROOT} .ch342-modal-actions {
  all: revert !important;
  display: flex !important;
  justify-content: flex-end !important;
  gap: 7px !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 12px 0 0 !important;
  padding: 0 !important;
}
`;

  (document.head || document.documentElement).appendChild(style);
  (document.body || document.documentElement).appendChild(root);

  const $ = selector => root.querySelector(selector);

  const shell = $('#ch342-shell');
  const rail = $('#ch342-rail');
  const panel = $('#ch342-panel');
  const title = $('#ch342-title');
  const tabs = $('#ch342-tabs');
  const toolbar = $('#ch342-toolbar');
  const content = $('#ch342-content');
  const search = $('#ch342-search');
  const toast = $('#ch342-toast');
  const modal = $('#ch342-modal');
  const modalTitle = $('#ch342-modal-title');
  const modalBody = $('#ch342-modal-body');
  const resizeHandle = $('#ch342-resize');

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

  function applyLayout() {
    const reserved = DEF.rail + DEF.gap + 12;

    state.left = Math.max(
      0,
      Math.min(
        Math.max(0, window.innerWidth - MIN_W - reserved),
        state.left
      )
    );

    state.top = Math.max(
      0,
      Math.min(
        Math.max(0, window.innerHeight - 80),
        state.top
      )
    );

    state.width = Math.max(
      MIN_W,
      Math.min(
        Math.max(MIN_W, window.innerWidth - state.left - reserved),
        state.width
      )
    );

    state.height = Math.max(
      MIN_H,
      Math.min(
        Math.max(MIN_H, window.innerHeight - state.top - 8),
        state.height
      )
    );

    shell.style.setProperty('left', `${state.left}px`, 'important');
    shell.style.setProperty('top', `${state.top}px`, 'important');
    panel.style.setProperty('width', `${state.width}px`, 'important');
    panel.style.setProperty('height', `${state.height}px`, 'important');
    rail.style.setProperty('left', `${state.width + DEF.gap}px`, 'important');
    rail.style.setProperty('max-height', `${state.height}px`, 'important');
  }

  function resetLayout(resetPosition = true, resetSize = true) {
    if (resetSize) {
      state.width = DEF.w;
      state.height = DEF.h;
    }

    if (resetPosition) {
      state.left = Math.max(
        8,
        window.innerWidth - state.width - DEF.rail - DEF.gap - 16
      );
      state.top = DEF.top;
    }

    applyLayout();
    saveUI();
  }

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('ch342-show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('ch342-show'), 1200);
  }

  async function copy(value, label) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(txt(value), 'text');
      } else {
        await navigator.clipboard.writeText(txt(value));
      }
      notify(`已复制：${label}`);
    } catch (error) {
      console.error(error);
      notify('复制失败');
    }
  }

  function button(label, fn, primary = false) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    if (primary) element.classList.add('ch342-primary');
    element.onclick = fn;
    return element;
  }

  function control(label, value = '', type = 'input') {
    const wrap = document.createElement('div');
    const labelElement = document.createElement('label');
    const element = document.createElement(
      type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input'
    );

    labelElement.textContent = label;
    if (type !== 'select') element.value = value;
    wrap.append(labelElement, element);

    return { wrap, element };
  }

  function openModal(name, body, onSave) {
    modalTitle.textContent = name;
    modalBody.replaceChildren(body);
    modal.hidden = false;

    $('#ch342-save').onclick = () => {
      if (onSave() !== false) closeModal();
    };
  }

  function closeModal() {
    modal.hidden = true;
    $('#ch342-save').onclick = null;
  }

  $('#ch342-cancel').onclick = closeModal;

  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal();
  });

  function editCategory(target = null) {
    const box = document.createElement('div');
    const name = control('分类名称', target?.name || '');
    const shortName = control('侧栏短名', target?.shortName || '');
    box.append(name.wrap, shortName.wrap);

    openModal(target ? '编辑分类' : '新增分类', box, () => {
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
    });
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

    const next = db.categories[Math.min(index, db.categories.length - 1)];
    state.categoryId = next.id;
    state.cardId = next.cards[0]?.id || '';

    saveDB();
    saveUI();
    render();
  }

  function editCard(target = null) {
    const category = currentCategory();
    if (!category) return;

    const box = document.createElement('div');
    const titleControl = control('卡片标题', target?.title || '');
    const shortControl = control('顶部按钮短名', target?.shortName || '');
    const subtitleControl = control('副标题（可选）', target?.subtitle || '');
    box.append(titleControl.wrap, shortControl.wrap, subtitleControl.wrap);

    openModal(target ? '编辑卡片' : '新增卡片', box, () => {
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
    });
  }

  function deleteCard() {
    const category = currentCategory();
    const card = currentCard();

    if (!category || !card) return;

    if (!confirm(`确定删除卡片「${card.title}」及其全部字段吗？`)) return;

    const index = category.cards.findIndex(item => item.id === card.id);
    category.cards.splice(index, 1);
    state.cardId = category.cards[Math.min(index, category.cards.length - 1)]?.id || '';

    saveDB();
    saveUI();
    render();
  }

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

    kind.element.onchange = sync;
    sync();

    openModal(target ? '编辑字段' : '新增字段', box, () => {
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

      if (target) card.items[index] = item;
      else card.items.push(item);

      saveDB();
      render();
      return true;
    });
  }

  function deleteItem(index) {
    const card = currentCard();
    const item = card?.items[index];

    if (!item) return;
    if (!confirm(`确定删除「${item.label}」吗？`)) return;

    card.items.splice(index, 1);
    saveDB();
    render();
  }

  function itemView(item, index, allowManage = true) {
    const box = document.createElement('section');
    box.className = `ch342-item${item.kind === 'text' ? ' ch342-textitem' : ''}`;
    box.dataset.index = String(index);
    box.draggable = Boolean(state.manage && allowManage);

    const labelRow = document.createElement('div');
    labelRow.className = 'ch342-labelrow';

    const label = document.createElement('div');
    label.className = 'ch342-label';
    label.textContent = item.label;
    labelRow.appendChild(label);

    if (state.manage && allowManage) {
      const handle = document.createElement('span');
      handle.className = 'ch342-handle';
      handle.textContent = '≡';
      labelRow.appendChild(handle);
    }

    box.appendChild(labelRow);

    if (item.kind === 'period') {
      const value = document.createElement('div');
      value.className = 'ch342-period';
      value.textContent = `${txt(item.start)} — ${txt(item.end)}`;
      box.appendChild(value);

      const actions = document.createElement('div');
      actions.className = 'ch342-actions';
      actions.append(
        button('复制区间', () => copy(`${txt(item.start)} — ${txt(item.end)}`, item.label), true),
        button('开始', () => copy(item.start, `${item.label} · 开始`)),
        button('结束', () => copy(item.end, `${item.label} · 结束`))
      );
      box.appendChild(actions);
    } else if (item.kind === 'field') {
      const row = document.createElement('div');
      row.className = 'ch342-fieldrow';

      const value = document.createElement('div');
      value.className = 'ch342-value';
      value.textContent = txt(item.value);

      row.append(
        value,
        button('复制', () => copy(item.value, item.label), true)
      );
      box.appendChild(row);
    } else {
      const value = document.createElement('div');
      value.className = 'ch342-value';
      value.textContent = txt(item.value);

      const needCut = txt(item.value).length > 180;
      if (needCut) value.classList.add('ch342-cut');

      box.appendChild(value);

      const actions = document.createElement('div');
      actions.className = 'ch342-actions';
      actions.appendChild(
        button('复制整段', () => copy(item.value, item.label), true)
      );

      if (needCut) {
        const expand = button('展开', () => {
          const collapsed = value.classList.toggle('ch342-cut');
          expand.textContent = collapsed ? '展开' : '收起';
        });
        actions.appendChild(expand);
      }

      box.appendChild(actions);
    }

    if (state.manage && allowManage) {
      const actions = document.createElement('div');
      actions.className = 'ch342-actions';
      actions.append(
        button('编辑', () => editItem(item, index)),
        button('删除', () => deleteItem(index))
      );
      box.appendChild(actions);
    }

    return box;
  }

  function renderRail() {
    rail.replaceChildren();

    const toggle = button('☷', () => {
      state.open = !state.open;
      render();
    });
    toggle.className = 'ch342-toggle';
    toggle.title = '展开 / 收起';
    rail.appendChild(toggle);

    db.categories.forEach((category, index) => {
      const element = button(category.shortName || category.name, () => {
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
      });

      element.title = category.name;
      element.classList.toggle('ch342-on', state.open && state.categoryId === category.id);
      element.draggable = state.manage;

      if (state.manage) {
        element.ondragstart = event => {
          element.classList.add('ch342-dragging');
          event.dataTransfer.setData('text/category', String(index));
        };
        element.ondragend = () => element.classList.remove('ch342-dragging');
        element.ondragover = event => event.preventDefault();
        element.ondrop = event => {
          event.preventDefault();
          const from = Number(event.dataTransfer.getData('text/category'));
          if (Number.isInteger(from) && from !== index) {
            const [moved] = db.categories.splice(from, 1);
            db.categories.splice(index, 0, moved);
            saveDB();
            render();
          }
        };
      }

      rail.appendChild(element);
    });
  }

  function renderTabs() {
    tabs.replaceChildren();
    const category = currentCategory();
    if (!category) return;

    category.cards.forEach((card, index) => {
      const element = button(card.shortName || card.title, () => {
        state.cardId = card.id;
        state.search = '';
        search.value = '';
        saveUI();
        render();
      });

      element.className = `ch342-tab${card.id === state.cardId ? ' ch342-on' : ''}`;
      element.title = card.title;
      element.draggable = state.manage;

      if (state.manage) {
        element.ondragstart = event => {
          element.classList.add('ch342-dragging');
          event.dataTransfer.setData('text/card', String(index));
        };
        element.ondragend = () => element.classList.remove('ch342-dragging');
        element.ondragover = event => event.preventDefault();
        element.ondrop = event => {
          event.preventDefault();
          const from = Number(event.dataTransfer.getData('text/card'));
          if (Number.isInteger(from) && from !== index) {
            const [moved] = category.cards.splice(from, 1);
            category.cards.splice(index, 0, moved);
            saveDB();
            render();
          }
        };
      }

      tabs.appendChild(element);
    });
  }

  function renderCard() {
    content.replaceChildren();
    const card = currentCard();

    if (!card) {
      const empty = document.createElement('div');
      empty.className = 'ch342-empty';
      empty.textContent = state.manage
        ? '这个分类还没有卡片，点“＋卡片”添加。'
        : '这个分类暂无资料。';
      content.appendChild(empty);
      return;
    }

    const head = document.createElement('div');
    head.className = 'ch342-cardhead';

    const cardTitle = document.createElement('b');
    cardTitle.textContent = card.title;
    head.appendChild(cardTitle);

    if (card.subtitle) {
      const subtitle = document.createElement('div');
      subtitle.className = 'ch342-subtitle';
      subtitle.textContent = card.subtitle;
      head.appendChild(subtitle);
    }

    content.appendChild(head);

    card.items.forEach((item, index) => {
      content.appendChild(itemView(item, index, true));
    });

    if (!card.items.length) {
      const empty = document.createElement('div');
      empty.className = 'ch342-empty';
      empty.textContent = state.manage
        ? '这个卡片还没有字段，点“＋字段”添加。'
        : '这个卡片暂无内容。';
      content.appendChild(empty);
    }

    if (state.manage) {
      content.querySelectorAll('.ch342-item').forEach(element => {
        element.ondragstart = event => {
          element.classList.add('ch342-dragging');
          event.dataTransfer.setData('text/item', element.dataset.index);
        };
        element.ondragend = () => element.classList.remove('ch342-dragging');
        element.ondragover = event => event.preventDefault();
        element.ondrop = event => {
          event.preventDefault();
          const from = Number(event.dataTransfer.getData('text/item'));
          const to = Number(element.dataset.index);

          if (Number.isInteger(from) && Number.isInteger(to) && from !== to) {
            const [moved] = card.items.splice(from, 1);
            card.items.splice(to, 0, moved);
            saveDB();
            render();
          }
        };
      });
    }
  }

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
      head.className = 'ch342-cardhead';

      const cardTitle = document.createElement('b');
      cardTitle.textContent = card.title;
      head.appendChild(cardTitle);
      content.appendChild(head);

      hits.forEach(item => {
        content.appendChild(itemView(item, -1, false));
        count++;
      });
    });

    if (!count) {
      const empty = document.createElement('div');
      empty.className = 'ch342-empty';
      empty.textContent = '当前分类没有匹配内容。';
      content.appendChild(empty);
    }
  }

  function render() {
    const category = currentCategory();
    currentCard();
    renderRail();

    title.textContent = `${category?.name || '资料库'}${state.manage ? ' · 管理模式' : ''}`;
    panel.hidden = !state.open;
    toolbar.hidden = !state.manage;
    $('#ch342-manage').textContent = state.manage ? '完成' : '管理';

    applyLayout();

    if (!state.open) return;

    renderTabs();
    state.search.trim() ? renderSearch(state.search.trim()) : renderCard();
  }

  $('#ch342-close').onclick = () => {
    state.open = false;
    render();
  };

  $('#ch342-manage').onclick = () => {
    state.manage = !state.manage;
    render();
  };

  search.oninput = event => {
    state.search = event.target.value || '';
    render();
  };

  $('#ch342-addcat').onclick = () => editCategory();
  $('#ch342-editcat').onclick = () => {
    const category = currentCategory();
    if (category) editCategory(category);
  };
  $('#ch342-delcat').onclick = deleteCategory;

  $('#ch342-addcard').onclick = () => editCard();
  $('#ch342-editcard').onclick = () => {
    const card = currentCard();
    if (card) editCard(card);
  };
  $('#ch342-delcard').onclick = deleteCard;

  $('#ch342-additem').onclick = () => editItem();

  $('#ch342-export').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], {
      type: 'application/json;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `campus-helper-v342-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    notify('已导出');
  };

  $('#ch342-import').onclick = () => $('#ch342-file').click();

  $('#ch342-file').onchange = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const raw = JSON.parse(await file.text());
      const next = normalize(raw) || migrate(raw);

      if (!next) throw new Error('不支持的资料库格式');
      if (!confirm('导入会覆盖当前资料库。确定继续吗？')) return;

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
  };

  $('#ch342-reset').onclick = () => {
    resetLayout(true, true);
    notify('布局已重置');
  };

  // 拖动窗口
  (() => {
    const drag = $('#ch342-drag');
    let active = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    drag.onpointerdown = event => {
      if (event.target.closest('button,input')) return;

      active = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = state.left;
      startTop = state.top;
      drag.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    drag.onpointermove = event => {
      if (!active) return;
      state.left = startLeft + event.clientX - startX;
      state.top = startTop + event.clientY - startY;
      applyLayout();
    };

    const stop = () => {
      if (!active) return;
      active = false;
      saveUI();
    };

    drag.onpointerup = stop;
    drag.onpointercancel = stop;
  })();

  // 调整大小
  (() => {
    let active = false;
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    resizeHandle.onpointerdown = event => {
      active = true;
      startX = event.clientX;
      startY = event.clientY;
      startW = state.width;
      startH = state.height;
      resizeHandle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };

    resizeHandle.onpointermove = event => {
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
    };

    const stop = () => {
      if (!active) return;
      active = false;
      saveUI();
    };

    resizeHandle.onpointerup = stop;
    resizeHandle.onpointercancel = stop;

    resizeHandle.ondblclick = event => {
      event.preventDefault();
      state.width = DEF.w;
      state.height = DEF.h;
      applyLayout();
      saveUI();
      notify('大小已恢复默认');
    };
  })();

  document.addEventListener(
    'keydown',
    event => {
      if (event.key !== 'Escape') return;

      if (!modal.hidden) {
        closeModal();
      } else if (state.open) {
        state.open = false;
        render();
      }
    },
    true
  );

  window.addEventListener('resize', () => {
    applyLayout();
    saveUI();
  });

  applyLayout();
  render();

  console.log('[秋招网申资料库 v3.4.2] 已启动');
})();
