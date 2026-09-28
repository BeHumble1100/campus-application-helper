// ==UserScript==
// @name         秋招网申资料库 v3.4
// @namespace    campus-application-helper
// @version      3.4.0
// @description  分类/卡片/字段三级自定义；界面可移动、可缩放、拖拽排序；JSON 导入导出。
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

  const ROOT = 'campus-helper-v34';
  const STYLE = 'campus-helper-v34-style';
  const DB_KEY = 'campus-helper-v32-db';
  const UI_KEY = 'campus-helper-v34-ui';

  const DEFAULT_LAYOUT = {
    width: 450,
    height: 760,
    top: 64,
    gap: 8,
    railWidth: 56
  };

  const MIN_W = 340;
  const MIN_H = 400;

  if (document.getElementById(ROOT)) return;

  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const text = value => String(value ?? '');
  const clone = value => JSON.parse(JSON.stringify(value));

  function cleanItem(item) {
    if (!item || typeof item !== 'object') return null;
    if (item.kind === 'note') return null;
    const kind = ['field', 'text', 'period'].includes(item.kind) ? item.kind : 'field';
    if (kind === 'period') {
      return {
        label: text(item.label),
        kind,
        start: text(item.start),
        end: text(item.end)
      };
    }
    return {
      label: text(item.label),
      kind,
      value: text(item.value)
    };
  }

  function cleanCard(card) {
    return {
      id: text(card?.id) || uid('card'),
      title: text(card?.title) || '未命名卡片',
      shortName: text(card?.shortName || card?.title) || '卡片',
      subtitle: text(card?.subtitle),
      items: Array.isArray(card?.items) ? card.items.map(cleanItem).filter(Boolean) : []
    };
  }

  function emptyDB() {
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

  function normalizeV33(raw) {
    if (!raw || !Array.isArray(raw.categories) || !raw.categories.length) return null;
    return {
      version: 2,
      categories: raw.categories.map(category => ({
        id: text(category.id) || uid('cat'),
        name: text(category.name) || '未命名分类',
        shortName: text(category.shortName || category.name) || '分类',
        cards: Array.isArray(category.cards) ? category.cards.map(cleanCard) : []
      })),
      updatedAt: Date.now()
    };
  }

  function migrateV32(raw) {
    if (!raw || !raw.data) return null;

    const old = raw.data;
    const allCards = Object.values(old).flatMap(group => Array.isArray(group?.cards) ? group.cards : []);
    const byId = new Map(allCards.map(card => [card.id, card]));
    const used = new Set();

    function take(ids) {
      const result = [];
      ids.forEach(id => {
        const card = byId.get(id);
        if (card) {
          result.push(cleanCard(card));
          used.add(card);
        }
      });
      return result;
    }

    const db = emptyDB();
    const map = Object.fromEntries(db.categories.map(category => [category.id, category]));

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
        if (!used.has(card)) {
          map[newKey].cards.push(cleanCard(card));
          used.add(card);
        }
      });
    });

    const leftovers = allCards.filter(card => !used.has(card)).map(cleanCard);
    if (leftovers.length) {
      db.categories.push({ id: uid('cat'), name: '其他资料', shortName: '其他', cards: leftovers });
    }

    return db;
  }

  function loadDB() {
    let raw = null;
    try { raw = GM_getValue(DB_KEY, null); } catch (_) {}
    const db = normalizeV33(raw) || migrateV32(raw) || emptyDB();
    try { GM_setValue(DB_KEY, db); } catch (_) {}
    return db;
  }

  let db = loadDB();

  const state = {
    open: false,
    manage: false,
    categoryId: db.categories[0]?.id || '',
    cardId: db.categories[0]?.cards[0]?.id || '',
    search: '',
    left: Math.max(8, innerWidth - DEFAULT_LAYOUT.width - DEFAULT_LAYOUT.railWidth - DEFAULT_LAYOUT.gap - 16),
    top: DEFAULT_LAYOUT.top,
    width: DEFAULT_LAYOUT.width,
    height: DEFAULT_LAYOUT.height
  };

  try {
    const saved = GM_getValue(UI_KEY, null);
    if (saved && typeof saved === 'object') {
      if (typeof saved.categoryId === 'string') state.categoryId = saved.categoryId;
      if (typeof saved.cardId === 'string') state.cardId = saved.cardId;
      if (Number.isFinite(saved.left)) state.left = saved.left;
      if (Number.isFinite(saved.top)) state.top = saved.top;
      if (Number.isFinite(saved.width)) state.width = saved.width;
      if (Number.isFinite(saved.height)) state.height = saved.height;
    }
  } catch (_) {}

  const root = document.createElement('div');
  root.id = ROOT;
  root.innerHTML = `
    <div id="ch34shell">
      <aside id="ch34rail"></aside>
      <section id="ch34panel" hidden>
        <header id="ch34drag">
          <div class="ch34top">
            <div>
              <b id="ch34title"></b>
              <small>拖动标题栏移动 · 右下角调整大小 · 点击复制后手动粘贴</small>
            </div>
            <div class="ch34topa">
              <button id="ch34manage">管理</button>
              <button id="ch34close">×</button>
            </div>
          </div>
          <input id="ch34search" type="search" placeholder="搜索当前分类…" autocomplete="off">
        </header>

        <div id="ch34tabs"></div>

        <div id="ch34bar" hidden>
          <button id="ch34addcat">＋分类</button>
          <button id="ch34editcat">编辑分类</button>
          <button id="ch34delcat">删除分类</button>
          <i></i>
          <button id="ch34addcard">＋卡片</button>
          <button id="ch34editcard">编辑卡片</button>
          <button id="ch34delcard">删除卡片</button>
          <button id="ch34additem">＋字段</button>
          <i></i>
          <button id="ch34export">导出</button>
          <button id="ch34import">导入</button>
          <button id="ch34reset">重置布局</button>
          <input id="ch34file" type="file" accept=".json,application/json" hidden>
        </div>

        <main id="ch34content"></main>
        <footer>v3.4 · 分类 / 卡片 / 字段均可自定义 · 界面可移动 / 可缩放</footer>
        <div id="ch34toast"></div>
        <div id="ch34resize" title="拖动调整大小；双击恢复默认大小">↘</div>
      </section>
    </div>

    <div id="ch34modal" hidden>
      <div class="ch34modal">
        <b id="ch34mtitle"></b>
        <div id="ch34mbody"></div>
        <div class="ch34ma">
          <button id="ch34cancel">取消</button>
          <button id="ch34save" class="primary">保存</button>
        </div>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.id = STYLE;
  style.textContent = `
