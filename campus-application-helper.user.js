// ==UserScript==
// @name         秋招网申资料库 v3.2 可维护版
// @namespace    campus-application-helper
// @version      3.2.0
// @description  五分类完整经历卡片；可拖动界面、拖拽排序、增删改卡片和字段、JSON 备份；不自动填写或提交网页表单。
// @match        http://*/*
// @match        https://*/*
// @run-at       document-end
// @noframes
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function(){
'use strict';

const ROOT='campus-helper-v32';
const STYLE='campus-helper-v32-style';
const DB_KEY='campus-helper-v32-db';
const UI_KEY='campus-helper-v32-ui';
const ORDER=['writing','project','intern','education','basic'];
const DEFAULT_DATA={
  "writing": {
    "label": "???? 1",
    "cards": [
      {
        "id": "self",
        "title": "???? 1",
        "items": [
          {
            "label": "?? 1",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 2",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 3",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 4",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 5",
            "kind": "field",
            "value": "????"
          }
        ]
      },
      {
        "id": "advantage",
        "title": "???? 2",
        "items": [
          {
            "label": "?? 6",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 7",
            "kind": "text",
            "value": "????"
          }
        ]
      },
      {
        "id": "career",
        "title": "???? 3",
        "items": [
          {
            "label": "?? 8",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 9",
            "kind": "text",
            "value": "????"
          }
        ]
      },
      {
        "id": "skills",
        "title": "???? 4",
        "items": [
          {
            "label": "?? 10",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 11",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 12",
            "kind": "field",
            "value": "????",
            "warning": false
          },
          {
            "label": "?? 13",
            "kind": "field",
            "value": "????"
          }
        ]
      },
      {
        "id": "hobby",
        "title": "???? 5",
        "items": [
          {
            "label": "?? 14",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 15",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 16",
            "kind": "field",
            "value": "????"
          }
        ]
      },
      {
        "id": "campus",
        "title": "???? 6",
        "items": [
          {
            "label": "?? 17",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 18",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 19",
            "kind": "field",
            "value": "????",
            "warning": false
          },
          {
            "label": "?? 20",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 21",
            "kind": "period",
            "start": "2024-09",
            "end": "2025-06",
            "warning": false
          }
        ]
      },
      {
        "id": "awards",
        "title": "???? 7",
        "items": [
          {
            "label": "?? 22",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 23",
            "kind": "field",
            "value": "????",
            "warning": false
          },
          {
            "label": "?? 24",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 25",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 26",
            "kind": "field",
            "value": "????"
          }
        ]
      }
    ]
  },
  "project": {
    "label": "???? 2",
    "cards": [
      {
        "id": "prism",
        "title": "???? 8",
        "subtitle": "????",
        "items": [
          {
            "label": "?? 27",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 28",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 29",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 30",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 31",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 32",
            "kind": "field",
            "value": "????"
          }
        ]
      },
      {
        "id": "checklist",
        "title": "???? 9",
        "subtitle": "????",
        "items": [
          {
            "label": "?? 33",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 34",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 35",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 36",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 37",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 38",
            "kind": "field",
            "value": "????"
          }
        ]
      },
      {
        "id": "deepresearch",
        "title": "???? 10",
        "subtitle": "????",
        "items": [
          {
            "label": "?? 39",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 40",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 41",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 42",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 43",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 44",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 45",
            "kind": "note",
            "value": "????"
          }
        ]
      },
      {
        "id": "robot",
        "title": "???? 11",
        "subtitle": "????",
        "items": [
          {
            "label": "?? 46",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 47",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 48",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 49",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 50",
            "kind": "field",
            "value": "????"
          }
        ]
      }
    ]
  },
  "intern": {
    "label": "???? 3",
    "cards": [
      {
        "id": "uaes",
        "title": "???? 12",
        "items": [
          {
            "label": "?? 51",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 52",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 53",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 54",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 55",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 56",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 57",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 58",
            "kind": "period",
            "start": "2024-09",
            "end": "2025-06"
          },
          {
            "label": "?? 59",
            "kind": "note",
            "value": "????"
          },
          {
            "label": "?? 60",
            "kind": "field",
            "value": "????"
          }
        ]
      },
      {
        "id": "zhida",
        "title": "???? 13",
        "items": [
          {
            "label": "?? 61",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 62",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 63",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 64",
            "kind": "field",
            "value": "????",
            "warning": false
          },
          {
            "label": "?? 65",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 66",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 67",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 68",
            "kind": "period",
            "start": "2024-09",
            "end": "2025-06"
          },
          {
            "label": "?? 69",
            "kind": "note",
            "value": "????"
          },
          {
            "label": "?? 70",
            "kind": "field",
            "value": "????"
          }
        ]
      }
    ]
  },
  "education": {
    "label": "???? 4",
    "cards": [
      {
        "id": "master",
        "title": "???? 14",
        "items": [
          {
            "label": "?? 71",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 72",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 73",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 74",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 75",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 76",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 77",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 78",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 79",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 80",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 81",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 82",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 83",
            "kind": "period",
            "start": "2024-09",
            "end": "2025-06"
          },
          {
            "label": "?? 84",
            "kind": "note",
            "value": "????"
          },
          {
            "label": "?? 85",
            "kind": "note",
            "value": "????"
          },
          {
            "label": "?? 86",
            "kind": "note",
            "value": "????"
          }
        ]
      },
      {
        "id": "bachelor",
        "title": "???? 15",
        "items": [
          {
            "label": "?? 87",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 88",
            "kind": "text",
            "value": "????"
          },
          {
            "label": "?? 89",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 90",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 91",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 92",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 93",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 94",
            "kind": "field",
            "value": "????",
            "warning": false
          },
          {
            "label": "?? 95",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 96",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 97",
            "kind": "period",
            "start": "2024-09",
            "end": "2025-06"
          },
          {
            "label": "?? 98",
            "kind": "note",
            "value": "????"
          },
          {
            "label": "?? 99",
            "kind": "note",
            "value": "????"
          },
          {
            "label": "?? 100",
            "kind": "note",
            "value": "????"
          }
        ]
      },
      {
        "id": "highschool",
        "title": "???? 16",
        "items": [
          {
            "label": "?? 101",
            "kind": "field",
            "value": "????",
            "warning": false
          },
          {
            "label": "?? 102",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 103",
            "kind": "period",
            "start": "2024-09",
            "end": "2025-06",
            "warning": false
          }
        ]
      }
    ]
  },
  "basic": {
    "label": "???? 5",
    "cards": [
      {
        "id": "basic",
        "title": "???? 17",
        "items": [
          {
            "label": "?? 104",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 105",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 106",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 107",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 108",
            "kind": "field",
            "value": "????",
            "warning": false
          },
          {
            "label": "?? 109",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 110",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 111",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 112",
            "kind": "field",
            "value": "????",
            "warning": false
          },
          {
            "label": "?? 113",
            "kind": "field",
            "value": "????",
            "warning": false
          },
          {
            "label": "?? 114",
            "kind": "field",
            "value": "????",
            "warning": false
          },
          {
            "label": "?? 115",
            "kind": "field",
            "value": "????",
            "warning": false
          },
          {
            "label": "?? 116",
            "kind": "field",
            "value": "????",
            "warning": false
          }
        ]
      },
      {
        "id": "job",
        "title": "???? 18",
        "items": [
          {
            "label": "?? 117",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 118",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 119",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 120",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 121",
            "kind": "field",
            "value": "????"
          },
          {
            "label": "?? 122",
            "kind": "field",
            "value": "????",
            "warning": false
          }
        ]
      }
    ]
  }
};

if(document.getElementById(ROOT)) return;

function clone(v){return JSON.parse(JSON.stringify(v));}
function uid(prefix='id'){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
function safeText(v){return String(v??'');}

function loadDB(){
  try{
    const raw=GM_getValue(DB_KEY,null);
    if(raw && typeof raw==='object' && raw.version===1 && raw.data) return raw;
  }catch(e){console.error('[v3.2] DB 读取失败',e);}
  const fresh={version:1,data:clone(DEFAULT_DATA),createdAt:Date.now(),updatedAt:Date.now()};
  try{GM_setValue(DB_KEY,fresh);}catch(e){console.error('[v3.2] DB 初始化失败',e);}
  return fresh;
}

let db=loadDB();
let state={open:false,manage:false,category:'writing',card:'self',search:'',pos:{right:72,top:48}};
try{
  const s=GM_getValue(UI_KEY,null);
  if(s&&typeof s==='object'){
    if(ORDER.includes(s.category)) state.category=s.category;
    if(typeof s.card==='string') state.card=s.card;
    if(s.pos&&Number.isFinite(s.pos.right)&&Number.isFinite(s.pos.top)) state.pos=s.pos;
  }
}catch(_e){}

function saveDB(){db.updatedAt=Date.now();GM_setValue(DB_KEY,db);}
function saveUI(){try{GM_setValue(UI_KEY,{category:state.category,card:state.card,pos:state.pos});}catch(_e){}}
function data(){return db.data;}
function cat(){return data()[state.category]||data().writing;}
function ensureCard(){if(!cat().cards.some(c=>c.id===state.card)) state.card=cat().cards[0]?.id||'';}
function currentCard(){ensureCard();return cat().cards.find(c=>c.id===state.card)||null;}

const root=document.createElement('div');
root.id=ROOT;
root.innerHTML=`
<div id="ch32shell">
  <aside id="ch32rail">
    <button data-a="toggle" title="展开/收起">☷</button>
    <button data-c="writing">文案</button><button data-c="project">项目</button>
    <button data-c="intern">实习</button><button data-c="education">教育</button>
    <button data-c="basic">基本</button>
  </aside>
  <section id="ch32panel" hidden>
    <header id="ch32drag">
      <div class="ch32top">
        <div><b id="ch32title">秋招网申资料库</b><small>拖住此标题栏可移动 · 点击复制后手动粘贴</small></div>
        <div class="ch32top-actions"><button id="ch32manage">管理</button><button id="ch32close">×</button></div>
      </div>
      <input id="ch32search" type="search" placeholder="搜索当前分类…" autocomplete="off">
    </header>
    <div id="ch32tabs"></div>
    <div id="ch32managebar" hidden>
      <button id="ch32addcard">＋ 卡片</button><button id="ch32editcard">编辑卡片</button><button id="ch32delcard">删除卡片</button>
      <button id="ch32additem">＋ 字段</button><button id="ch32export">导出 JSON</button><button id="ch32import">导入 JSON</button><button id="ch32resetpos">重置位置</button>
      <input id="ch32file" type="file" accept=".json,application/json" hidden>
    </div>
    <main id="ch32content"></main>
    <footer>v3.2 · 管理模式下可拖拽卡片与字段排序，所有修改保存在 Tampermonkey 本地存储。</footer>
    <div id="ch32toast"></div>
  </section>
</div>
<div id="ch32modal" hidden><div class="ch32modal-card">
  <div class="ch32modal-title" id="ch32modal-title"></div>
  <div id="ch32modal-body"></div>
  <div class="ch32modal-actions"><button id="ch32modal-cancel">取消</button><button id="ch32modal-save" class="primary">保存</button></div>
</div></div>`;

const css=document.createElement('style');
css.id=STYLE;
css.textContent=`
#${ROOT},#${ROOT} *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",Arial,sans-serif}
#${ROOT}{position:fixed!important;inset:0!important;width:0!important;height:0!important;z-index:2147483647!important;color-scheme:light!important}
#ch32shell{position:fixed!important;right:72px!important;top:48px!important;z-index:2147483647!important}
#ch32rail{position:absolute!important;left:458px!important;top:0!important;width:52px!important;padding:6px!important;display:flex!important;flex-direction:column!important;gap:5px!important;background:#f8fbff!important;border:1px solid #d9e2ef!important;border-radius:14px!important;box-shadow:0 8px 28px #0f172a33!important}
#ch32rail button{width:40px!important;height:40px!important;padding:0!important;margin:0!important;border:0!important;border-radius:9px!important;background:transparent!important;color:#475569!important;font-size:12px!important;font-weight:700!important;cursor:pointer!important;box-shadow:none!important}
#ch32rail button:first-child{font-size:20px!important;color:#155eef!important}#ch32rail button:hover{background:#e7eef9!important}#ch32rail button.on{background:#155eef!important;color:#fff!important}
#ch32panel{width:450px!important;height:min(820px,90vh)!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;background:#fff!important;color:#17243b!important;border:1px solid #d9e2ef!important;border-radius:15px!important;box-shadow:0 16px 48px #0f172a42!important;font-size:13px!important;line-height:1.55!important}
#ch32panel[hidden],#ch32modal[hidden],#ch32managebar[hidden]{display:none!important}
#ch32panel header{padding:12px!important;border-bottom:1px solid #e5eaf1!important;cursor:move!important;user-select:none!important}.ch32top{display:flex!important;justify-content:space-between!important;gap:10px!important}.ch32top-actions{display:flex!important;gap:5px!important}#ch32title{display:block!important;font-size:17px!important}#ch32panel small{display:block!important;margin-top:2px!important;color:#64748b!important;font-size:11px!important}
#ch32panel button,#ch32modal button{border:1px solid #cbd5e1!important;border-radius:8px!important;background:#fff!important;color:#334155!important;cursor:pointer!important;padding:5px 8px!important;font-size:12px!important;box-shadow:none!important}#ch32panel button.primary,#ch32modal button.primary{background:#155eef!important;border-color:#155eef!important;color:#fff!important}
#ch32search{width:100%!important;height:35px!important;margin-top:10px!important;padding:7px 9px!important;border:1px solid #cbd5e1!important;border-radius:8px!important;background:#fff!important;color:#17243b!important;font-size:12px!important;cursor:text!important}
#ch32tabs{display:flex!important;gap:6px!important;padding:9px 10px!important;overflow-x:auto!important;border-bottom:1px solid #e5eaf1!important;background:#fbfdff!important}.ch32tab{flex:0 0 auto!important;padding:5px 9px!important;border:1px solid #d7dfeb!important;border-radius:999px!important;background:#fff!important;color:#475569!important;font-size:11px!important;cursor:pointer!important}.ch32tab.on{background:#17243b!important;border-color:#17243b!important;color:#fff!important}.ch32tab.dragging{opacity:.45!important}.ch32tab[draggable="true"]{cursor:grab!important}
#ch32managebar{display:flex!important;gap:5px!important;flex-wrap:wrap!important;padding:8px 10px!important;border-bottom:1px solid #e5eaf1!important;background:#f8fafc!important}
#ch32content{flex:1!important;min-height:0!important;overflow:auto!important;padding:11px!important;background:#fff!important}.ch32head{display:flex!important;justify-content:space-between!important;align-items:flex-start!important;gap:8px!important;margin-bottom:10px!important}.ch32head b{font-size:15px!important}.ch32sub{color:#64748b!important;font-size:11px!important}.ch32hint{font-size:10px!important;color:#64748b!important}
.ch32item{margin-bottom:9px!important;padding:10px!important;border:1px solid #e2e8f0!important;border-radius:10px!important;background:#fff!important}.ch32item.long{background:#fbfdff!important}.ch32item.note{background:#fff9eb!important;border-color:#f0d59b!important}.ch32item.dragging{opacity:.45!important}.ch32item[draggable="true"]{cursor:grab!important}.ch32item-top{display:flex!important;justify-content:space-between!important;gap:8px!important;align-items:center!important}.ch32label{margin-bottom:5px!important;color:#334155!important;font-size:12px!important;font-weight:700!important}.ch32drag-handle{color:#94a3b8!important;font-size:16px!important;cursor:grab!important}.ch32text{white-space:pre-wrap!important;overflow-wrap:anywhere!important;color:#475569!important;font-size:12px!important;line-height:1.65!important}.ch32text.cut{max-height:112px!important;overflow:hidden!important}.ch32field{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important}.ch32value{min-width:0!important;overflow-wrap:anywhere!important;color:#17243b!important;font-size:13px!important;user-select:text!important}.ch32actions{display:flex!important;flex-wrap:wrap!important;gap:5px!important;margin-top:8px!important}.ch32warn{margin-top:6px!important;color:#9a6700!important;font-size:11px!important}.ch32period{color:#17243b!important;font-size:13px!important;font-weight:700!important}.ch32empty{padding:30px 10px!important;text-align:center!important;color:#64748b!important;font-size:12px!important}
#ch32panel footer{padding:7px 11px!important;border-top:1px solid #e5eaf1!important;background:#fbfdff!important;color:#64748b!important;font-size:10px!important}#ch32toast{position:absolute!important;right:12px!important;bottom:38px!important;max-width:320px!important;padding:8px 10px!important;border-radius:9px!important;background:#17243b!important;color:#fff!important;font-size:12px!important;opacity:0!important;transform:translateY(5px)!important;transition:.15s!important;pointer-events:none!important}#ch32toast.show{opacity:1!important;transform:translateY(0)!important}
#ch32modal{position:fixed!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;background:#0f172a55!important;z-index:2147483647!important}.ch32modal-card{width:min(520px,92vw)!important;max-height:88vh!important;overflow:auto!important;background:#fff!important;border-radius:14px!important;box-shadow:0 20px 60px #0005!important;padding:14px!important;color:#17243b!important}.ch32modal-title{font-size:16px!important;font-weight:800!important;margin-bottom:10px!important}.ch32modal-card label{display:block!important;margin:9px 0 4px!important;font-size:12px!important;font-weight:700!important}.ch32modal-card input,.ch32modal-card textarea,.ch32modal-card select{width:100%!important;border:1px solid #cbd5e1!important;border-radius:8px!important;padding:7px 8px!important;background:#fff!important;color:#17243b!important;font-size:12px!important}.ch32modal-card textarea{min-height:130px!important;resize:vertical!important}.ch32modal-actions{display:flex!important;justify-content:flex-end!important;gap:7px!important;margin-top:12px!important}.ch32danger{color:#b42318!important}
@media(max-width:640px){#ch32shell{right:62px!important}#ch32panel{width:calc(100vw - 80px)!important}#ch32rail{left:calc(100vw - 70px)!important}}
`;

function mount(){const p=document.body||document.documentElement;if(!document.getElementById(STYLE))(document.head||document.documentElement).appendChild(css);if(!document.getElementById(ROOT))p.appendChild(root);}
mount();

const q=s=>root.querySelector(s);const shell=q('#ch32shell'),rail=q('#ch32rail'),panel=q('#ch32panel'),title=q('#ch32title'),search=q('#ch32search'),tabs=q('#ch32tabs'),content=q('#ch32content'),toast=q('#ch32toast'),managebar=q('#ch32managebar');
const modal=q('#ch32modal'),modalTitle=q('#ch32modal-title'),modalBody=q('#ch32modal-body'),modalSave=q('#ch32modal-save');

function applyPos(){shell.style.setProperty('right',state.pos.right+'px','important');shell.style.setProperty('top',state.pos.top+'px','important');}
applyPos();

function notify(t){toast.textContent=t;toast.classList.add('show');clearTimeout(notify.t);notify.t=setTimeout(()=>toast.classList.remove('show'),1600);}
async function copy(v,l){try{if(typeof GM_setClipboard==='function')GM_setClipboard(safeText(v),'text');else await navigator.clipboard.writeText(safeText(v));notify('已复制：'+l);}catch(e){console.error(e);notify('复制失败');}}
function btn(t,f,p=false){const b=document.createElement('button');b.type='button';b.textContent=t;if(p)b.classList.add('primary');b.onclick=f;return b;}
function warning(box,w){if(!w)return;const d=document.createElement('div');d.className='ch32warn';d.textContent='⚠ '+w;box.appendChild(d);}
function period(a,b,sep=' — '){return safeText(a)+sep+safeText(b);}

function openModal({title:ttl,body,onSave}){modalTitle.textContent=ttl;modalBody.replaceChildren();modalBody.appendChild(body);modal.hidden=false;modalSave.onclick=()=>{const ok=onSave();if(ok!==false)closeModal();};}
function closeModal(){modal.hidden=true;modalSave.onclick=null;}
q('#ch32modal-cancel').onclick=closeModal;
modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});

