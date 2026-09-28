// ==UserScript==
// @name         秋招网申资料库 v3.3
// @namespace    campus-application-helper
// @version      3.3.0
// @description  分类/卡片/字段三级自定义与拖拽排序；自动迁移 v3.2 数据并清理备注。
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

  const ROOT = 'campus-helper-v33';
  const STYLE = 'campus-helper-v33-style';
  const DB_KEY = 'campus-helper-v32-db'; // 沿用 v3.2 的存储，覆盖旧脚本即可自动迁移
  const UI_KEY = 'campus-helper-v33-ui';
  if (document.getElementById(ROOT)) return;

  const uid = p => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const t = v => String(v ?? '');

  function cleanItem(item) {
    if (!item || typeof item !== 'object' || item.kind === 'note') return null;
    const kind = ['field', 'text', 'period'].includes(item.kind) ? item.kind : 'field';
    if (kind === 'period') return { label: t(item.label), kind, start: t(item.start), end: t(item.end) };
    return { label: t(item.label), kind, value: t(item.value) };
  }

  function cleanCard(card) {
    return {
      id: t(card?.id) || uid('card'),
      title: t(card?.title) || '未命名卡片',
      shortName: t(card?.shortName || card?.title) || '卡片',
      subtitle: t(card?.subtitle),
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
      categories: raw.categories.map(c => ({
        id: t(c.id) || uid('cat'),
        name: t(c.name) || '未命名分类',
        shortName: t(c.shortName || c.name) || '分类',
        cards: Array.isArray(c.cards) ? c.cards.map(cleanCard) : []
      })),
      updatedAt: Date.now()
    };
  }

  function migrateV32(raw) {
    if (!raw || !raw.data) return null;
    const old = raw.data;
    const all = Object.values(old).flatMap(g => Array.isArray(g?.cards) ? g.cards : []);
    const byId = new Map(all.map(c => [c.id, c]));
    const known = new Set([
      'basic','job','master','bachelor','highschool','uaes','zhida','prism','checklist','deepresearch','robot',
      'skills','campus','awards','self','advantage','career','hobby'
    ]);
    const used = new Set();

    const take = ids => {
      const out = [];
      ids.forEach(id => {
        const c = byId.get(id);
        if (c) { out.push(cleanCard(c)); used.add(c); }
      });
      return out;
    };

    const db = emptyDB();
    const map = Object.fromEntries(db.categories.map(c => [c.id, c]));
    map.basic.cards = take(['basic','job']);
    map.education.cards = take(['master','bachelor','highschool']);
    map.intern.cards = take(['uaes','zhida']);
    map.project.cards = take(['prism','checklist','deepresearch','robot']);
    map.skills.cards = take(['skills']);
    map.campus.cards = take(['campus','awards']);
    map.writing.cards = take(['self','advantage','career','hobby']);

    // 旧版里用户自己新增的卡片继续留在原来的大类，避免迁移时跑错位置。
    const oldToNew = { basic: 'basic', education: 'education', intern: 'intern', project: 'project', writing: 'writing' };
    Object.entries(oldToNew).forEach(([oldKey, newKey]) => {
      (old[oldKey]?.cards || []).forEach(c => {
        if (!used.has(c) && !known.has(c.id)) { map[newKey].cards.push(cleanCard(c)); used.add(c); }
      });
    });

    const left = all.filter(c => !used.has(c)).map(cleanCard);
    if (left.length) db.categories.push({ id: uid('cat'), name: '其他资料', shortName: '其他', cards: left });
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
    left: Math.max(8, innerWidth - 535),
    top: 64
  };

  try {
    const s = GM_getValue(UI_KEY, null);
    if (s) {
      if (typeof s.categoryId === 'string') state.categoryId = s.categoryId;
      if (typeof s.cardId === 'string') state.cardId = s.cardId;
      if (Number.isFinite(s.left)) state.left = s.left;
      if (Number.isFinite(s.top)) state.top = s.top;
    }
  } catch (_) {}

  const root = document.createElement('div');
  root.id = ROOT;
  root.innerHTML = `
    <div id="ch33shell">
      <aside id="ch33rail"></aside>
      <section id="ch33panel" hidden>
        <header id="ch33drag">
          <div class="ch33top">
            <div><b id="ch33title"></b><small>拖动标题栏移动 · 点击复制后手动粘贴</small></div>
            <div class="ch33topa"><button id="ch33manage">管理</button><button id="ch33close">×</button></div>
          </div>
          <input id="ch33search" type="search" placeholder="搜索当前分类…" autocomplete="off">
        </header>
        <div id="ch33tabs"></div>
        <div id="ch33bar" hidden>
          <button id="ch33addcat">＋分类</button><button id="ch33editcat">编辑分类</button><button id="ch33delcat">删除分类</button>
          <i></i>
          <button id="ch33addcard">＋卡片</button><button id="ch33editcard">编辑卡片</button><button id="ch33delcard">删除卡片</button><button id="ch33additem">＋字段</button>
          <i></i>
          <button id="ch33export">导出</button><button id="ch33import">导入</button><button id="ch33reset">重置位置</button>
          <input id="ch33file" type="file" accept=".json,application/json" hidden>
        </div>
        <main id="ch33content"></main>
        <footer>v3.3 · 分类 / 卡片 / 字段均可自定义与拖拽排序</footer>
        <div id="ch33toast"></div>
      </section>
    </div>
    <div id="ch33modal" hidden><div class="ch33modal"><b id="ch33mtitle"></b><div id="ch33mbody"></div><div class="ch33ma"><button id="ch33cancel">取消</button><button id="ch33save" class="primary">保存</button></div></div></div>`;

  const style = document.createElement('style');
  style.id = STYLE;
  style.textContent = `
#${ROOT},#${ROOT} *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",Arial,sans-serif}
#${ROOT}{position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;color-scheme:light!important}#ch33shell,#ch33modal{pointer-events:auto!important}
#ch33shell{position:fixed!important;z-index:2147483647!important}#ch33rail{position:absolute!important;left:458px!important;top:0!important;width:56px!important;padding:6px!important;display:flex!important;flex-direction:column!important;gap:5px!important;background:#f8fbff!important;border:1px solid #d9e2ef!important;border-radius:14px!important;box-shadow:0 8px 28px #0f172a33!important;max-height:88vh!important;overflow:auto!important}
#ch33rail button{width:42px!important;min-height:40px!important;padding:5px 2px!important;margin:0!important;border:0!important;border-radius:9px!important;background:transparent!important;color:#475569!important;font-size:11px!important;font-weight:700!important;line-height:1.15!important;cursor:pointer!important;overflow-wrap:anywhere!important}#ch33rail .toggle{font-size:20px!important;color:#155eef!important}#ch33rail button:hover{background:#e7eef9!important}#ch33rail button.on{background:#155eef!important;color:#fff!important}
#ch33panel{width:450px!important;height:min(820px,88vh)!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;background:#fff!important;color:#17243b!important;border:1px solid #d9e2ef!important;border-radius:15px!important;box-shadow:0 16px 48px #0f172a42!important;font-size:13px!important;line-height:1.55!important}#ch33panel[hidden],#ch33bar[hidden],#ch33modal[hidden]{display:none!important}
#ch33drag{padding:12px!important;border-bottom:1px solid #e5eaf1!important;cursor:move!important;user-select:none!important}.ch33top{display:flex!important;justify-content:space-between!important;gap:10px!important}.ch33topa{display:flex!important;gap:5px!important}#ch33title{font-size:17px!important}#ch33panel small{display:block!important;margin-top:2px!important;color:#64748b!important;font-size:11px!important}
#${ROOT} button{border:1px solid #cbd5e1!important;border-radius:8px!important;background:#fff!important;color:#334155!important;padding:5px 8px!important;font-size:12px!important;cursor:pointer!important;box-shadow:none!important}#${ROOT} button.primary{background:#155eef!important;border-color:#155eef!important;color:#fff!important}
#ch33search{width:100%!important;height:35px!important;margin-top:10px!important;padding:7px 9px!important;border:1px solid #cbd5e1!important;border-radius:8px!important;background:#fff!important;color:#17243b!important;font-size:12px!important}
#ch33tabs{display:flex!important;gap:6px!important;padding:9px 10px!important;overflow-x:auto!important;border-bottom:1px solid #e5eaf1!important;background:#fbfdff!important;min-height:48px!important}.ch33tab{flex:0 0 auto!important;border-radius:999px!important;font-size:11px!important}.ch33tab.on{background:#17243b!important;border-color:#17243b!important;color:#fff!important}
#ch33bar{display:flex!important;gap:5px!important;flex-wrap:wrap!important;padding:8px 10px!important;border-bottom:1px solid #e5eaf1!important;background:#f8fafc!important}#ch33bar i{width:1px!important;background:#d8dee8!important;margin:2px!important}
#ch33content{flex:1!important;min-height:0!important;overflow:auto!important;padding:11px!important}.ch33head{margin-bottom:10px!important}.ch33head b{font-size:15px!important}.ch33sub{color:#64748b!important;font-size:11px!important}.ch33item{margin-bottom:9px!important;padding:10px!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important}.ch33item.text{background:#fbfdff!important}.dragging{opacity:.4!important}.ch33lr{display:flex!important;justify-content:space-between!important;gap:8px!important}.ch33label{margin-bottom:5px!important;color:#334155!important;font-size:12px!important;font-weight:700!important}.ch33handle{color:#94a3b8!important;font-size:16px!important}.ch33value{white-space:pre-wrap!important;overflow-wrap:anywhere!important;color:#475569!important;font-size:12px!important;line-height:1.65!important;user-select:text!important}.ch33value.cut{max-height:112px!important;overflow:hidden!important}.ch33field{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important}.ch33field .ch33value{color:#17243b!important;font-size:13px!important}.ch33period{font-size:13px!important;font-weight:700!important}.ch33actions{display:flex!important;gap:5px!important;flex-wrap:wrap!important;margin-top:8px!important}.ch33empty{padding:30px 10px!important;text-align:center!important;color:#64748b!important}
#ch33panel footer{padding:7px 11px!important;border-top:1px solid #e5eaf1!important;background:#fbfdff!important;color:#64748b!important;font-size:10px!important}#ch33toast{position:absolute!important;right:12px!important;bottom:38px!important;padding:8px 10px!important;border-radius:9px!important;background:#17243b!important;color:#fff!important;font-size:12px!important;opacity:0!important;transition:.15s!important;pointer-events:none!important}#ch33toast.show{opacity:1!important}
#ch33modal{position:fixed!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;background:#0f172a55!important}.ch33modal{width:min(520px,92vw)!important;max-height:88vh!important;overflow:auto!important;background:#fff!important;border-radius:14px!important;box-shadow:0 20px 60px #0005!important;padding:14px!important;color:#17243b!important}.ch33modal>b{display:block!important;font-size:16px!important;margin-bottom:10px!important}.ch33modal label{display:block!important;margin:9px 0 4px!important;font-size:12px!important;font-weight:700!important}.ch33modal input,.ch33modal textarea,.ch33modal select{width:100%!important;border:1px solid #cbd5e1!important;border-radius:8px!important;padding:7px 8px!important;background:#fff!important;color:#17243b!important;font-size:12px!important}.ch33modal textarea{min-height:130px!important;resize:vertical!important}.ch33ma{display:flex!important;justify-content:flex-end!important;gap:7px!important;margin-top:12px!important}
@media(max-width:640px){#ch33panel{width:calc(100vw - 80px)!important}#ch33rail{left:calc(100vw - 70px)!important}}`;

  (document.head || document.documentElement).appendChild(style);
  (document.body || document.documentElement).appendChild(root);

  const $ = s => root.querySelector(s);
  const shell = $('#ch33shell'), rail = $('#ch33rail'), panel = $('#ch33panel'), title = $('#ch33title');
  const tabs = $('#ch33tabs'), bar = $('#ch33bar'), content = $('#ch33content'), search = $('#ch33search'), toast = $('#ch33toast');
  const modal = $('#ch33modal'), mtitle = $('#ch33mtitle'), mbody = $('#ch33mbody'), msave = $('#ch33save');

  const saveDB = () => { db.updatedAt = Date.now(); GM_setValue(DB_KEY, db); };
  const saveUI = () => GM_setValue(UI_KEY, { categoryId: state.categoryId, cardId: state.cardId, left: state.left, top: state.top });

  function cat() {
    let c = db.categories.find(x => x.id === state.categoryId);
    if (!c) { c = db.categories[0] || null; state.categoryId = c?.id || ''; }
    return c;
  }
  function card() {
    const c = cat(); if (!c) return null;
    let x = c.cards.find(v => v.id === state.cardId);
    if (!x) { x = c.cards[0] || null; state.cardId = x?.id || ''; }
    return x;
  }

  function pos() {
    state.left = Math.max(0, Math.min(Math.max(0, innerWidth - 515), state.left));
    state.top = Math.max(0, Math.min(Math.max(0, innerHeight - 90), state.top));
    shell.style.setProperty('left', `${state.left}px`, 'important');
    shell.style.setProperty('top', `${state.top}px`, 'important');
  }
  pos();

  function notify(s) { toast.textContent = s; toast.classList.add('show'); clearTimeout(notify.x); notify.x = setTimeout(() => toast.classList.remove('show'), 1200); }
  async function copy(v, label) {
    try { if (typeof GM_setClipboard === 'function') GM_setClipboard(t(v), 'text'); else await navigator.clipboard.writeText(t(v)); notify(`已复制：${label}`); }
    catch (e) { console.error(e); notify('复制失败'); }
  }
  function btn(label, fn, primary = false) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (primary) b.classList.add('primary'); b.onclick = fn; return b; }
  function ctl(label, value = '', type = 'input') {
    const w = document.createElement('div'), l = document.createElement('label'), e = document.createElement(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input');
    l.textContent = label; if (type !== 'select') e.value = value; w.append(l, e); return { w, e };
  }
  function openModal(name, body, onSave) { mtitle.textContent = name; mbody.replaceChildren(body); modal.hidden = false; msave.onclick = () => { if (onSave() !== false) closeModal(); }; }
  function closeModal() { modal.hidden = true; msave.onclick = null; }
  $('#ch33cancel').onclick = closeModal;
  modal.onclick = e => { if (e.target === modal) closeModal(); };

  function editCategory(target = null) {
    const box = document.createElement('div'), a = ctl('分类名称', target?.name || ''), b = ctl('侧栏短名', target?.shortName || ''); box.append(a.w, b.w);
    openModal(target ? '编辑分类' : '新增分类', box, () => {
      const name = a.e.value.trim(), shortName = b.e.value.trim(); if (!name) return alert('分类名称不能为空'), false;
      if (target) { target.name = name; target.shortName = shortName || name.slice(0, 4); }
      else { const x = { id: uid('cat'), name, shortName: shortName || name.slice(0, 4), cards: [] }; db.categories.push(x); state.categoryId = x.id; state.cardId = ''; }
      saveDB(); saveUI(); render(); return true;
    });
  }

  function editCard(target = null) {
    const c = cat(); if (!c) return;
    const box = document.createElement('div'), a = ctl('卡片标题', target?.title || ''), b = ctl('顶部按钮短名', target?.shortName || ''), d = ctl('副标题（可选）', target?.subtitle || ''); box.append(a.w, b.w, d.w);
    openModal(target ? '编辑卡片' : '新增卡片', box, () => {
      const name = a.e.value.trim(); if (!name) return alert('卡片标题不能为空'), false;
      if (target) { target.title = name; target.shortName = b.e.value.trim() || name; target.subtitle = d.e.value.trim(); }
      else { const x = { id: uid('card'), title: name, shortName: b.e.value.trim() || name, subtitle: d.e.value.trim(), items: [] }; c.cards.push(x); state.cardId = x.id; }
      saveDB(); saveUI(); render(); return true;
    });
  }

  function editItem(target = null, index = -1) {
    const c = card(); if (!c) return notify('请先添加卡片');
    const box = document.createElement('div'), k = ctl('类型', '', 'select');
    [['field','短字段'],['text','长文本'],['period','时间区间']].forEach(([v,n]) => { const o = document.createElement('option'); o.value = v; o.textContent = n; k.e.appendChild(o); });
    k.e.value = target?.kind || 'field';
    const a = ctl('字段名称', target?.label || ''), v = ctl('内容', target?.value || '', 'textarea'), s = ctl('开始时间', target?.start || ''), e = ctl('结束时间', target?.end || ''); box.append(k.w, a.w, v.w, s.w, e.w);
    const sync = () => { const p = k.e.value === 'period'; v.w.style.display = p ? 'none' : ''; s.w.style.display = p ? '' : 'none'; e.w.style.display = p ? '' : 'none'; }; k.e.onchange = sync; sync();
    openModal(target ? '编辑字段' : '新增字段', box, () => {
      const label = a.e.value.trim(); if (!label) return alert('字段名称不能为空'), false;
      const x = { label, kind: k.e.value }; if (x.kind === 'period') { x.start = s.e.value.trim(); x.end = e.e.value.trim(); } else x.value = v.e.value;
      if (target) c.items[index] = x; else c.items.push(x); saveDB(); render(); return true;
    });
  }

  function itemView(item, index, manage = true) {
    const box = document.createElement('section'); box.className = `ch33item ${item.kind === 'text' ? 'text' : ''}`; box.dataset.index = index; box.draggable = state.manage && manage;
    const lr = document.createElement('div'), lab = document.createElement('div'); lr.className = 'ch33lr'; lab.className = 'ch33label'; lab.textContent = item.label; lr.appendChild(lab);
    if (state.manage && manage) { const h = document.createElement('span'); h.className = 'ch33handle'; h.textContent = '≡'; lr.appendChild(h); } box.appendChild(lr);
    if (item.kind === 'period') {
      const v = document.createElement('div'); v.className = 'ch33period'; v.textContent = `${t(item.start)} — ${t(item.end)}`; box.appendChild(v);
      const a = document.createElement('div'); a.className = 'ch33actions'; a.append(btn('复制区间', () => copy(`${t(item.start)} — ${t(item.end)}`, item.label), true), btn('开始', () => copy(item.start, `${item.label} · 开始`)), btn('结束', () => copy(item.end, `${item.label} · 结束`))); box.appendChild(a);
    } else if (item.kind === 'field') {
      const r = document.createElement('div'), v = document.createElement('div'); r.className = 'ch33field'; v.className = 'ch33value'; v.textContent = t(item.value); r.append(v, btn('复制', () => copy(item.value, item.label), true)); box.appendChild(r);
    } else {
      const v = document.createElement('div'); v.className = 'ch33value'; v.textContent = t(item.value); const cut = t(item.value).length > 180; if (cut) v.classList.add('cut'); box.appendChild(v);
      const a = document.createElement('div'); a.className = 'ch33actions'; a.appendChild(btn('复制整段', () => copy(item.value, item.label), true));
      if (cut) { const ex = btn('展开', () => { const x = v.classList.toggle('cut'); ex.textContent = x ? '展开' : '收起'; }); a.appendChild(ex); } box.appendChild(a);
    }
    if (state.manage && manage) { const a = document.createElement('div'); a.className = 'ch33actions'; a.append(btn('编辑', () => editItem(item, index)), btn('删除', () => { if (confirm(`确定删除「${item.label}」吗？`)) { card().items.splice(index, 1); saveDB(); render(); } })); box.appendChild(a); }
    return box;
  }

  function renderRail() {
    rail.replaceChildren(); const toggle = btn('☷', () => { state.open = !state.open; render(); }); toggle.className = 'toggle'; rail.appendChild(toggle);
    db.categories.forEach((c, i) => {
      const b = btn(c.shortName || c.name, () => { if (state.open && state.categoryId === c.id) state.open = false; else { state.categoryId = c.id; state.cardId = c.cards[0]?.id || ''; state.search = ''; search.value = ''; state.open = true; saveUI(); } render(); });
      b.title = c.name; b.classList.toggle('on', state.open && c.id === state.categoryId); b.draggable = state.manage; b.dataset.index = i;
      if (state.manage) { b.ondragstart = e => { b.classList.add('dragging'); e.dataTransfer.setData('text/cat', i); }; b.ondragend = () => b.classList.remove('dragging'); b.ondragover = e => e.preventDefault(); b.ondrop = e => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/cat')); if (Number.isInteger(from) && from !== i) { const [x] = db.categories.splice(from, 1); db.categories.splice(i, 0, x); saveDB(); render(); } }; }
      rail.appendChild(b);
    });
  }

  function renderTabs() {
    tabs.replaceChildren(); const c = cat(); if (!c) return;
    c.cards.forEach((x, i) => {
      const b = btn(x.shortName || x.title, () => { state.cardId = x.id; state.search = ''; search.value = ''; saveUI(); render(); }); b.className = `ch33tab${x.id === state.cardId ? ' on' : ''}`; b.title = x.title; b.draggable = state.manage;
      if (state.manage) { b.ondragstart = e => { b.classList.add('dragging'); e.dataTransfer.setData('text/card', i); }; b.ondragend = () => b.classList.remove('dragging'); b.ondragover = e => e.preventDefault(); b.ondrop = e => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/card')); if (Number.isInteger(from) && from !== i) { const [m] = c.cards.splice(from, 1); c.cards.splice(i, 0, m); saveDB(); render(); } }; }
      tabs.appendChild(b);
    });
  }

  function renderCard() {
    content.replaceChildren(); const c = card();
    if (!c) { const e = document.createElement('div'); e.className = 'ch33empty'; e.textContent = state.manage ? '这个分类还没有卡片，点“＋卡片”添加。' : '这个分类暂无资料。'; content.appendChild(e); return; }
    const h = document.createElement('div'), b = document.createElement('b'); h.className = 'ch33head'; b.textContent = c.title; h.appendChild(b); if (c.subtitle) { const s = document.createElement('div'); s.className = 'ch33sub'; s.textContent = c.subtitle; h.appendChild(s); } content.appendChild(h);
    c.items.forEach((x, i) => content.appendChild(itemView(x, i, true)));
    if (!c.items.length) { const e = document.createElement('div'); e.className = 'ch33empty'; e.textContent = state.manage ? '这个卡片还没有字段，点“＋字段”添加。' : '这个卡片暂无内容。'; content.appendChild(e); }
    if (state.manage) content.querySelectorAll('.ch33item').forEach(el => { el.ondragstart = e => { el.classList.add('dragging'); e.dataTransfer.setData('text/item', el.dataset.index); }; el.ondragend = () => el.classList.remove('dragging'); el.ondragover = e => e.preventDefault(); el.ondrop = e => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/item')), to = Number(el.dataset.index); if (Number.isInteger(from) && Number.isInteger(to) && from !== to) { const [m] = c.items.splice(from, 1); c.items.splice(to, 0, m); saveDB(); render(); } }; });
  }

  function renderSearch(q) {
    content.replaceChildren(); const c = cat(), needle = q.toLowerCase(); let n = 0;
    c.cards.forEach(x => { const hits = x.items.filter(v => [x.title, x.subtitle, v.label, v.value, v.start, v.end].join(' ').toLowerCase().includes(needle)); if (!hits.length) return; const h = document.createElement('div'), b = document.createElement('b'); h.className = 'ch33head'; b.textContent = x.title; h.appendChild(b); content.appendChild(h); hits.forEach(v => { content.appendChild(itemView(v, -1, false)); n++; }); });
    if (!n) { const e = document.createElement('div'); e.className = 'ch33empty'; e.textContent = '当前分类没有匹配内容。'; content.appendChild(e); }
  }

  function render() {
    const c = cat(); card(); renderRail(); title.textContent = `${c?.name || '资料库'}${state.manage ? ' · 管理模式' : ''}`; panel.hidden = !state.open; bar.hidden = !state.manage; $('#ch33manage').textContent = state.manage ? '完成' : '管理'; if (!state.open) return; renderTabs(); state.search.trim() ? renderSearch(state.search.trim()) : renderCard();
  }

  $('#ch33close').onclick = () => { state.open = false; render(); };
  $('#ch33manage').onclick = () => { state.manage = !state.manage; render(); };
  search.oninput = e => { state.search = e.target.value || ''; render(); };
  $('#ch33addcat').onclick = () => editCategory();
  $('#ch33editcat').onclick = () => cat() && editCategory(cat());
  $('#ch33delcat').onclick = () => { const c = cat(); if (!c) return; if (db.categories.length <= 1) return alert('至少保留一个分类。'); if (!confirm(`确定删除分类「${c.name}」吗？\n其中 ${c.cards.length} 张卡片也会一并删除。`)) return; const i = db.categories.findIndex(x => x.id === c.id); db.categories.splice(i, 1); const next = db.categories[Math.min(i, db.categories.length - 1)]; state.categoryId = next.id; state.cardId = next.cards[0]?.id || ''; saveDB(); saveUI(); render(); };
  $('#ch33addcard').onclick = () => editCard();
  $('#ch33editcard').onclick = () => card() && editCard(card());
  $('#ch33delcard').onclick = () => { const c = cat(), x = card(); if (!c || !x || !confirm(`确定删除卡片「${x.title}」及其全部字段吗？`)) return; const i = c.cards.findIndex(v => v.id === x.id); c.cards.splice(i, 1); state.cardId = c.cards[Math.min(i, c.cards.length - 1)]?.id || ''; saveDB(); saveUI(); render(); };
  $('#ch33additem').onclick = () => editItem();

  $('#ch33export').onclick = () => { const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `campus-helper-v33-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 20000); notify('已导出'); };
  $('#ch33import').onclick = () => $('#ch33file').click();
  $('#ch33file').onchange = async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const raw = JSON.parse(await f.text()), next = normalizeV33(raw) || migrateV32(raw); if (!next) throw Error('不支持的资料库格式'); if (!confirm('导入会覆盖当前资料库。确定继续吗？')) return; db = next; state.categoryId = db.categories[0].id; state.cardId = db.categories[0].cards[0]?.id || ''; saveDB(); saveUI(); render(); notify('导入完成'); } catch (err) { alert(`导入失败：${err.message}`); } };
  $('#ch33reset').onclick = () => { state.left = Math.max(8, innerWidth - 535); state.top = 64; pos(); saveUI(); notify('位置已重置'); };

  (() => { const d = $('#ch33drag'); let on = false, sx = 0, sy = 0, sl = 0, st = 0; d.onpointerdown = e => { if (e.target.closest('button,input')) return; on = true; sx = e.clientX; sy = e.clientY; sl = state.left; st = state.top; d.setPointerCapture?.(e.pointerId); e.preventDefault(); }; d.onpointermove = e => { if (!on) return; state.left = sl + e.clientX - sx; state.top = st + e.clientY - sy; pos(); }; const stop = () => { if (on) { on = false; saveUI(); } }; d.onpointerup = stop; d.onpointercancel = stop; })();
  document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (!modal.hidden) closeModal(); else if (state.open) { state.open = false; render(); } }, true);
  addEventListener('resize', () => { pos(); saveUI(); });
  render();
  console.log('[秋招网申资料库 v3.3] 已启动');
})();