#${ROOT},#${ROOT} *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",Arial,sans-serif}
#${ROOT}{position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;color-scheme:light!important}
#ch34shell,#ch34modal{pointer-events:auto!important}
#ch34shell{position:fixed!important;z-index:2147483647!important}
#ch34rail{position:absolute!important;top:0!important;width:${DEFAULT_LAYOUT.railWidth}px!important;padding:6px!important;display:flex!important;flex-direction:column!important;gap:5px!important;background:#f8fbff!important;border:1px solid #d9e2ef!important;border-radius:14px!important;box-shadow:0 8px 28px #0f172a33!important;max-height:88vh!important;overflow:auto!important}
#ch34rail button{width:42px!important;min-height:40px!important;padding:5px 2px!important;margin:0!important;border:0!important;border-radius:9px!important;background:transparent!important;color:#475569!important;font-size:11px!important;font-weight:700!important;line-height:1.15!important;cursor:pointer!important;overflow-wrap:anywhere!important}
#ch34rail .toggle{font-size:20px!important;color:#155eef!important}
#ch34rail button:hover{background:#e7eef9!important}
#ch34rail button.on{background:#155eef!important;color:#fff!important}
#ch34panel{position:relative!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;background:#fff!important;color:#17243b!important;border:1px solid #d9e2ef!important;border-radius:15px!important;box-shadow:0 16px 48px #0f172a42!important;font-size:13px!important;line-height:1.55!important;min-width:${MIN_W}px!important;min-height:${MIN_H}px!important}
#ch34panel[hidden],#ch34bar[hidden],#ch34modal[hidden]{display:none!important}
#ch34drag{padding:12px!important;border-bottom:1px solid #e5eaf1!important;cursor:move!important;user-select:none!important}
.ch34top{display:flex!important;justify-content:space-between!important;gap:10px!important}
.ch34topa{display:flex!important;gap:5px!important}
#ch34title{font-size:17px!important}
#ch34panel small{display:block!important;margin-top:2px!important;color:#64748b!important;font-size:11px!important}
#${ROOT} button{border:1px solid #cbd5e1!important;border-radius:8px!important;background:#fff!important;color:#334155!important;padding:5px 8px!important;font-size:12px!important;cursor:pointer!important;box-shadow:none!important}
#${ROOT} button.primary{background:#155eef!important;border-color:#155eef!important;color:#fff!important}
#ch34search{width:100%!important;height:35px!important;margin-top:10px!important;padding:7px 9px!important;border:1px solid #cbd5e1!important;border-radius:8px!important;background:#fff!important;color:#17243b!important;font-size:12px!important}
#ch34tabs{display:flex!important;gap:6px!important;padding:9px 10px!important;overflow-x:auto!important;border-bottom:1px solid #e5eaf1!important;background:#fbfdff!important;min-height:48px!important}
.ch34tab{flex:0 0 auto!important;border-radius:999px!important;font-size:11px!important}
.ch34tab.on{background:#17243b!important;border-color:#17243b!important;color:#fff!important}
#ch34bar{display:flex!important;gap:5px!important;flex-wrap:wrap!important;padding:8px 10px!important;border-bottom:1px solid #e5eaf1!important;background:#f8fafc!important}
#ch34bar i{width:1px!important;background:#d8dee8!important;margin:2px!important}
#ch34content{flex:1!important;min-height:0!important;overflow:auto!important;padding:11px!important}
.ch34head{margin-bottom:10px!important}.ch34head b{font-size:15px!important}.ch34sub{color:#64748b!important;font-size:11px!important}
.ch34item{margin-bottom:9px!important;padding:10px!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important}.ch34item.text{background:#fbfdff!important}.dragging{opacity:.4!important}
.ch34lr{display:flex!important;justify-content:space-between!important;gap:8px!important}.ch34label{margin-bottom:5px!important;color:#334155!important;font-size:12px!important;font-weight:700!important}.ch34handle{color:#94a3b8!important;font-size:16px!important}
.ch34value{white-space:pre-wrap!important;overflow-wrap:anywhere!important;color:#475569!important;font-size:12px!important;line-height:1.65!important;user-select:text!important}.ch34value.cut{max-height:112px!important;overflow:hidden!important}
.ch34field{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important}.ch34field .ch34value{color:#17243b!important;font-size:13px!important}.ch34period{font-size:13px!important;font-weight:700!important}
.ch34actions{display:flex!important;gap:5px!important;flex-wrap:wrap!important;margin-top:8px!important}.ch34empty{padding:30px 10px!important;text-align:center!important;color:#64748b!important}
#ch34panel footer{padding:7px 11px!important;border-top:1px solid #e5eaf1!important;background:#fbfdff!important;color:#64748b!important;font-size:10px!important}
#ch34toast{position:absolute!important;right:12px!important;bottom:38px!important;padding:8px 10px!important;border-radius:9px!important;background:#17243b!important;color:#fff!important;font-size:12px!important;opacity:0!important;transition:.15s!important;pointer-events:none!important}#ch34toast.show{opacity:1!important}
#ch34resize{position:absolute!important;right:2px!important;bottom:2px!important;width:22px!important;height:22px!important;display:flex!important;align-items:center!important;justify-content:center!important;color:#64748b!important;font-size:16px!important;cursor:nwse-resize!important;user-select:none!important;border-radius:6px!important}#ch34resize:hover{background:#eef3f8!important;color:#155eef!important}
#ch34modal{position:fixed!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;background:#0f172a55!important}
.ch34modal{width:min(520px,92vw)!important;max-height:88vh!important;overflow:auto!important;background:#fff!important;border-radius:14px!important;box-shadow:0 20px 60px #0005!important;padding:14px!important;color:#17243b!important}.ch34modal>b{display:block!important;font-size:16px!important;margin-bottom:10px!important}.ch34modal label{display:block!important;margin:9px 0 4px!important;font-size:12px!important;font-weight:700!important}.ch34modal input,.ch34modal textarea,.ch34modal select{width:100%!important;border:1px solid #cbd5e1!important;border-radius:8px!important;padding:7px 8px!important;background:#fff!important;color:#17243b!important;font-size:12px!important}.ch34modal textarea{min-height:130px!important;resize:vertical!important}.ch34ma{display:flex!important;justify-content:flex-end!important;gap:7px!important;margin-top:12px!important}
`;

  (document.head || document.documentElement).appendChild(style);
  (document.body || document.documentElement).appendChild(root);

  const $ = selector => root.querySelector(selector);
  const shell = $('#ch34shell');
  const rail = $('#ch34rail');
  const panel = $('#ch34panel');
  const title = $('#ch34title');
  const tabs = $('#ch34tabs');
  const bar = $('#ch34bar');
  const content = $('#ch34content');
  const search = $('#ch34search');
  const toast = $('#ch34toast');
  const modal = $('#ch34modal');
  const modalTitle = $('#ch34mtitle');
  const modalBody = $('#ch34mbody');
  const modalSave = $('#ch34save');
  const resizeHandle = $('#ch34resize');

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

  function clampLayout() {
    const reserved = DEFAULT_LAYOUT.railWidth + DEFAULT_LAYOUT.gap + 12;
    const maxW = Math.max(MIN_W, innerWidth - state.left - reserved);
    const maxH = Math.max(MIN_H, innerHeight - state.top - 8);
    state.width = Math.max(MIN_W, Math.min(maxW, state.width));
    state.height = Math.max(MIN_H, Math.min(maxH, state.height));

    const totalW = state.width + reserved;
    state.left = Math.max(0, Math.min(Math.max(0, innerWidth - totalW), state.left));
    state.top = Math.max(0, Math.min(Math.max(0, innerHeight - 80), state.top));
  }

  function applyLayout() {
    clampLayout();
    shell.style.setProperty('left', `${state.left}px`, 'important');
    shell.style.setProperty('top', `${state.top}px`, 'important');
    panel.style.setProperty('width', `${state.width}px`, 'important');
    panel.style.setProperty('height', `${state.height}px`, 'important');
    rail.style.setProperty('left', `${state.width + DEFAULT_LAYOUT.gap}px`, 'important');
    rail.style.setProperty('max-height', `${state.height}px`, 'important');
  }

  function resetLayout(resetPosition = true, resetSize = true) {
    if (resetSize) {
      state.width = DEFAULT_LAYOUT.width;
      state.height = DEFAULT_LAYOUT.height;
    }
    if (resetPosition) {
      state.left = Math.max(8, innerWidth - state.width - DEFAULT_LAYOUT.railWidth - DEFAULT_LAYOUT.gap - 16);
      state.top = DEFAULT_LAYOUT.top;
    }
    applyLayout();
    saveUI();
  }

  applyLayout();

  function notify(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('show'), 1200);
  }

  async function copy(value, label) {
    try {
      if (typeof GM_setClipboard === 'function') GM_setClipboard(text(value), 'text');
      else await navigator.clipboard.writeText(text(value));
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
    if (primary) element.classList.add('primary');
    element.onclick = fn;
    return element;
  }

  function control(label, value = '', type = 'input') {
    const wrap = document.createElement('div');
    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    const element = document.createElement(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input');
    if (type !== 'select') element.value = value;
    wrap.append(labelElement, element);
    return { wrap, element };
  }

  function openModal(name, body, onSave) {
    modalTitle.textContent = name;
    modalBody.replaceChildren(body);
    modal.hidden = false;
    modalSave.onclick = () => {
      if (onSave() !== false) closeModal();
    };
  }

  function closeModal() {
    modal.hidden = true;
    modalSave.onclick = null;
  }

  $('#ch34cancel').onclick = closeModal;
  modal.onclick = event => { if (event.target === modal) closeModal(); };

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
        const category = { id: uid('cat'), name: fullName, shortName: short || fullName.slice(0, 4), cards: [] };
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
    if (!confirm(`确定删除分类「${category.name}」吗？\n其中 ${category.cards.length} 张卡片也会一并删除。`)) return;
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
    [['field', '短字段'], ['text', '长文本'], ['period', '时间区间']].forEach(([value, label]) => {
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
    box.append(kind.wrap, labelControl.wrap, valueControl.wrap, startControl.wrap, endControl.wrap);

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
      const item = { label, kind: kind.element.value };
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
    box.className = `ch34item ${item.kind === 'text' ? 'text' : ''}`;
    box.dataset.index = String(index);
    box.draggable = Boolean(state.manage && allowManage);

    const labelRow = document.createElement('div');
    labelRow.className = 'ch34lr';
    const label = document.createElement('div');
    label.className = 'ch34label';
    label.textContent = item.label;
    labelRow.appendChild(label);

    if (state.manage && allowManage) {
      const handle = document.createElement('span');
      handle.className = 'ch34handle';
      handle.textContent = '≡';
      labelRow.appendChild(handle);
    }
    box.appendChild(labelRow);

    if (item.kind === 'period') {
      const value = document.createElement('div');
      value.className = 'ch34period';
      value.textContent = `${text(item.start)} — ${text(item.end)}`;
      box.appendChild(value);

      const actions = document.createElement('div');
      actions.className = 'ch34actions';
      actions.append(
        button('复制区间', () => copy(`${text(item.start)} — ${text(item.end)}`, item.label), true),
        button('开始', () => copy(item.start, `${item.label} · 开始`)),
        button('结束', () => copy(item.end, `${item.label} · 结束`))
      );
      box.appendChild(actions);

    } else if (item.kind === 'field') {
      const row = document.createElement('div');
      row.className = 'ch34field';
      const value = document.createElement('div');
      value.className = 'ch34value';
      value.textContent = text(item.value);
      row.append(value, button('复制', () => copy(item.value, item.label), true));
      box.appendChild(row);

    } else {
      const value = document.createElement('div');
      value.className = 'ch34value';
      value.textContent = text(item.value);
      const needCut = text(item.value).length > 180;
      if (needCut) value.classList.add('cut');
      box.appendChild(value);

      const actions = document.createElement('div');
      actions.className = 'ch34actions';
      actions.appendChild(button('复制整段', () => copy(item.value, item.label), true));
      if (needCut) {
        const expand = button('展开', () => {
          const collapsed = value.classList.toggle('cut');
          expand.textContent = collapsed ? '展开' : '收起';
        });
        actions.appendChild(expand);
      }
      box.appendChild(actions);
    }

    if (state.manage && allowManage) {
      const actions = document.createElement('div');
      actions.className = 'ch34actions';
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
    toggle.className = 'toggle';
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
      element.classList.toggle('on', state.open && category.id === state.categoryId);
      element.draggable = state.manage;

      if (state.manage) {
        element.ondragstart = event => {
          element.classList.add('dragging');
          event.dataTransfer.setData('text/category', String(index));
        };
        element.ondragend = () => element.classList.remove('dragging');
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
      element.className = `ch34tab${card.id === state.cardId ? ' on' : ''}`;
      element.title = card.title;
      element.draggable = state.manage;

      if (state.manage) {
        element.ondragstart = event => {
          element.classList.add('dragging');
          event.dataTransfer.setData('text/card', String(index));
        };
        element.ondragend = () => element.classList.remove('dragging');
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
      empty.className = 'ch34empty';
      empty.textContent = state.manage ? '这个分类还没有卡片，点“＋卡片”添加。' : '这个分类暂无资料。';
      content.appendChild(empty);
      return;
    }

    const head = document.createElement('div');
    head.className = 'ch34head';
    const cardTitle = document.createElement('b');
    cardTitle.textContent = card.title;
    head.appendChild(cardTitle);
    if (card.subtitle) {
      const subtitle = document.createElement('div');
      subtitle.className = 'ch34sub';
      subtitle.textContent = card.subtitle;
      head.appendChild(subtitle);
    }
    content.appendChild(head);

    card.items.forEach((item, index) => content.appendChild(itemView(item, index, true)));

    if (!card.items.length) {
      const empty = document.createElement('div');
      empty.className = 'ch34empty';
      empty.textContent = state.manage ? '这个卡片还没有字段，点“＋字段”添加。' : '这个卡片暂无内容。';
      content.appendChild(empty);
    }

    if (state.manage) {
      content.querySelectorAll('.ch34item').forEach(element => {
        element.ondragstart = event => {
          element.classList.add('dragging');
          event.dataTransfer.setData('text/item', element.dataset.index);
        };
        element.ondragend = () => element.classList.remove('dragging');
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
      const hits = card.items.filter(item => [card.title, card.subtitle, item.label, item.value, item.start, item.end]
        .join(' ')
        .toLowerCase()
        .includes(needle));
      if (!hits.length) return;

      const head = document.createElement('div');
      head.className = 'ch34head';
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
      empty.className = 'ch34empty';
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
    bar.hidden = !state.manage;
    $('#ch34manage').textContent = state.manage ? '完成' : '管理';
    applyLayout();
    if (!state.open) return;
    renderTabs();
    state.search.trim() ? renderSearch(state.search.trim()) : renderCard();
  }

  $('#ch34close').onclick = () => {
    state.open = false;
    render();
  };

  $('#ch34manage').onclick = () => {
    state.manage = !state.manage;
    render();
  };

  search.oninput = event => {
    state.search = event.target.value || '';
    render();
  };

  $('#ch34addcat').onclick = () => editCategory();
  $('#ch34editcat').onclick = () => {
    const category = currentCategory();
    if (category) editCategory(category);
  };
  $('#ch34delcat').onclick = deleteCategory;

  $('#ch34addcard').onclick = () => editCard();
  $('#ch34editcard').onclick = () => {
    const card = currentCard();
    if (card) editCard(card);
  };
  $('#ch34delcard').onclick = deleteCard;
  $('#ch34additem').onclick = () => editItem();

  $('#ch34export').onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `campus-helper-v34-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    notify('已导出');
  };

  $('#ch34import').onclick = () => $('#ch34file').click();
  $('#ch34file').onchange = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const raw = JSON.parse(await file.text());
      const next = normalizeV33(raw) || migrateV32(raw);
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

  $('#ch34reset').onclick = () => {
    resetLayout(true, true);
    notify('布局已重置');
  };

  // 拖动窗口
  (() => {
    const drag = $('#ch34drag');
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
      const maxW = Math.max(MIN_W, innerWidth - state.left - DEFAULT_LAYOUT.railWidth - DEFAULT_LAYOUT.gap - 12);
      const maxH = Math.max(MIN_H, innerHeight - state.top - 8);
      state.width = Math.max(MIN_W, Math.min(maxW, startW + event.clientX - startX));
      state.height = Math.max(MIN_H, Math.min(maxH, startH + event.clientY - startY));
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
      state.width = DEFAULT_LAYOUT.width;
      state.height = DEFAULT_LAYOUT.height;
      applyLayout();
      saveUI();
      notify('大小已恢复默认');
    };
  })();

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!modal.hidden) closeModal();
    else if (state.open) {
      state.open = false;
      render();
    }
  }, true);

  addEventListener('resize', () => {
    applyLayout();
    saveUI();
  });

  render();
  console.log('[秋招网申资料库 v3.4] 已启动');
})();