function input(label,value=''){const wrap=document.createElement('div'),l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.value=value;wrap.append(l,i);return {wrap,input:i};}
function textarea(label,value=''){const wrap=document.createElement('div'),l=document.createElement('label'),i=document.createElement('textarea');l.textContent=label;i.value=value;wrap.append(l,i);return {wrap,input:i};}
function select(label,value,options){const wrap=document.createElement('div'),l=document.createElement('label'),s=document.createElement('select');l.textContent=label;for(const [v,t] of options){const o=document.createElement('option');o.value=v;o.textContent=t;s.appendChild(o);}s.value=value;wrap.append(l,s);return {wrap,input:s};}

function editCard(card=null){const box=document.createElement('div');const a=input('卡片标题',card?.title||'');const b=input('副标题（可选）',card?.subtitle||'');box.append(a.wrap,b.wrap);openModal({title:card?'编辑卡片':'新增卡片',body:box,onSave:()=>{const t=a.input.value.trim();if(!t){alert('卡片标题不能为空');return false;}if(card){card.title=t;card.subtitle=b.input.value.trim();}else{const c={id:uid('card'),title:t,subtitle:b.input.value.trim(),items:[]};cat().cards.push(c);state.card=c.id;}saveDB();saveUI();render();return true;}});}

function deleteCurrentCard(){const card=currentCard();if(!card)return;if(!confirm('确定删除卡片「'+card.title+'」吗？\n\n此操作会同时删除卡片内的所有字段。建议先导出 JSON 备份。'))return;cat().cards=cat().cards.filter(c=>c.id!==card.id);state.card=cat().cards[0]?.id||'';saveDB();saveUI();render();notify('卡片已删除');}

