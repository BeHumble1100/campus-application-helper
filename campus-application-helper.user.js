// ==UserScript==
// @name         秋招网申资料库 v3.4.3
// @namespace    campus-application-helper
// @version      3.4.3
// @description  分类/卡片/字段三级自定义；可移动、可缩放、拖拽排序；卡片按钮完整自动换行；JSON 导入导出。
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

  const ROOT = 'campus-helper-v343';
  const DB_KEY = 'campus-helper-v32-db';
  const UI_KEY = 'campus-helper-v343-ui';
  const OLD_UI_KEYS = ['campus-helper-v342-ui','campus-helper-v341-ui','campus-helper-v34-ui','campus-helper-v33-ui'];
  const DEF = { width: 450, height: 760, top: 64, rail: 56, gap: 8 };
  const MIN_W = 340, MIN_H = 400;
  if (document.getElementById(ROOT)) return;

  const uid = p => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const t = v => String(v ?? '');

  const defaultDB = () => ({
    version: 2,
    categories: [
      { id:'basic', name:'基本信息与求职意向', shortName:'基本', cards:[] },
      { id:'education', name:'教育经历', shortName:'教育', cards:[] },
      { id:'intern', name:'实习经历', shortName:'实习', cards:[] },
      { id:'project', name:'项目经验', shortName:'项目', cards:[] },
      { id:'skills', name:'技能与语言', shortName:'技能', cards:[] },
      { id:'campus', name:'校园经历与奖项', shortName:'校园', cards:[] },
      { id:'writing', name:'常用文案', shortName:'文案', cards:[] }
    ],
    updatedAt: Date.now()
  });

  function cleanItem(x) {
    if (!x || typeof x !== 'object' || x.kind === 'note') return null;
    const kind = ['field','text','period'].includes(x.kind) ? x.kind : 'field';
    return kind === 'period'
      ? { label:t(x.label), kind, start:t(x.start), end:t(x.end) }
      : { label:t(x.label), kind, value:t(x.value) };
  }

  function cleanCard(c) {
    return {
      id: t(c?.id) || uid('card'),
      title: t(c?.title) || '未命名卡片',
      shortName: t(c?.shortName || c?.title) || '卡片',
      subtitle: t(c?.subtitle),
      items: Array.isArray(c?.items) ? c.items.map(cleanItem).filter(Boolean) : []
    };
  }

  function normalize(raw) {
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

  function migrate(raw) {
    if (!raw?.data) return null;
    const old = raw.data;
    const all = Object.values(old).flatMap(g => Array.isArray(g?.cards) ? g.cards : []);
    const byId = new Map(all.map(c => [c.id,c]));
    const used = new Set();
    const db = defaultDB();
    const map = Object.fromEntries(db.categories.map(c => [c.id,c]));
    const take = ids => ids.flatMap(id => {
      const c = byId.get(id);
      if (!c) return [];
      used.add(c);
      return [cleanCard(c)];
    });
    map.basic.cards = take(['basic','job']);
    map.education.cards = take(['master','bachelor','highschool']);
    map.intern.cards = take(['uaes','zhida']);
    map.project.cards = take(['prism','checklist','deepresearch','robot']);
    map.skills.cards = take(['skills']);
    map.campus.cards = take(['campus','awards']);
    map.writing.cards = take(['self','advantage','career','hobby']);
    const remap = { basic:'basic', education:'education', intern:'intern', project:'project', writing:'writing' };
    Object.entries(remap).forEach(([o,n]) => (old[o]?.cards || []).forEach(c => {
      if (!used.has(c)) { map[n].cards.push(cleanCard(c)); used.add(c); }
    }));
    const rest = all.filter(c => !used.has(c)).map(cleanCard);
    if (rest.length) db.categories.push({ id:uid('cat'), name:'其他资料', shortName:'其他', cards:rest });
    return db;
  }

  let db;
  try {
    const raw = GM_getValue(DB_KEY, null);
    db = normalize(raw) || migrate(raw) || defaultDB();
  } catch (_) {
    db = defaultDB();
  }
  GM_setValue(DB_KEY, db);

  const state = {
    open:false, manage:false,
    categoryId:db.categories[0]?.id || '',
    cardId:db.categories[0]?.cards[0]?.id || '',
    search:'',
    left:Math.max(8, innerWidth - DEF.width - DEF.rail - DEF.gap - 16),
    top:DEF.top, width:DEF.width, height:DEF.height
  };

  for (const key of [UI_KEY, ...OLD_UI_KEYS]) {
    try {
      const s = GM_getValue(key, null);
      if (!s || typeof s !== 'object') continue;
      if (typeof s.categoryId === 'string') state.categoryId = s.categoryId;
      if (typeof s.cardId === 'string') state.cardId = s.cardId;
      for (const k of ['left','top','width','height']) if (Number.isFinite(s[k])) state[k] = s[k];
      break;
    } catch (_) {}
  }

  const root = document.createElement('div');
  root.id = ROOT;
  root.innerHTML = `
    <div id="ch343-shell">
      <aside id="ch343-rail"></aside>
      <section id="ch343-panel" hidden>
        <header id="ch343-drag">
          <div class="ch343-top">
            <div class="ch343-titlebox">
              <b id="ch343-title"></b>
              <small>拖标题栏移动 · 右下角调整大小 · 点击复制后手动粘贴</small>
            </div>
            <div class="ch343-topactions">
              <button id="ch343-manage">管理</button>
              <button id="ch343-close">×</button>
            </div>
          </div>
          <input id="ch343-search" type="search" placeholder="搜索当前分类…" autocomplete="off">
        </header>
        <div id="ch343-tabs"></div>
        <div id="ch343-toolbar" hidden>
          <button id="ch343-addcat">＋分类</button><button id="ch343-editcat">编辑分类</button><button id="ch343-delcat">删除分类</button>
          <span class="ch343-divider"></span>
          <button id="ch343-addcard">＋卡片</button><button id="ch343-editcard">编辑卡片</button><button id="ch343-delcard">删除卡片</button><button id="ch343-additem">＋字段</button>
          <span class="ch343-divider"></span>
          <button id="ch343-export">导出</button><button id="ch343-import">导入</button><button id="ch343-reset">重置布局</button>
          <input id="ch343-file" type="file" accept=".json,application/json" hidden>
        </div>
        <main id="ch343-content"></main>
        <footer>v3.4.3 · 卡片按钮完整自动换行</footer>
        <div id="ch343-toast"></div>
        <div id="ch343-resize" title="拖动调整大小；双击恢复默认大小">↘</div>
      </section>
    </div>
    <div id="ch343-modal" hidden>
      <div class="ch343-modalbox">
        <b id="ch343-modal-title"></b>
        <div id="ch343-modal-body"></div>
        <div class="ch343-modal-actions"><button id="ch343-cancel">取消</button><button id="ch343-save" class="ch343-primary">保存</button></div>
      </div>
    </div>`;

  const style = document.createElement('style');
  style.textContent = `
#${ROOT}{all:initial!important;position:fixed!important;inset:0!important;width:0!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;color-scheme:light!important}
#${ROOT},#${ROOT} *{box-sizing:border-box!important;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",Arial,sans-serif!important;text-shadow:none!important;letter-spacing:normal!important;text-transform:none!important}
#${ROOT} #ch343-shell,#${ROOT} #ch343-modal{pointer-events:auto!important}
#${ROOT} #ch343-shell{position:fixed!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;z-index:2147483647!important}
#${ROOT} button{all:revert!important;box-sizing:border-box!important;font:500 12px/1.2 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",Arial,sans-serif!important;appearance:none!important;-webkit-appearance:none!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;margin:0!important;padding:5px 8px!important;border:1px solid #cbd5e1!important;border-radius:8px!important;background:#fff!important;color:#334155!important;box-shadow:none!important;cursor:pointer!important;white-space:nowrap!important}
#${ROOT} button.ch343-primary{background:#155eef!important;border-color:#155eef!important;color:#fff!important}
#${ROOT} input,#${ROOT} textarea,#${ROOT} select{all:revert!important;box-sizing:border-box!important;font:400 12px/1.4 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",Arial,sans-serif!important;appearance:none!important;-webkit-appearance:none!important;display:block!important;width:100%!important;height:auto!important;min-height:0!important;margin:0!important;padding:7px 9px!important;border:1px solid #cbd5e1!important;border-radius:8px!important;background:#fff!important;color:#17243b!important;box-shadow:none!important;outline:none!important}
#${ROOT} textarea{min-height:130px!important;resize:vertical!important;white-space:pre-wrap!important}
#${ROOT} [hidden]{display:none!important}
#${ROOT} #ch343-rail{all:revert!important;box-sizing:border-box!important;position:absolute!important;top:0!important;width:${DEF.rail}px!important;height:auto!important;padding:6px!important;display:flex!important;flex-direction:column!important;gap:5px!important;overflow-x:hidden!important;overflow-y:auto!important;background:#f8fbff!important;border:1px solid #d9e2ef!important;border-radius:14px!important;box-shadow:0 8px 28px #0f172a33!important}
#${ROOT} #ch343-rail button{width:42px!important;min-height:40px!important;padding:5px 2px!important;border:0!important;border-radius:9px!important;background:transparent!important;color:#475569!important;font-size:11px!important;font-weight:700!important;white-space:normal!important;overflow-wrap:anywhere!important}
#${ROOT} #ch343-rail button.ch343-toggle{font-size:20px!important;color:#155eef!important}
#${ROOT} #ch343-rail button.ch343-on{background:#155eef!important;color:#fff!important}
#${ROOT} #ch343-panel{all:revert!important;box-sizing:border-box!important;position:relative!important;display:flex!important;flex-direction:column!important;min-width:${MIN_W}px!important;min-height:${MIN_H}px!important;margin:0!important;padding:0!important;overflow:hidden!important;background:#fff!important;color:#17243b!important;border:1px solid #d9e2ef!important;border-radius:15px!important;box-shadow:0 16px 48px #0f172a42!important;font-size:13px!important;line-height:1.55!important}
#${ROOT} #ch343-drag{all:revert!important;box-sizing:border-box!important;display:block!important;flex:0 0 auto!important;width:100%!important;height:auto!important;padding:12px!important;border-bottom:1px solid #e5eaf1!important;background:#fff!important;cursor:move!important;user-select:none!important}
#${ROOT} .ch343-top{all:revert!important;display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:10px!important;width:100%!important}
#${ROOT} .ch343-titlebox{all:revert!important;min-width:0!important;flex:1 1 auto!important}
#${ROOT} #ch343-title{all:revert!important;display:block!important;margin:0!important;color:#17243b!important;font-size:17px!important;font-weight:700!important;line-height:1.3!important}
#${ROOT} #ch343-drag small{all:revert!important;display:block!important;margin:2px 0 0!important;color:#64748b!important;font-size:11px!important;line-height:1.4!important}
#${ROOT} .ch343-topactions{all:revert!important;display:flex!important;gap:5px!important;flex:0 0 auto!important}
#${ROOT} #ch343-search{margin-top:10px!important;height:35px!important}
#${ROOT} #ch343-tabs{all:revert!important;box-sizing:border-box!important;display:flex!important;flex:0 0 auto!important;flex-shrink:0!important;flex-wrap:wrap!important;align-content:flex-start!important;align-items:flex-start!important;justify-content:flex-start!important;gap:6px!important;width:100%!important;height:auto!important;min-height:48px!important;max-height:none!important;margin:0!important;padding:9px 10px!important;overflow:visible!important;border-bottom:1px solid #e5eaf1!important;background:#fbfdff!important}
#${ROOT} .ch343-tab{flex:0 0 auto!important;max-width:100%!important;min-height:0!important;height:auto!important;padding:6px 10px!important;border-radius:999px!important;font-size:11px!important;white-space:nowrap!important}
#${ROOT} .ch343-tab.ch343-on{background:#17243b!important;border-color:#17243b!important;color:#fff!important}
#${ROOT} #ch343-toolbar{all:revert!important;box-sizing:border-box!important;display:flex!important;flex:0 0 auto!important;flex-wrap:wrap!important;align-items:center!important;gap:5px!important;width:100%!important;height:auto!important;padding:8px 10px!important;border-bottom:1px solid #e5eaf1!important;background:#f8fafc!important}
#${ROOT} .ch343-divider{display:block!important;flex:0 0 1px!important;align-self:stretch!important;min-height:24px!important;margin:2px!important;background:#d8dee8!important}
#${ROOT} #ch343-content{all:revert!important;box-sizing:border-box!important;display:block!important;flex:1 1 auto!important;width:100%!important;min-width:0!important;min-height:0!important;margin:0!important;padding:11px!important;overflow-x:hidden!important;overflow-y:auto!important;background:#fff!important;color:#17243b!important}
#${ROOT} .ch343-cardhead{all:revert!important;display:block!important;width:100%!important;height:auto!important;min-height:0!important;margin:0 0 10px!important;padding:0!important}
#${ROOT} .ch343-cardhead>b{all:revert!important;display:block!important;color:#17243b!important;font-size:15px!important;font-weight:700!important;line-height:1.35!important}
#${ROOT} .ch343-subtitle{all:revert!important;display:block!important;margin:2px 0 0!important;color:#64748b!important;font-size:11px!important;line-height:1.4!important}
#${ROOT} .ch343-item{all:revert!important;box-sizing:border-box!important;position:static!important;float:none!important;display:block!important;width:100%!important;height:auto!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;margin:0 0 9px!important;padding:10px!important;overflow:visible!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important;color:#17243b!important;box-shadow:none!important;transform:none!important}
#${ROOT} .ch343-item.ch343-textitem{background:#fbfdff!important}
#${ROOT} .ch343-dragging{opacity:.4!important}
#${ROOT} .ch343-labelrow{all:revert!important;display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:8px!important;width:100%!important;height:auto!important;min-height:0!important;margin:0 0 5px!important}
#${ROOT} .ch343-label{all:revert!important;display:block!important;flex:1 1 auto!important;min-width:0!important;height:auto!important;min-height:0!important;color:#334155!important;font-size:12px!important;font-weight:700!important;line-height:1.4!important}
#${ROOT} .ch343-handle{all:revert!important;display:block!important;flex:0 0 auto!important;color:#94a3b8!important;font-size:16px!important;line-height:1!important;cursor:grab!important}
#${ROOT} .ch343-value{all:revert!important;box-sizing:border-box!important;display:block!important;width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;overflow-wrap:anywhere!important;white-space:pre-wrap!important;color:#475569!important;font-size:12px!important;line-height:1.65!important;user-select:text!important}
#${ROOT} .ch343-value.ch343-cut{max-height:112px!important;overflow:hidden!important}
#${ROOT} .ch343-fieldrow{all:revert!important;box-sizing:border-box!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:8px!important;width:100%!important;height:auto!important;min-height:0!important}
#${ROOT} .ch343-fieldrow .ch343-value{color:#17243b!important;font-size:13px!important}
#${ROOT} .ch343-period{all:revert!important;display:block!important;height:auto!important;min-height:0!important;color:#17243b!important;font-size:13px!important;font-weight:700!important;line-height:1.45!important}
#${ROOT} .ch343-actions{all:revert!important;display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:5px!important;width:auto!important;height:auto!important;min-height:0!important;margin:8px 0 0!important}
#${ROOT} .ch343-empty{all:revert!important;display:block!important;width:100%!important;height:auto!important;min-height:0!important;padding:30px 10px!important;color:#64748b!important;font-size:12px!important;text-align:center!important}
#${ROOT} #ch343-panel footer{all:revert!important;box-sizing:border-box!important;display:block!important;flex:0 0 auto!important;width:100%!important;height:auto!important;min-height:0!important;padding:7px 30px 7px 11px!important;border-top:1px solid #e5eaf1!important;background:#fbfdff!important;color:#64748b!important;font-size:10px!important;line-height:1.4!important}
#${ROOT} #ch343-toast{all:revert!important;box-sizing:border-box!important;position:absolute!important;right:12px!important;bottom:38px!important;padding:8px 10px!important;border-radius:9px!important;background:#17243b!important;color:#fff!important;font-size:12px!important;opacity:0!important;transition:opacity .15s!important;pointer-events:none!important;z-index:4!important}
#${ROOT} #ch343-toast.ch343-show{opacity:1!important}
#${ROOT} #ch343-resize{all:revert!important;box-sizing:border-box!important;position:absolute!important;right:2px!important;bottom:2px!important;display:flex!important;align-items:center!important;justify-content:center!important;width:22px!important;height:22px!important;border-radius:6px!important;background:transparent!important;color:#64748b!important;font-size:16px!important;cursor:nwse-resize!important;user-select:none!important;z-index:5!important}
#${ROOT} #ch343-resize:hover{background:#eef3f8!important;color:#155eef!important}
#${ROOT} #ch343-modal{all:revert!important;box-sizing:border-box!important;position:fixed!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;background:#0f172a55!important;z-index:2147483647!important}
#${ROOT} .ch343-modalbox{all:revert!important;box-sizing:border-box!important;display:block!important;width:min(520px,92vw)!important;max-height:88vh!important;padding:14px!important;overflow-y:auto!important;background:#fff!important;color:#17243b!important;border-radius:14px!important;box-shadow:0 20px 60px #0005!important}
#${ROOT} #ch343-modal-title{all:revert!important;display:block!important;margin:0 0 10px!important;color:#17243b!important;font-size:16px!important;font-weight:700!important}
#${ROOT} #ch343-modal-body>div{all:revert!important;box-sizing:border-box!important;display:block!important;width:100%!important;height:auto!important;min-height:0!important}
#${ROOT} .ch343-modalbox label{all:revert!important;display:block!important;margin:9px 0 4px!important;color:#17243b!important;font-size:12px!important;font-weight:700!important}
#${ROOT} .ch343-modal-actions{all:revert!important;display:flex!important;justify-content:flex-end!important;gap:7px!important;width:100%!important;margin:12px 0 0!important}
`;

  (document.head || document.documentElement).appendChild(style);
  (document.body || document.documentElement).appendChild(root);

  const $ = s => root.querySelector(s);
  const shell=$('#ch343-shell'), rail=$('#ch343-rail'), panel=$('#ch343-panel'), title=$('#ch343-title'), tabs=$('#ch343-tabs'), toolbar=$('#ch343-toolbar'), content=$('#ch343-content'), search=$('#ch343-search'), toast=$('#ch343-toast'), modal=$('#ch343-modal'), modalTitle=$('#ch343-modal-title'), modalBody=$('#ch343-modal-body'), resizeHandle=$('#ch343-resize');

  const saveDB = () => { db.updatedAt = Date.now(); GM_setValue(DB_KEY, db); };
  const saveUI = () => GM_setValue(UI_KEY, { categoryId:state.categoryId, cardId:state.cardId, left:state.left, top:state.top, width:state.width, height:state.height });

  function currentCategory() {
    let c = db.categories.find(x => x.id === state.categoryId);
    if (!c) { c = db.categories[0] || null; state.categoryId = c?.id || ''; }
    return c;
  }

  function currentCard() {
    const c = currentCategory();
    if (!c) return null;
    let x = c.cards.find(v => v.id === state.cardId);
    if (!x) { x = c.cards[0] || null; state.cardId = x?.id || ''; }
    return x;
  }

  function applyLayout() {
    const reserved = DEF.rail + DEF.gap + 12;
    state.left = Math.max(0, Math.min(Math.max(0, innerWidth - MIN_W - reserved), state.left));
    state.top = Math.max(0, Math.min(Math.max(0, innerHeight - 80), state.top));
    state.width = Math.max(MIN_W, Math.min(Math.max(MIN_W, innerWidth - state.left - reserved), state.width));
    state.height = Math.max(MIN_H, Math.min(Math.max(MIN_H, innerHeight - state.top - 8), state.height));
    shell.style.setProperty('left', `${state.left}px`, 'important');
    shell.style.setProperty('top', `${state.top}px`, 'important');
    panel.style.setProperty('width', `${state.width}px`, 'important');
    panel.style.setProperty('height', `${state.height}px`, 'important');
    rail.style.setProperty('left', `${state.width + DEF.gap}px`, 'important');
    rail.style.setProperty('max-height', `${state.height}px`, 'important');
  }

  function resetLayout() {
    state.width=DEF.width; state.height=DEF.height;
    state.left=Math.max(8, innerWidth-state.width-DEF.rail-DEF.gap-16); state.top=DEF.top;
    applyLayout(); saveUI();
  }

  function notify(m) {
    toast.textContent=m; toast.classList.add('ch343-show'); clearTimeout(notify.timer);
    notify.timer=setTimeout(()=>toast.classList.remove('ch343-show'),1200);
  }

  async function copy(v,l) {
    try {
      if (typeof GM_setClipboard === 'function') GM_setClipboard(t(v),'text');
      else await navigator.clipboard.writeText(t(v));
      notify(`已复制：${l}`);
    } catch (e) { console.error(e); notify('复制失败'); }
  }

  function button(label, fn, primary=false) {
    const b=document.createElement('button'); b.type='button'; b.textContent=label; if(primary)b.classList.add('ch343-primary'); b.onclick=fn; return b;
  }

  function control(label,value='',type='input') {
    const wrap=document.createElement('div'), lab=document.createElement('label');
    const el=document.createElement(type==='textarea'?'textarea':type==='select'?'select':'input');
    lab.textContent=label; if(type!=='select') el.value=value; wrap.append(lab,el); return {wrap,el};
  }

  function openModal(name,body,onSave) {
    modalTitle.textContent=name; modalBody.replaceChildren(body); modal.hidden=false;
    $('#ch343-save').onclick=()=>{ if(onSave()!==false) closeModal(); };
  }
  function closeModal(){ modal.hidden=true; $('#ch343-save').onclick=null; }
  $('#ch343-cancel').onclick=closeModal;
  modal.onclick=e=>{ if(e.target===modal) closeModal(); };

  function editCategory(target=null) {
    const box=document.createElement('div'), name=control('分类名称',target?.name||''), short=control('侧栏短名',target?.shortName||''); box.append(name.wrap,short.wrap);
    openModal(target?'编辑分类':'新增分类',box,()=>{
      const n=name.el.value.trim(), s=short.el.value.trim(); if(!n){alert('分类名称不能为空');return false;}
      if(target){target.name=n;target.shortName=s||n.slice(0,4);} else {const c={id:uid('cat'),name:n,shortName:s||n.slice(0,4),cards:[]};db.categories.push(c);state.categoryId=c.id;state.cardId='';}
      saveDB();saveUI();render();return true;
    });
  }

  function deleteCategory(){
    const c=currentCategory(); if(!c)return; if(db.categories.length<=1){alert('至少保留一个分类。');return;}
    if(!confirm(`确定删除分类「${c.name}」吗？\n其中 ${c.cards.length} 张卡片也会一并删除。`))return;
    const i=db.categories.findIndex(x=>x.id===c.id); db.categories.splice(i,1); const n=db.categories[Math.min(i,db.categories.length-1)]; state.categoryId=n.id;state.cardId=n.cards[0]?.id||'';saveDB();saveUI();render();
  }

  function editCard(target=null){
    const c=currentCategory();if(!c)return;
    const box=document.createElement('div'), titleCtl=control('卡片标题',target?.title||''), shortCtl=control('顶部按钮短名',target?.shortName||''), subCtl=control('副标题（可选）',target?.subtitle||''); box.append(titleCtl.wrap,shortCtl.wrap,subCtl.wrap);
    openModal(target?'编辑卡片':'新增卡片',box,()=>{
      const title=titleCtl.el.value.trim();if(!title){alert('卡片标题不能为空');return false;}
      if(target){target.title=title;target.shortName=shortCtl.el.value.trim()||title;target.subtitle=subCtl.el.value.trim();}
      else{const x={id:uid('card'),title,shortName:shortCtl.el.value.trim()||title,subtitle:subCtl.el.value.trim(),items:[]};c.cards.push(x);state.cardId=x.id;}
      saveDB();saveUI();render();return true;
    });
  }

  function deleteCard(){
    const c=currentCategory(),x=currentCard();if(!c||!x)return;if(!confirm(`确定删除卡片「${x.title}」及其全部字段吗？`))return;
    const i=c.cards.findIndex(v=>v.id===x.id);c.cards.splice(i,1);state.cardId=c.cards[Math.min(i,c.cards.length-1)]?.id||'';saveDB();saveUI();render();
  }

  function editItem(target=null,index=-1){
    const card=currentCard();if(!card){notify('请先添加卡片');return;}
    const box=document.createElement('div'),kind=control('类型','','select');
    [['field','短字段'],['text','长文本'],['period','时间区间']].forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;kind.el.appendChild(o);});
    kind.el.value=target?.kind||'field';
    const label=control('字段名称',target?.label||''),value=control('内容',target?.value||'','textarea'),start=control('开始时间',target?.start||''),end=control('结束时间',target?.end||''); box.append(kind.wrap,label.wrap,value.wrap,start.wrap,end.wrap);
    const sync=()=>{const p=kind.el.value==='period';value.wrap.style.display=p?'none':'';start.wrap.style.display=p?'':'none';end.wrap.style.display=p?'':'none';};kind.el.onchange=sync;sync();
    openModal(target?'编辑字段':'新增字段',box,()=>{
      const l=label.el.value.trim();if(!l){alert('字段名称不能为空');return false;}
      const item={label:l,kind:kind.el.value};if(item.kind==='period'){item.start=start.el.value.trim();item.end=end.el.value.trim();}else item.value=value.el.value;
      if(target)card.items[index]=item;else card.items.push(item);saveDB();render();return true;
    });
  }

  function deleteItem(index){const c=currentCard(),x=c?.items[index];if(!x)return;if(!confirm(`确定删除「${x.label}」吗？`))return;c.items.splice(index,1);saveDB();render();}

  function itemView(item,index,allowManage=true){
    const box=document.createElement('section');box.className=`ch343-item${item.kind==='text'?' ch343-textitem':''}`;box.dataset.index=String(index);box.draggable=!!(state.manage&&allowManage);
    const lr=document.createElement('div'),lab=document.createElement('div');lr.className='ch343-labelrow';lab.className='ch343-label';lab.textContent=item.label;lr.appendChild(lab);
    if(state.manage&&allowManage){const h=document.createElement('span');h.className='ch343-handle';h.textContent='≡';lr.appendChild(h);}box.appendChild(lr);
    if(item.kind==='period'){
      const v=document.createElement('div'),a=document.createElement('div');v.className='ch343-period';v.textContent=`${t(item.start)} — ${t(item.end)}`;a.className='ch343-actions';a.append(button('复制区间',()=>copy(`${t(item.start)} — ${t(item.end)}`,item.label),true),button('开始',()=>copy(item.start,`${item.label} · 开始`)),button('结束',()=>copy(item.end,`${item.label} · 结束`)));box.append(v,a);
    }else if(item.kind==='field'){
      const r=document.createElement('div'),v=document.createElement('div');r.className='ch343-fieldrow';v.className='ch343-value';v.textContent=t(item.value);r.append(v,button('复制',()=>copy(item.value,item.label),true));box.appendChild(r);
    }else{
      const v=document.createElement('div'),a=document.createElement('div');v.className='ch343-value';v.textContent=t(item.value);const cut=t(item.value).length>180;if(cut)v.classList.add('ch343-cut');a.className='ch343-actions';a.appendChild(button('复制整段',()=>copy(item.value,item.label),true));if(cut){const e=button('展开',()=>{const c=v.classList.toggle('ch343-cut');e.textContent=c?'展开':'收起';});a.appendChild(e);}box.append(v,a);
    }
    if(state.manage&&allowManage){const a=document.createElement('div');a.className='ch343-actions';a.append(button('编辑',()=>editItem(item,index)),button('删除',()=>deleteItem(index)));box.appendChild(a);}return box;
  }

  function renderRail(){
    rail.replaceChildren();const toggle=button('☷',()=>{state.open=!state.open;render();});toggle.className='ch343-toggle';toggle.title='展开 / 收起';rail.appendChild(toggle);
    db.categories.forEach((c,i)=>{const e=button(c.shortName||c.name,()=>{if(state.open&&state.categoryId===c.id)state.open=false;else{state.categoryId=c.id;state.cardId=c.cards[0]?.id||'';state.search='';search.value='';state.open=true;saveUI();}render();});e.title=c.name;e.classList.toggle('ch343-on',state.open&&state.categoryId===c.id);e.draggable=state.manage;
      if(state.manage){e.ondragstart=ev=>{e.classList.add('ch343-dragging');ev.dataTransfer.setData('text/category',String(i));};e.ondragend=()=>e.classList.remove('ch343-dragging');e.ondragover=ev=>ev.preventDefault();e.ondrop=ev=>{ev.preventDefault();const from=Number(ev.dataTransfer.getData('text/category'));if(Number.isInteger(from)&&from!==i){const[m]=db.categories.splice(from,1);db.categories.splice(i,0,m);saveDB();render();}};}rail.appendChild(e);});
  }

  function renderTabs(){
    tabs.replaceChildren();const c=currentCategory();if(!c)return;
    c.cards.forEach((card,i)=>{const e=button(card.shortName||card.title,()=>{state.cardId=card.id;state.search='';search.value='';saveUI();render();});e.className=`ch343-tab${card.id===state.cardId?' ch343-on':''}`;e.title=card.title;e.draggable=state.manage;
      if(state.manage){e.ondragstart=ev=>{e.classList.add('ch343-dragging');ev.dataTransfer.setData('text/card',String(i));};e.ondragend=()=>e.classList.remove('ch343-dragging');e.ondragover=ev=>ev.preventDefault();e.ondrop=ev=>{ev.preventDefault();const from=Number(ev.dataTransfer.getData('text/card'));if(Number.isInteger(from)&&from!==i){const[m]=c.cards.splice(from,1);c.cards.splice(i,0,m);saveDB();render();}};}tabs.appendChild(e);});
  }

  function renderCard(){
    content.replaceChildren();const card=currentCard();if(!card){const e=document.createElement('div');e.className='ch343-empty';e.textContent=state.manage?'这个分类还没有卡片，点“＋卡片”添加。':'这个分类暂无资料。';content.appendChild(e);return;}
    const h=document.createElement('div'),b=document.createElement('b');h.className='ch343-cardhead';b.textContent=card.title;h.appendChild(b);if(card.subtitle){const s=document.createElement('div');s.className='ch343-subtitle';s.textContent=card.subtitle;h.appendChild(s);}content.appendChild(h);
    card.items.forEach((it,i)=>content.appendChild(itemView(it,i,true)));if(!card.items.length){const e=document.createElement('div');e.className='ch343-empty';e.textContent=state.manage?'这个卡片还没有字段，点“＋字段”添加。':'这个卡片暂无内容。';content.appendChild(e);}
    if(state.manage)content.querySelectorAll('.ch343-item').forEach(el=>{el.ondragstart=ev=>{el.classList.add('ch343-dragging');ev.dataTransfer.setData('text/item',el.dataset.index);};el.ondragend=()=>el.classList.remove('ch343-dragging');el.ondragover=ev=>ev.preventDefault();el.ondrop=ev=>{ev.preventDefault();const from=Number(ev.dataTransfer.getData('text/item')),to=Number(el.dataset.index);if(Number.isInteger(from)&&Number.isInteger(to)&&from!==to){const[m]=card.items.splice(from,1);card.items.splice(to,0,m);saveDB();render();}};});
  }

  function renderSearch(q){
    content.replaceChildren();const c=currentCategory();if(!c)return;const needle=q.toLowerCase();let n=0;
    c.cards.forEach(card=>{const hits=card.items.filter(it=>[card.title,card.subtitle,it.label,it.value,it.start,it.end].join(' ').toLowerCase().includes(needle));if(!hits.length)return;const h=document.createElement('div'),b=document.createElement('b');h.className='ch343-cardhead';b.textContent=card.title;h.appendChild(b);content.appendChild(h);hits.forEach(it=>{content.appendChild(itemView(it,-1,false));n++;});});
    if(!n){const e=document.createElement('div');e.className='ch343-empty';e.textContent='当前分类没有匹配内容。';content.appendChild(e);}
  }

  function render(){
    const c=currentCategory();currentCard();renderRail();title.textContent=`${c?.name||'资料库'}${state.manage?' · 管理模式':''}`;panel.hidden=!state.open;toolbar.hidden=!state.manage;$('#ch343-manage').textContent=state.manage?'完成':'管理';applyLayout();if(!state.open)return;renderTabs();state.search.trim()?renderSearch(state.search.trim()):renderCard();
  }

  $('#ch343-close').onclick=()=>{state.open=false;render();};
  $('#ch343-manage').onclick=()=>{state.manage=!state.manage;render();};
  search.oninput=e=>{state.search=e.target.value||'';render();};
  $('#ch343-addcat').onclick=()=>editCategory();
  $('#ch343-editcat').onclick=()=>{const c=currentCategory();if(c)editCategory(c);};
  $('#ch343-delcat').onclick=deleteCategory;
  $('#ch343-addcard').onclick=()=>editCard();
  $('#ch343-editcard').onclick=()=>{const c=currentCard();if(c)editCard(c);};
  $('#ch343-delcard').onclick=deleteCard;
  $('#ch343-additem').onclick=()=>editItem();
  $('#ch343-reset').onclick=()=>{resetLayout();notify('布局已重置');};

  $('#ch343-export').onclick=()=>{const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`campus-helper-v343-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);notify('已导出');};
  $('#ch343-import').onclick=()=>$('#ch343-file').click();
  $('#ch343-file').onchange=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{const raw=JSON.parse(await file.text()),next=normalize(raw)||migrate(raw);if(!next)throw new Error('不支持的资料库格式');if(!confirm('导入会覆盖当前资料库。确定继续吗？'))return;db=next;state.categoryId=db.categories[0]?.id||'';state.cardId=db.categories[0]?.cards[0]?.id||'';saveDB();saveUI();render();notify('导入完成');}catch(err){alert(`导入失败：${err.message}`);}};

  (()=>{const drag=$('#ch343-drag');let active=false,sx=0,sy=0,sl=0,st=0;drag.onpointerdown=e=>{if(e.target.closest('button,input'))return;active=true;sx=e.clientX;sy=e.clientY;sl=state.left;st=state.top;drag.setPointerCapture?.(e.pointerId);e.preventDefault();};drag.onpointermove=e=>{if(!active)return;state.left=sl+e.clientX-sx;state.top=st+e.clientY-sy;applyLayout();};const stop=()=>{if(!active)return;active=false;saveUI();};drag.onpointerup=stop;drag.onpointercancel=stop;})();

  (()=>{let active=false,sx=0,sy=0,sw=0,sh=0;resizeHandle.onpointerdown=e=>{active=true;sx=e.clientX;sy=e.clientY;sw=state.width;sh=state.height;resizeHandle.setPointerCapture?.(e.pointerId);e.preventDefault();e.stopPropagation();};resizeHandle.onpointermove=e=>{if(!active)return;const maxW=Math.max(MIN_W,innerWidth-state.left-DEF.rail-DEF.gap-12),maxH=Math.max(MIN_H,innerHeight-state.top-8);state.width=Math.max(MIN_W,Math.min(maxW,sw+e.clientX-sx));state.height=Math.max(MIN_H,Math.min(maxH,sh+e.clientY-sy));applyLayout();};const stop=()=>{if(!active)return;active=false;saveUI();};resizeHandle.onpointerup=stop;resizeHandle.onpointercancel=stop;resizeHandle.ondblclick=e=>{e.preventDefault();state.width=DEF.width;state.height=DEF.height;applyLayout();saveUI();notify('大小已恢复默认');};})();

  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!modal.hidden)closeModal();else if(state.open){state.open=false;render();}},true);
  addEventListener('resize',()=>{applyLayout();saveUI();});
  applyLayout();render();console.log('[秋招网申资料库 v3.4.3] 已启动');
})();