function editItem(item=null,index=-1){const card=currentCard();if(!card)return;const box=document.createElement('div');const type=select('类型',item?.kind||'field',[['field','短字段'],['text','长文本'],['period','时间区间'],['note','备注']]);const label=input('名称',item?.label||'');const value=textarea('内容',item?.value||'');const start=input('开始时间',item?.start||'');const end=input('结束时间',item?.end||'');const warn=input('提示 / 待核对说明（可选）',item?.warning||'');box.append(type.wrap,label.wrap,value.wrap,start.wrap,end.wrap,warn.wrap);
  function refresh(){const p=type.input.value==='period';value.wrap.style.display=p?'none':'';start.wrap.style.display=p?'':'none';end.wrap.style.display=p?'':'none';}
  type.input.onchange=refresh;refresh();
  openModal({title:item?'编辑字段':'新增字段',body:box,onSave:()=>{const l=label.input.value.trim();if(!l){alert('字段名称不能为空');return false;}const obj={label:l,kind:type.input.value};if(obj.kind==='period'){obj.start=start.input.value.trim();obj.end=end.input.value.trim();}else obj.value=value.input.value;const w=warn.input.value.trim();if(w)obj.warning=w;if(item)card.items[index]=obj;else card.items.push(obj);saveDB();render();return true;}});
}

function deleteItem(index){const card=currentCard(),item=card?.items[index];if(!item)return;if(!confirm('确定删除字段「'+item.label+'」吗？'))return;card.items.splice(index,1);saveDB();render();notify('字段已删除');}

function itemView(it,index){const box=document.createElement('section');box.className='ch32item '+(it.kind==='text'?'long ':it.kind==='note'?'note ':'');box.dataset.index=String(index);box.draggable=state.manage;
  const top=document.createElement('div');top.className='ch32item-top';const lab=document.createElement('div');lab.className='ch32label';lab.textContent=it.label;top.appendChild(lab);if(state.manage){const h=document.createElement('span');h.className='ch32drag-handle';h.textContent='≡';h.title='拖拽排序';top.appendChild(h);}box.appendChild(top);
  if(it.kind==='note'){const d=document.createElement('div');d.className='ch32text';d.textContent=safeText(it.value);box.appendChild(d);}else if(it.kind==='period'){const d=document.createElement('div');d.className='ch32period';d.textContent=period(it.start,it.end);box.appendChild(d);const a=document.createElement('div');a.className='ch32actions';a.append(btn('复制区间',()=>copy(period(it.start,it.end),it.label),true),btn('开始',()=>copy(it.start,it.label+' · 开始')),btn('结束',()=>copy(it.end,it.label+' · 结束')),btn('区间 .',()=>copy(period(safeText(it.start).replaceAll('-','.'),safeText(it.end).replaceAll('-','.')),it.label+' · 点格式')));box.appendChild(a);warning(box,it.warning);}else if(it.kind==='field'){const r=document.createElement('div'),d=document.createElement('div');r.className='ch32field';d.className='ch32value';d.textContent=safeText(it.value);r.append(d,btn('复制',()=>copy(it.value,it.label),true));box.appendChild(r);warning(box,it.warning);}else{const d=document.createElement('div');d.className='ch32text';d.textContent=safeText(it.value);const cut=safeText(it.value).length>180;if(cut)d.classList.add('cut');box.appendChild(d);const a=document.createElement('div');a.className='ch32actions';a.appendChild(btn('复制整段',()=>copy(it.value,it.label),true));if(cut){const b=btn('展开',()=>{const c=d.classList.toggle('cut');b.textContent=c?'展开':'收起';});a.appendChild(b);}box.appendChild(a);warning(box,it.warning);}
  if(state.manage){const a=document.createElement('div');a.className='ch32actions';a.append(btn('编辑',()=>editItem(it,index)),btn('删除',()=>deleteItem(index)));box.appendChild(a);}return box;
}

const short={self:'自我评价',advantage:'个人优势',career:'职业规划',skills:'技能',hobby:'兴趣特长',campus:'校园经历',awards:'奖项',prism:'PRISM',checklist:'CheckList',deepresearch:'DeepResearch',robot:'机械臂',uaes:'UAES',zhida:'挚达',master:'硕士',bachelor:'本科',highschool:'高中',basic:'基本信息',job:'求职意向'};
function cardHead(card){const h=document.createElement('div');h.className='ch32head';const left=document.createElement('div'),b=document.createElement('b');b.textContent=card.title;left.appendChild(b);if(card.subtitle){const s=document.createElement('div');s.className='ch32sub';s.textContent=card.subtitle;left.appendChild(s);}h.appendChild(left);if(state.manage){const hint=document.createElement('div');hint.className='ch32hint';hint.textContent='≡ 拖拽下方字段排序';h.appendChild(hint);}return h;}

function renderTabs(){tabs.style.display='flex';tabs.replaceChildren();cat().cards.forEach((card,i)=>{const b=document.createElement('button');b.type='button';b.className='ch32tab'+(card.id===state.card?' on':'');b.textContent=short[card.id]||card.title;b.dataset.index=String(i);b.draggable=state.manage;b.onclick=()=>{state.card=card.id;state.search='';search.value='';saveUI();render();};if(state.manage){b.addEventListener('dragstart',e=>{b.classList.add('dragging');e.dataTransfer.setData('text/ch32-card',String(i));});b.addEventListener('dragend',()=>b.classList.remove('dragging'));b.addEventListener('dragover',e=>e.preventDefault());b.addEventListener('drop',e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/ch32-card')),to=i;if(Number.isInteger(from)&&from!==to){const arr=cat().cards,[m]=arr.splice(from,1);arr.splice(to,0,m);saveDB();render();}});}tabs.appendChild(b);});}

function renderCard(){ensureCard();const card=currentCard();content.replaceChildren();if(!card){const e=document.createElement('div');e.className='ch32empty';e.textContent=state.manage?'当前分类没有卡片，点击“＋ 卡片”添加。':'当前分类暂无资料。';content.appendChild(e);return;}content.appendChild(cardHead(card));card.items.forEach((it,i)=>content.appendChild(itemView(it,i)));if(state.manage&&!card.items.length){const e=document.createElement('div');e.className='ch32empty';e.textContent='当前卡片还没有字段，点击上方“＋ 字段”添加。';content.appendChild(e);}
  if(state.manage){content.querySelectorAll('.ch32item').forEach(el=>{el.addEventListener('dragstart',e=>{el.classList.add('dragging');e.dataTransfer.setData('text/ch32-item',el.dataset.index);});el.addEventListener('dragend',()=>el.classList.remove('dragging'));el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/ch32-item')),to=Number(el.dataset.index);const card=currentCard();if(card&&Number.isInteger(from)&&Number.isInteger(to)&&from!==to){const [m]=card.items.splice(from,1);card.items.splice(to,0,m);saveDB();render();}});});}
}

function renderSearch(s){tabs.style.display='none';content.replaceChildren();let n=0;s=s.toLowerCase();cat().cards.forEach(card=>{const hits=card.items.map((it,i)=>({it,i})).filter(({it})=>[card.title,card.subtitle||'',it.label||'',it.value||'',it.start||'',it.end||''].join(' ').toLowerCase().includes(s));if(!hits.length)return;content.appendChild(cardHead(card));hits.forEach(({it})=>{const old=state.manage;state.manage=false;content.appendChild(itemView(it,-1));state.manage=old;n++;});});if(!n){const e=document.createElement('div');e.className='ch32empty';e.textContent='当前分类没有匹配内容。';content.appendChild(e);}}
function railState(){rail.querySelectorAll('[data-c]').forEach(b=>b.classList.toggle('on',state.open&&b.dataset.c===state.category));}
function render(){ensureCard();title.textContent=cat().label+(state.manage?' · 管理模式':'');panel.hidden=!state.open;managebar.hidden=!state.manage;railState();if(!state.open)return;renderTabs();state.search.trim()?renderSearch(state.search.trim()):renderCard();}
function openCat(c){if(!data()[c])return;if(state.open&&state.category===c){state.open=false;render();return;}state.category=c;state.card=data()[c].cards[0]?.id||'';state.search='';search.value='';state.open=true;saveUI();render();}

rail.onclick=e=>{const c=e.target.closest('[data-c]');if(c)return openCat(c.dataset.c);if(e.target.closest('[data-a="toggle"]')){state.open=!state.open;render();}};
q('#ch32close').onclick=()=>{state.open=false;render();};
q('#ch32manage').onclick=()=>{state.manage=!state.manage;q('#ch32manage').textContent=state.manage?'完成':'管理';render();};
search.oninput=e=>{state.search=e.target.value||'';state.search.trim()?renderSearch(state.search.trim()):(renderTabs(),renderCard());};
q('#ch32addcard').onclick=()=>editCard();q('#ch32editcard').onclick=()=>{const c=currentCard();if(c)editCard(c);};q('#ch32delcard').onclick=deleteCurrentCard;q('#ch32additem').onclick=()=>editItem();

q('#ch32export').onclick=()=>{const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='campus-helper-v32-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);notify('已导出 JSON');};
q('#ch32import').onclick=()=>q('#ch32file').click();
q('#ch32file').onchange=async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{const obj=JSON.parse(await f.text());if(!obj||obj.version!==1||!obj.data)throw Error('不是 v3.2 备份');if(!confirm('导入会覆盖当前本地资料库。\n\n建议先导出当前 JSON 备份。确定继续吗？'))return;db=obj;saveDB();state.category='writing';state.card=data().writing.cards[0]?.id||'';render();notify('导入完成');}catch(err){alert('导入失败：'+err.message);}};
q('#ch32resetpos').onclick=()=>{state.pos={right:72,top:48};applyPos();saveUI();notify('位置已重置');};

// 拖动整个界面
(function(){let dragging=false,sx=0,sy=0,startRight=0,startTop=0;const drag=q('#ch32drag');drag.addEventListener('pointerdown',e=>{if(e.target.closest('button,input'))return;dragging=true;sx=e.clientX;sy=e.clientY;startRight=state.pos.right;startTop=state.pos.top;drag.setPointerCapture?.(e.pointerId);e.preventDefault();});drag.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-sx,dy=e.clientY-sy;const maxRight=Math.max(0,window.innerWidth-520);const maxTop=Math.max(0,window.innerHeight-100);state.pos.right=Math.max(0,Math.min(maxRight,startRight-dx));state.pos.top=Math.max(0,Math.min(maxTop,startTop+dy));applyPos();});const stop=()=>{if(!dragging)return;dragging=false;saveUI();};drag.addEventListener('pointerup',stop);drag.addEventListener('pointercancel',stop);})();

document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!modal.hidden)return closeModal();if(state.open){state.open=false;render();}}},true);

// 若网页在脚本运行后改写 DOM，1 秒后确认入口仍在。
setTimeout(()=>{if(!document.getElementById(ROOT))mount();applyPos();},1000);
render();
console.log('[秋招网申资料库 v3.2] 已启动');
})();
