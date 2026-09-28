// ==UserScript==
// @name         秋招网申资料库 v3.4.6
// @namespace    campus-application-helper
// @version      3.4.6
// @description  分类/卡片/字段三级自定义；支持 Ctrl/Cmd+Z 撤回、记住上次卡片与滚动位置；可移动、缩放、拖拽排序、JSON 导入导出。
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

  const ROOT = 'campus-helper-v346';
  const DB_KEY = 'campus-helper-v32-db';
  const UI_KEY = 'campus-helper-v346-ui';
  const OLD_UI_KEYS = [
    'campus-helper-v345-ui',
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

  if (document.getElementById(ROOT)) return;

  const uid = p =>
    `${p}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

  const txt = v =>
    String(v ?? '');

  // =========================================================
  // 默认数据结构
  // =========================================================

  const defaultDB = () => ({
    version: 2,

    categories: [
      {
        id: 'basic',
        name: '基本信息与求职意向',
        shortName: '基本',
        cards: []
      },

      {
        id: 'education',
        name: '教育经历',
        shortName: '教育',
        cards: []
      },

      {
        id: 'intern',
        name: '实习经历',
        shortName: '实习',
        cards: []
      },

      {
        id: 'project',
        name: '项目经验',
        shortName: '项目',
        cards: []
      },

      {
        id: 'skills',
        name: '技能与语言',
        shortName: '技能',
        cards: []
      },

      {
        id: 'campus',
        name: '校园经历与奖项',
        shortName: '校园',
        cards: []
      },

      {
        id: 'writing',
        name: '常用文案',
        shortName: '文案',
        cards: []
      }
    ],

    updatedAt: Date.now()
  });

  // =========================================================
  // 数据清理
  // =========================================================

  function cleanItem(item) {
    if (
      !item ||
      typeof item !== 'object' ||
      item.kind === 'note'
    ) {
      return null;
    }

    const kind = [
      'field',
      'text',
      'period'
    ].includes(item.kind)
      ? item.kind
      : 'field';

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
      id:
        txt(card?.id) ||
        uid('card'),

      title:
        txt(card?.title) ||
        '未命名卡片',

      shortName:
        txt(
          card?.shortName ||
          card?.title
        ) ||
        '卡片',

      subtitle:
        txt(card?.subtitle),

      items:
        Array.isArray(card?.items)
          ? card.items
              .map(cleanItem)
              .filter(Boolean)
          : []
    };
  }

  // =========================================================
  // 标准化新数据库
  // =========================================================

  function normalize(raw) {
    if (
      !raw ||
      !Array.isArray(
        raw.categories
      ) ||
      !raw.categories.length
    ) {
      return null;
    }

    return {
      version: 2,

      categories:
        raw.categories.map(
          category => ({
            id:
              txt(category.id) ||
              uid('cat'),

            name:
              txt(category.name) ||
              '未命名分类',

            shortName:
              txt(
                category.shortName ||
                category.name
              ) ||
              '分类',

            cards:
              Array.isArray(
                category.cards
              )
                ? category.cards.map(
                    cleanCard
                  )
                : []
          })
        ),

      updatedAt:
        Date.now()
    };
  }

  // =========================================================
  // 兼容旧 v3.2 数据
  // =========================================================

  function migrate(raw) {
    if (!raw?.data) {
      return null;
    }

    const old =
      raw.data;

    const all =
      Object.values(old)
        .flatMap(
          group =>
            Array.isArray(
              group?.cards
            )
              ? group.cards
              : []
        );

    const byId =
      new Map(
        all.map(
          card => [
            card.id,
            card
          ]
        )
      );

    const used =
      new Set();

    const db =
      defaultDB();

    const map =
      Object.fromEntries(
        db.categories.map(
          category => [
            category.id,
            category
          ]
        )
      );

    const take =
      ids =>
        ids.flatMap(
          id => {
            const card =
              byId.get(id);

            if (!card) {
              return [];
            }

            used.add(card);

            return [
              cleanCard(card)
            ];
          }
        );

    map.basic.cards =
      take([
        'basic',
        'job'
      ]);

    map.education.cards =
      take([
        'master',
        'bachelor',
        'highschool'
      ]);

    map.intern.cards =
      take([
        'uaes',
        'zhida'
      ]);

    map.project.cards =
      take([
        'prism',
        'checklist',
        'deepresearch',
        'robot'
      ]);

    map.skills.cards =
      take([
        'skills'
      ]);

    map.campus.cards =
      take([
        'campus',
        'awards'
      ]);

    map.writing.cards =
      take([
        'self',
        'advantage',
        'career',
        'hobby'
      ]);

    const remap = {
      basic: 'basic',
      education: 'education',
      intern: 'intern',
      project: 'project',
      writing: 'writing'
    };

    Object.entries(
      remap
    ).forEach(
      ([
        oldKey,
        newKey
      ]) => {
        (
          old[
            oldKey
          ]?.cards ||
          []
        ).forEach(
          card => {
            if (
              !used.has(card)
            ) {
              map[
                newKey
              ].cards.push(
                cleanCard(card)
              );

              used.add(card);
            }
          }
        );
      }
    );

    const rest =
      all
        .filter(
          card =>
            !used.has(card)
        )
        .map(cleanCard);

    if (
      rest.length
    ) {
      db.categories.push({
        id:
          uid('cat'),

        name:
          '其他资料',

        shortName:
          '其他',

        cards:
          rest
      });
    }

    return db;
  }

  // =========================================================
  // 加载数据库
  // =========================================================

  function loadDB() {
    try {
      const raw =
        GM_getValue(
          DB_KEY,
          null
        );

      const out =
        normalize(raw) ||
        migrate(raw) ||
        defaultDB();

      GM_setValue(
        DB_KEY,
        out
      );

      return out;

    } catch (error) {
      console.error(
        '[秋招助手] 数据读取失败',
        error
      );

      return defaultDB();
    }
  }

  let db =
    loadDB();

  // =========================================================
  // UI 状态
  // =========================================================

  const state = {
    open: false,

    manage: false,

    categoryId:
      db.categories[0]
        ?.id ||
      '',

    cardId:
      db.categories[0]
        ?.cards[0]
        ?.id ||
      '',

    search: '',

    // 记住每个分类最后停留的卡片。
    lastCardByCategory: {},

    // 记住每张卡片的内容滚动位置。
    scrollPositions: {},

    left:
      Math.max(
        8,
        innerWidth -
          DEF.width -
          DEF.rail -
          DEF.gap -
          16
      ),

    top:
      DEF.top,

    width:
      DEF.width,

    height:
      DEF.height
  };

  // 读取之前版本保存的窗口位置和尺寸
  for (
    const key of [
      UI_KEY,
      ...OLD_UI_KEYS
    ]
  ) {
    try {
      const saved =
        GM_getValue(
          key,
          null
        );

      if (
        !saved ||
        typeof saved !==
          'object'
      ) {
        continue;
      }

      if (
        typeof saved.categoryId ===
        'string'
      ) {
        state.categoryId =
          saved.categoryId;
      }

      if (
        typeof saved.cardId ===
        'string'
      ) {
        state.cardId =
          saved.cardId;
      }

      if (
        saved.lastCardByCategory &&
        typeof saved.lastCardByCategory ===
          'object'
      ) {
        state.lastCardByCategory =
          { ...saved.lastCardByCategory };
      }

      if (
        saved.scrollPositions &&
        typeof saved.scrollPositions ===
          'object'
      ) {
        state.scrollPositions =
          { ...saved.scrollPositions };
      }

      [
        'left',
        'top',
        'width',
        'height'
      ].forEach(
        key => {
          if (
            Number.isFinite(
              saved[key]
            )
          ) {
            state[key] =
              saved[key];
          }
        }
      );

      break;

    } catch (_) {}
  }

  // =========================================================
  // DOM
  // =========================================================

  const root =
    document.createElement(
      'div'
    );

  root.id =
    ROOT;

  root.innerHTML = `
    <div id="ch344-shell">

      <aside id="ch344-rail"></aside>

      <section
        id="ch344-panel"
        hidden
      >

        <header id="ch344-drag">

          <div class="ch344-top">

            <div class="ch344-titlebox">

              <b id="ch344-title"></b>

              <small>
                拖标题栏移动 · 右下角调整大小 · 点击复制后手动粘贴
              </small>

            </div>

            <div class="ch344-topactions">

              <button
                id="ch344-manage"
                type="button"
              >
                管理
              </button>

              <button
                id="ch344-close"
                type="button"
              >
                ×
              </button>

            </div>

          </div>

          <input
            id="ch344-search"
            type="search"
            placeholder="搜索当前分类…"
            autocomplete="off"
          >

        </header>

        <div id="ch344-tabs"></div>

        <div
          id="ch344-toolbar"
          hidden
        >

          <button
            id="ch344-addcat"
            type="button"
          >
            ＋分类
          </button>

          <button
            id="ch344-editcat"
            type="button"
          >
            编辑分类
          </button>

          <button
            id="ch344-delcat"
            type="button"
          >
            删除分类
          </button>

          <span class="ch344-divider"></span>

          <button
            id="ch344-addcard"
            type="button"
          >
            ＋卡片
          </button>

          <button
            id="ch344-editcard"
            type="button"
          >
            编辑卡片
          </button>

          <button
            id="ch344-delcard"
            type="button"
          >
            删除卡片
          </button>

          <button
            id="ch344-additem"
            type="button"
          >
            ＋字段
          </button>

          <span class="ch344-divider"></span>

          <button
            id="ch344-export"
            type="button"
          >
            导出
          </button>

          <button
            id="ch344-import"
            type="button"
          >
            导入
          </button>

          <button
            id="ch344-reset"
            type="button"
          >
            重置布局
          </button>

          <input
            id="ch344-file"
            type="file"
            accept=".json,application/json"
            hidden
          >

        </div>

        <main id="ch344-content"></main>

        <footer id="ch344-footer">
          v3.4.6 · Ctrl+Z 撤回 · 记住浏览位置
        </footer>

        <div id="ch344-toast"></div>

        <div
          id="ch344-resize"
          title="拖动调整大小；双击恢复默认大小"
        >
          ↘
        </div>

      </section>

    </div>

    <div
      id="ch344-modal"
      hidden
    >

      <div class="ch344-modalbox">

        <b id="ch344-modal-title"></b>

        <div id="ch344-modal-body"></div>

        <div class="ch344-modal-actions">

          <button
            id="ch344-cancel"
            type="button"
          >
            取消
          </button>

          <button
            id="ch344-save"
            type="button"
            class="ch344-primary"
          >
            保存
          </button>

        </div>

      </div>

    </div>
  `;

  // =========================================================
  // CSS
  // =========================================================

  const style =
    document.createElement(
      'style'
    );

  style.textContent = `

#${ROOT}{
  all:initial!important;

  position:fixed!important;

  inset:0!important;

  width:0!important;

  height:0!important;

  z-index:
    2147483647!important;

  pointer-events:
    none!important;

  color-scheme:
    light!important;
}

#${ROOT},
#${ROOT} *{
  box-sizing:
    border-box!important;

  font-family:
    system-ui,
    -apple-system,
    "Segoe UI",
    "Microsoft YaHei",
    Arial,
    sans-serif!important;

  text-shadow:
    none!important;

  letter-spacing:
    normal!important;

  text-transform:
    none!important;
}

#${ROOT} #ch344-shell,
#${ROOT} #ch344-modal{
  pointer-events:
    auto!important;
}

#${ROOT} #ch344-shell{
  position:
    fixed!important;

  margin:
    0!important;

  padding:
    0!important;

  border:
    0!important;

  background:
    transparent!important;

  z-index:
    2147483647!important;
}

/* =========================================================
   通用按钮
   ========================================================= */

#${ROOT} button{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  font:
    500 12px/1.2
    system-ui,
    -apple-system,
    "Segoe UI",
    "Microsoft YaHei",
    Arial,
    sans-serif!important;

  appearance:
    none!important;

  -webkit-appearance:
    none!important;

  display:
    inline-flex!important;

  align-items:
    center!important;

  justify-content:
    center!important;

  width:
    auto!important;

  height:
    auto!important;

  min-width:
    0!important;

  min-height:
    0!important;

  margin:
    0!important;

  padding:
    5px 8px!important;

  border:
    1px solid
    #cbd5e1!important;

  border-radius:
    8px!important;

  background:
    #fff!important;

  color:
    #334155!important;

  box-shadow:
    none!important;

  cursor:
    pointer!important;

  white-space:
    nowrap!important;
}

#${ROOT} button.ch344-primary{
  background:
    #155eef!important;

  border-color:
    #155eef!important;

  color:
    #fff!important;
}

/* =========================================================
   输入框
   ========================================================= */

#${ROOT} input,
#${ROOT} textarea,
#${ROOT} select{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  font:
    400 12px/1.4
    system-ui,
    -apple-system,
    "Segoe UI",
    "Microsoft YaHei",
    Arial,
    sans-serif!important;

  appearance:
    none!important;

  -webkit-appearance:
    none!important;

  display:
    block!important;

  width:
    100%!important;

  height:
    auto!important;

  min-height:
    0!important;

  margin:
    0!important;

  padding:
    7px 9px!important;

  border:
    1px solid
    #cbd5e1!important;

  border-radius:
    8px!important;

  background:
    #fff!important;

  color:
    #17243b!important;

  box-shadow:
    none!important;

  outline:
    none!important;
}

#${ROOT} textarea{
  min-height:
    130px!important;

  resize:
    vertical!important;

  white-space:
    pre-wrap!important;
}

/* =========================================================
   右侧分类栏
   ========================================================= */

#${ROOT} #ch344-rail{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  position:
    absolute!important;

  top:
    0!important;

  width:
    ${DEF.rail}px!important;

  height:
    auto!important;

  padding:
    6px!important;

  display:
    flex!important;

  flex-direction:
    column!important;

  gap:
    5px!important;

  overflow-x:
    hidden!important;

  overflow-y:
    auto!important;

  background:
    #f8fbff!important;

  border:
    1px solid
    #d9e2ef!important;

  border-radius:
    14px!important;

  box-shadow:
    0 8px 28px
    #0f172a33!important;
}

#${ROOT} #ch344-rail button{
  width:
    42px!important;

  min-height:
    40px!important;

  padding:
    5px 2px!important;

  border:
    0!important;

  border-radius:
    9px!important;

  background:
    transparent!important;

  color:
    #475569!important;

  font-size:
    11px!important;

  font-weight:
    700!important;

  white-space:
    normal!important;

  overflow-wrap:
    anywhere!important;
}

#${ROOT} #ch344-rail button.ch344-toggle{
  font-size:
    20px!important;

  color:
    #155eef!important;
}

#${ROOT} #ch344-rail button.ch344-on{
  background:
    #155eef!important;

  color:
    #fff!important;
}

/* =========================================================
   主窗口
   ========================================================= */

#${ROOT} #ch344-panel{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  position:
    relative!important;

  display:
    flex!important;

  flex-direction:
    column!important;

  min-width:
    ${MIN_W}px!important;

  min-height:
    ${MIN_H}px!important;

  margin:
    0!important;

  padding:
    0!important;

  overflow:
    hidden!important;

  background:
    #fff!important;

  color:
    #17243b!important;

  border:
    1px solid
    #d9e2ef!important;

  border-radius:
    15px!important;

  box-shadow:
    0 16px 48px
    #0f172a42!important;

  font-size:
    13px!important;

  line-height:
    1.55!important;
}

/* =========================================================
   标题栏
   ========================================================= */

#${ROOT} #ch344-drag{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  display:
    block!important;

  flex:
    0 0 auto!important;

  width:
    100%!important;

  height:
    auto!important;

  padding:
    12px!important;

  border-bottom:
    1px solid
    #e5eaf1!important;

  background:
    #fff!important;

  cursor:
    move!important;

  user-select:
    none!important;
}

#${ROOT} .ch344-top{
  all:
    revert!important;

  display:
    flex!important;

  align-items:
    flex-start!important;

  justify-content:
    space-between!important;

  gap:
    10px!important;

  width:
    100%!important;
}

#${ROOT} .ch344-titlebox{
  all:
    revert!important;

  min-width:
    0!important;

  flex:
    1 1 auto!important;
}

#${ROOT} #ch344-title{
  all:
    revert!important;

  display:
    block!important;

  margin:
    0!important;

  color:
    #17243b!important;

  font-size:
    17px!important;

  font-weight:
    700!important;

  line-height:
    1.3!important;
}

#${ROOT} #ch344-drag small{
  all:
    revert!important;

  display:
    block!important;

  margin:
    2px 0 0!important;

  color:
    #64748b!important;

  font-size:
    11px!important;

  line-height:
    1.4!important;
}

#${ROOT} .ch344-topactions{
  all:
    revert!important;

  display:
    flex!important;

  gap:
    5px!important;

  flex:
    0 0 auto!important;
}

#${ROOT} #ch344-search{
  margin-top:
    10px!important;

  height:
    35px!important;
}

/* =========================================================
   顶部卡片区
   自动换行 + 不允许被 flex 压缩
   ========================================================= */

#${ROOT} #ch344-tabs{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  display:
    flex!important;

  flex:
    0 0 auto!important;

  flex-shrink:
    0!important;

  flex-wrap:
    wrap!important;

  align-content:
    flex-start!important;

  align-items:
    flex-start!important;

  justify-content:
    flex-start!important;

  gap:
    6px!important;

  width:
    100%!important;

  height:
    auto!important;

  min-height:
    48px!important;

  max-height:
    none!important;

  margin:
    0!important;

  padding:
    9px 10px!important;

  overflow:
    visible!important;

  border-bottom:
    1px solid
    #e5eaf1!important;

  background:
    #fbfdff!important;
}

#${ROOT} .ch344-tab{
  flex:
    0 0 auto!important;

  max-width:
    100%!important;

  min-height:
    0!important;

  height:
    auto!important;

  padding:
    6px 10px!important;

  border-radius:
    999px!important;

  font-size:
    11px!important;

  white-space:
    nowrap!important;
}

#${ROOT} .ch344-tab.ch344-on{
  background:
    #17243b!important;

  border-color:
    #17243b!important;

  color:
    #fff!important;
}

/* =========================================================
   管理栏
   ========================================================= */

#${ROOT} #ch344-toolbar{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  display:
    flex!important;

  flex:
    0 0 auto!important;

  flex-wrap:
    wrap!important;

  align-items:
    center!important;

  gap:
    5px!important;

  width:
    100%!important;

  height:
    auto!important;

  padding:
    8px 10px!important;

  border-bottom:
    1px solid
    #e5eaf1!important;

  background:
    #f8fafc!important;
}

#${ROOT} .ch344-divider{
  display:
    block!important;

  flex:
    0 0 1px!important;

  align-self:
    stretch!important;

  min-height:
    24px!important;

  margin:
    2px!important;

  background:
    #d8dee8!important;
}

/* =========================================================
   内容区
   ========================================================= */

#${ROOT} #ch344-content{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  display:
    block!important;

  flex:
    1 1 auto!important;

  width:
    100%!important;

  min-width:
    0!important;

  min-height:
    0!important;

  margin:
    0!important;

  padding:
    11px!important;

  overflow-x:
    hidden!important;

  overflow-y:
    auto!important;

  background:
    #fff!important;

  color:
    #17243b!important;
}

#${ROOT} .ch344-cardhead{
  all:
    revert!important;

  display:
    block!important;

  width:
    100%!important;

  height:
    auto!important;

  min-height:
    0!important;

  margin:
    0 0 10px!important;

  padding:
    0!important;
}

#${ROOT} .ch344-cardhead>b{
  all:
    revert!important;

  display:
    block!important;

  color:
    #17243b!important;

  font-size:
    15px!important;

  font-weight:
    700!important;

  line-height:
    1.35!important;
}

#${ROOT} .ch344-subtitle{
  all:
    revert!important;

  display:
    block!important;

  margin:
    2px 0 0!important;

  color:
    #64748b!important;

  font-size:
    11px!important;

  line-height:
    1.4!important;
}

/* =========================================================
   字段卡片
   ========================================================= */

#${ROOT} .ch344-item{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  position:
    static!important;

  float:
    none!important;

  display:
    block!important;

  width:
    100%!important;

  height:
    auto!important;

  min-width:
    0!important;

  min-height:
    0!important;

  max-width:
    none!important;

  max-height:
    none!important;

  margin:
    0 0 9px!important;

  padding:
    10px!important;

  overflow:
    visible!important;

  border:
    1px solid
    #e2e8f0!important;

  border-radius:
    10px!important;

  background:
    #fff!important;

  color:
    #17243b!important;

  box-shadow:
    none!important;

  transform:
    none!important;
}

#${ROOT} .ch344-item.ch344-textitem{
  background:
    #fbfdff!important;
}

#${ROOT} .ch344-dragging{
  opacity:
    .4!important;
}

#${ROOT} .ch344-labelrow{
  all:
    revert!important;

  display:
    flex!important;

  align-items:
    flex-start!important;

  justify-content:
    space-between!important;

  gap:
    8px!important;

  width:
    100%!important;

  height:
    auto!important;

  min-height:
    0!important;

  margin:
    0 0 5px!important;
}

#${ROOT} .ch344-label{
  all:
    revert!important;

  display:
    block!important;

  flex:
    1 1 auto!important;

  min-width:
    0!important;

  height:
    auto!important;

  min-height:
    0!important;

  color:
    #334155!important;

  font-size:
    12px!important;

  font-weight:
    700!important;

  line-height:
    1.4!important;
}

#${ROOT} .ch344-handle{
  all:
    revert!important;

  display:
    block!important;

  flex:
    0 0 auto!important;

  color:
    #94a3b8!important;

  font-size:
    16px!important;

  line-height:
    1!important;

  cursor:
    grab!important;
}

#${ROOT} .ch344-value{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  display:
    block!important;

  width:
    auto!important;

  height:
    auto!important;

  min-width:
    0!important;

  min-height:
    0!important;

  max-width:
    none!important;

  max-height:
    none!important;

  margin:
    0!important;

  padding:
    0!important;

  overflow-wrap:
    anywhere!important;

  white-space:
    pre-wrap!important;

  color:
    #475569!important;

  font-size:
    12px!important;

  line-height:
    1.65!important;

  user-select:
    text!important;
}

#${ROOT} .ch344-value.ch344-cut{
  max-height:
    112px!important;

  overflow:
    hidden!important;
}

#${ROOT} .ch344-fieldrow{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  display:
    grid!important;

  grid-template-columns:
    minmax(0,1fr)
    auto!important;

  align-items:
    center!important;

  gap:
    8px!important;

  width:
    100%!important;

  height:
    auto!important;

  min-height:
    0!important;
}

#${ROOT} .ch344-fieldrow .ch344-value{
  color:
    #17243b!important;

  font-size:
    13px!important;
}

#${ROOT} .ch344-period{
  all:
    revert!important;

  display:
    block!important;

  height:
    auto!important;

  min-height:
    0!important;

  color:
    #17243b!important;

  font-size:
    13px!important;

  font-weight:
    700!important;

  line-height:
    1.45!important;
}

#${ROOT} .ch344-actions{
  all:
    revert!important;

  display:
    flex!important;

  flex-wrap:
    wrap!important;

  align-items:
    center!important;

  gap:
    5px!important;

  width:
    auto!important;

  height:
    auto!important;

  min-height:
    0!important;

  margin:
    8px 0 0!important;
}

#${ROOT} .ch344-empty{
  all:
    revert!important;

  display:
    block!important;

  width:
    100%!important;

  height:
    auto!important;

  min-height:
    0!important;

  padding:
    30px 10px!important;

  color:
    #64748b!important;

  font-size:
    12px!important;

  text-align:
    center!important;
}

/* =========================================================
   Footer / Toast / Resize
   ========================================================= */

#${ROOT} #ch344-footer{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  display:
    block!important;

  flex:
    0 0 auto!important;

  width:
    100%!important;

  height:
    auto!important;

  min-height:
    0!important;

  padding:
    7px 30px 7px 11px!important;

  border-top:
    1px solid
    #e5eaf1!important;

  background:
    #fbfdff!important;

  color:
    #64748b!important;

  font-size:
    10px!important;

  line-height:
    1.4!important;
}

#${ROOT} #ch344-toast{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  position:
    absolute!important;

  right:
    12px!important;

  bottom:
    38px!important;

  padding:
    8px 10px!important;

  border-radius:
    9px!important;

  background:
    #17243b!important;

  color:
    #fff!important;

  font-size:
    12px!important;

  opacity:
    0!important;

  transition:
    opacity .15s!important;

  pointer-events:
    none!important;

  z-index:
    4!important;
}

#${ROOT} #ch344-toast.ch344-show{
  opacity:
    1!important;
}

#${ROOT} #ch344-resize{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  position:
    absolute!important;

  right:
    2px!important;

  bottom:
    2px!important;

  display:
    flex!important;

  align-items:
    center!important;

  justify-content:
    center!important;

  width:
    22px!important;

  height:
    22px!important;

  border-radius:
    6px!important;

  background:
    transparent!important;

  color:
    #64748b!important;

  font-size:
    16px!important;

  cursor:
    nwse-resize!important;

  user-select:
    none!important;

  z-index:
    5!important;
}

#${ROOT} #ch344-resize:hover{
  background:
    #eef3f8!important;

  color:
    #155eef!important;
}

/* =========================================================
   编辑弹窗
   ========================================================= */

#${ROOT} #ch344-modal{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  position:
    fixed!important;

  inset:
    0!important;

  display:
    flex!important;

  align-items:
    center!important;

  justify-content:
    center!important;

  background:
    #0f172a55!important;

  z-index:
    2147483647!important;
}

#${ROOT} .ch344-modalbox{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  display:
    block!important;

  width:
    min(
      520px,
      92vw
    )!important;

  max-height:
    88vh!important;

  padding:
    14px!important;

  overflow-y:
    auto!important;

  background:
    #fff!important;

  color:
    #17243b!important;

  border-radius:
    14px!important;

  box-shadow:
    0 20px 60px
    #0005!important;
}

#${ROOT} #ch344-modal-title{
  all:
    revert!important;

  display:
    block!important;

  margin:
    0 0 10px!important;

  color:
    #17243b!important;

  font-size:
    16px!important;

  font-weight:
    700!important;
}

#${ROOT} #ch344-modal-body>div{
  all:
    revert!important;

  box-sizing:
    border-box!important;

  display:
    block!important;

  width:
    100%!important;

  height:
    auto!important;

  min-height:
    0!important;
}

#${ROOT} .ch344-modalbox label{
  all:
    revert!important;

  display:
    block!important;

  margin:
    9px 0 4px!important;

  color:
    #17243b!important;

  font-size:
    12px!important;

  font-weight:
    700!important;
}

#${ROOT} .ch344-modal-actions{
  all:
    revert!important;

  display:
    flex!important;

  justify-content:
    flex-end!important;

  gap:
    7px!important;

  width:
    100%!important;

  margin:
    12px 0 0!important;
}

/* =========================================================
   编辑弹窗交互兜底
   防止宿主招聘网站的样式/点击逻辑影响弹窗输入
   ========================================================= */

#${ROOT} #ch344-modal,
#${ROOT} .ch344-modalbox,
#${ROOT} .ch344-modalbox *{
  pointer-events:
    auto!important;
}

#${ROOT} .ch344-modalbox input,
#${ROOT} .ch344-modalbox textarea,
#${ROOT} .ch344-modalbox select{
  user-select:
    text!important;

  -webkit-user-select:
    text!important;

  cursor:
    text!important;

  touch-action:
    manipulation!important;
}

#${ROOT} .ch344-modalbox select{
  cursor:
    pointer!important;
}

#${ROOT} .ch344-modalbox input:focus,
#${ROOT} .ch344-modalbox textarea:focus,
#${ROOT} .ch344-modalbox select:focus{
  border-color:
    #155eef!important;

  box-shadow:
    0 0 0 3px #155eef22!important;

  outline:
    none!important;
}

/* =========================================================
   最终 hidden 兜底
   必须放在 CSS 最后一段
   防止 display:flex 把 hidden 覆盖
   ========================================================= */

#${ROOT} #ch344-panel[hidden],
#${ROOT} #ch344-toolbar[hidden],
#${ROOT} #ch344-modal[hidden],
#${ROOT} #ch344-file[hidden]{
  display:
    none!important;
}

`;

  // =========================================================
  // 挂载
  // =========================================================

  (
    document.head ||
    document.documentElement
  ).appendChild(
    style
  );

  (
    document.body ||
    document.documentElement
  ).appendChild(
    root
  );

  const $ =
    selector =>
      root.querySelector(
        selector
      );

  const shell =
    $('#ch344-shell');

  const rail =
    $('#ch344-rail');

  const panel =
    $('#ch344-panel');

  const title =
    $('#ch344-title');

  const tabs =
    $('#ch344-tabs');

  const toolbar =
    $('#ch344-toolbar');

  const content =
    $('#ch344-content');

  const search =
    $('#ch344-search');

  const toast =
    $('#ch344-toast');

  const modal =
    $('#ch344-modal');

  const modalTitle =
    $('#ch344-modal-title');

  const modalBody =
    $('#ch344-modal-body');

  const modalBox =
    root.querySelector(
      '.ch344-modalbox'
    );

  const resizeHandle =
    $('#ch344-resize');

  // =========================================================
  // 保存
  // =========================================================

  function saveDB() {
    db.updatedAt =
      Date.now();

    GM_setValue(
      DB_KEY,
      db
    );
  }

  function saveUI() {
    GM_setValue(
      UI_KEY,
      {
        categoryId:
          state.categoryId,

        cardId:
          state.cardId,

        lastCardByCategory:
          state.lastCardByCategory,

        scrollPositions:
          state.scrollPositions,

        left:
          state.left,

        top:
          state.top,

        width:
          state.width,

        height:
          state.height
      }
    );
  }

  // =========================================================
  // 撤回历史 + 浏览位置
  // =========================================================

  const UNDO_LIMIT = 40;
  const undoStack = [];
  let restoringScroll = false;
  let scrollSaveTimer = null;

  function clonePlain(value) {
    try {
      return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
    } catch (_) {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function viewKey(
    categoryId = state.categoryId,
    cardId = state.cardId
  ) {
    return `${categoryId || ''}::${cardId || ''}`;
  }

  function rememberScroll(
    persist = false
  ) {
    if (
      restoringScroll ||
      !state.categoryId ||
      !state.cardId ||
      state.search.trim()
    ) {
      return;
    }

    state.scrollPositions[
      viewKey()
    ] =
      content.scrollTop || 0;

    if (persist) {
      saveUI();
    }
  }

  function restoreScroll() {
    if (
      !state.categoryId ||
      !state.cardId ||
      state.search.trim()
    ) {
      return;
    }

    const y =
      Number(
        state.scrollPositions[
          viewKey()
        ]
      ) || 0;

    restoringScroll = true;

    requestAnimationFrame(
      () => {
        content.scrollTop = y;

        requestAnimationFrame(
          () => {
            restoringScroll = false;
          }
        );
      }
    );
  }

  function pushUndo(label) {
    rememberScroll(false);

    undoStack.push({
      label,
      db: clonePlain(db),
      categoryId: state.categoryId,
      cardId: state.cardId,
      lastCardByCategory:
        clonePlain(
          state.lastCardByCategory
        ),
      scrollPositions:
        clonePlain(
          state.scrollPositions
        )
    });

    if (
      undoStack.length >
      UNDO_LIMIT
    ) {
      undoStack.splice(
        0,
        undoStack.length -
          UNDO_LIMIT
      );
    }
  }

  function undoLast() {
    const snapshot =
      undoStack.pop();

    if (!snapshot) {
      notify('暂无可撤回操作');
      return;
    }

    db =
      clonePlain(
        snapshot.db
      );

    state.categoryId =
      snapshot.categoryId ||
      db.categories[0]?.id ||
      '';

    state.cardId =
      snapshot.cardId ||
      '';

    state.lastCardByCategory =
      clonePlain(
        snapshot.lastCardByCategory ||
          {}
      );

    state.scrollPositions =
      clonePlain(
        snapshot.scrollPositions ||
          {}
      );

    saveDB();
    saveUI();
    render();

    notify(
      `已撤回：${snapshot.label}`
    );
  }

  content.addEventListener(
    'scroll',
    () => {
      if (restoringScroll) {
        return;
      }

      rememberScroll(false);

      clearTimeout(
        scrollSaveTimer
      );

      scrollSaveTimer =
        setTimeout(
          saveUI,
          120
        );
    },
    { passive: true }
  );

  // =========================================================
  // 当前分类 / 卡片
  // =========================================================

  function currentCategory() {
    let category =
      db.categories.find(
        category =>
          category.id ===
          state.categoryId
      );

    if (!category) {
      category =
        db.categories[0] ||
        null;

      state.categoryId =
        category?.id ||
        '';
    }

    return category;
  }

  function currentCard() {
    const category =
      currentCategory();

    if (!category) {
      return null;
    }

    let card =
      category.cards.find(
        card =>
          card.id ===
          state.cardId
      );

    if (!card) {
      const rememberedId =
        state.lastCardByCategory[
          category.id
        ];

      card =
        category.cards.find(
          item =>
            item.id ===
            rememberedId
        ) ||
        category.cards[0] ||
        null;

      state.cardId =
        card?.id ||
        '';
    }

    if (card) {
      state.lastCardByCategory[
        category.id
      ] =
        card.id;
    }

    return card;
  }

  // =========================================================
  // 布局
  // =========================================================

  function applyLayout() {
    const reserved =
      DEF.rail +
      DEF.gap +
      12;

    state.left =
      Math.max(
        0,
        Math.min(
          Math.max(
            0,
            innerWidth -
              MIN_W -
              reserved
          ),
          state.left
        )
      );

    state.top =
      Math.max(
        0,
        Math.min(
          Math.max(
            0,
            innerHeight -
              80
          ),
          state.top
        )
      );

    state.width =
      Math.max(
        MIN_W,
        Math.min(
          Math.max(
            MIN_W,
            innerWidth -
              state.left -
              reserved
          ),
          state.width
        )
      );

    state.height =
      Math.max(
        MIN_H,
        Math.min(
          Math.max(
            MIN_H,
            innerHeight -
              state.top -
              8
          ),
          state.height
        )
      );

    shell.style.setProperty(
      'left',
      `${state.left}px`,
      'important'
    );

    shell.style.setProperty(
      'top',
      `${state.top}px`,
      'important'
    );

    panel.style.setProperty(
      'width',
      `${state.width}px`,
      'important'
    );

    panel.style.setProperty(
      'height',
      `${state.height}px`,
      'important'
    );

    rail.style.setProperty(
      'left',
      `${
        state.width +
        DEF.gap
      }px`,
      'important'
    );

    rail.style.setProperty(
      'max-height',
      `${state.height}px`,
      'important'
    );
  }

  function resetLayout() {
    state.width =
      DEF.width;

    state.height =
      DEF.height;

    state.left =
      Math.max(
        8,
        innerWidth -
          state.width -
          DEF.rail -
          DEF.gap -
          16
      );

    state.top =
      DEF.top;

    applyLayout();

    saveUI();
  }

  // =========================================================
  // Toast
  // =========================================================

  function notify(message) {
    toast.textContent =
      message;

    toast.classList.add(
      'ch344-show'
    );

    clearTimeout(
      notify.timer
    );

    notify.timer =
      setTimeout(
        () =>
          toast.classList.remove(
            'ch344-show'
          ),
        1200
      );
  }

  // =========================================================
  // 复制
  // =========================================================

  async function copy(
    value,
    label
  ) {
    try {
      if (
        typeof GM_setClipboard ===
        'function'
      ) {
        GM_setClipboard(
          txt(value),
          'text'
        );
      } else {
        await navigator.clipboard
          .writeText(
            txt(value)
          );
      }

      notify(
        `已复制：${label}`
      );

    } catch (error) {
      console.error(
        error
      );

      notify(
        '复制失败'
      );
    }
  }

  // =========================================================
  // 通用按钮
  // =========================================================

  function button(
    label,
    fn,
    primary = false
  ) {
    const element =
      document.createElement(
        'button'
      );

    element.type =
      'button';

    element.textContent =
      label;

    if (primary) {
      element.classList.add(
        'ch344-primary'
      );
    }

    element.onclick =
      fn;

    return element;
  }

  // =========================================================
  // 表单控件
  // =========================================================

  function control(
    label,
    value = '',
    type = 'input'
  ) {
    const wrap =
      document.createElement(
        'div'
      );

    const labelElement =
      document.createElement(
        'label'
      );

    const element =
      document.createElement(
        type === 'textarea'
          ? 'textarea'
          : type === 'select'
            ? 'select'
            : 'input'
      );

    labelElement.textContent =
      label;

    if (
      type !== 'select'
    ) {
      element.value =
        value;
    }

    wrap.append(
      labelElement,
      element
    );

    return {
      wrap,
      element
    };
  }

  // =========================================================
  // Modal
  // =========================================================

  function focusFirstModalControl() {
    const first =
      modalBody.querySelector(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'
      );

    if (!first) {
      return;
    }

    requestAnimationFrame(
      () => {
        try {
          first.focus({
            preventScroll: true
          });

          if (
            first instanceof HTMLInputElement &&
            [
              'text',
              'search',
              'email',
              'tel',
              'url'
            ].includes(first.type)
          ) {
            const end =
              first.value.length;

            first.setSelectionRange?.(
              end,
              end
            );
          }
        } catch (_) {}
      }
    );
  }

  function openModal(
    name,
    body,
    onSave
  ) {
    modalTitle.textContent =
      name;

    modalBody.replaceChildren(
      body
    );

    modal.hidden =
      false;

    // 弹窗打开后主动聚焦第一个编辑控件。
    // 某些招聘网站会在点击后抢焦点，这里再补一次延迟聚焦。
    focusFirstModalControl();

    setTimeout(
      focusFirstModalControl,
      0
    );

    $('#ch344-save').onclick =
      event => {
        event.preventDefault();
        event.stopPropagation();

        if (
          onSave() !==
          false
        ) {
          closeModal();
        }
      };
  }

  function closeModal() {
    modal.hidden =
      true;

    $('#ch344-save').onclick =
      null;
  }

  $('#ch344-cancel').onclick =
    event => {
      event.preventDefault();
      event.stopPropagation();
      closeModal();
    };

  // 只允许点灰色遮罩关闭；点弹窗内部绝不误关。
  modal.onclick =
    event => {
      if (
        event.target ===
        modal
      ) {
        closeModal();
      }
    };

  // 把弹窗内部的交互和宿主网页隔开。
  // 这里使用冒泡阶段 stopPropagation，目标 input/textarea 仍然能正常获得点击与键盘输入。
  [
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'click',
    'dblclick',
    'touchstart',
    'touchend',
    'wheel',
    'keydown',
    'keyup',
    'keypress',
    'input',
    'change',
    'focusin',
    'focusout'
  ].forEach(
    type => {
      modalBox.addEventListener(
        type,
        event => {
          event.stopPropagation();
        },
        false
      );
    }
  );

  // =========================================================
  // 分类 CRUD
  // =========================================================

  function editCategory(
    target = null
  ) {
    const box =
      document.createElement(
        'div'
      );

    const name =
      control(
        '分类名称',
        target?.name ||
        ''
      );

    const shortName =
      control(
        '侧栏短名',
        target?.shortName ||
        ''
      );

    box.append(
      name.wrap,
      shortName.wrap
    );

    openModal(
      target
        ? '编辑分类'
        : '新增分类',

      box,

      () => {
        const fullName =
          name.element.value
            .trim();

        const short =
          shortName.element.value
            .trim();

        if (!fullName) {
          alert(
            '分类名称不能为空'
          );

          return false;
        }

        pushUndo(
          target
            ? '编辑分类'
            : '新增分类'
        );

        if (target) {
          target.name =
            fullName;

          target.shortName =
            short ||
            fullName.slice(
              0,
              4
            );

        } else {
          const category = {
            id:
              uid('cat'),

            name:
              fullName,

            shortName:
              short ||
              fullName.slice(
                0,
                4
              ),

            cards:
              []
          };

          db.categories.push(
            category
          );

          state.categoryId =
            category.id;

          state.cardId =
            '';
        }

        saveDB();
        saveUI();
        render();

        return true;
      }
    );
  }

  function deleteCategory() {
    const category =
      currentCategory();

    if (!category) {
      return;
    }

    if (
      db.categories.length <=
      1
    ) {
      alert(
        '至少保留一个分类。'
      );

      return;
    }

    if (
      !confirm(
        `确定删除分类「${category.name}」吗？\n其中 ${category.cards.length} 张卡片也会一并删除。`
      )
    ) {
      return;
    }

    pushUndo('删除分类');

    const index =
      db.categories.findIndex(
        item =>
          item.id ===
          category.id
      );

    db.categories.splice(
      index,
      1
    );

    const next =
      db.categories[
        Math.min(
          index,
          db.categories.length -
            1
        )
      ];

    state.categoryId =
      next.id;

    state.cardId =
      next.cards[0]?.id ||
      '';

    saveDB();

    saveUI();

    render();
  }

  // =========================================================
  // 卡片 CRUD
  // =========================================================

  function editCard(
    target = null
  ) {
    const category =
      currentCategory();

    if (!category) {
      return;
    }

    const box =
      document.createElement(
        'div'
      );

    const titleControl =
      control(
        '卡片标题',
        target?.title ||
        ''
      );

    const shortControl =
      control(
        '顶部按钮短名',
        target?.shortName ||
        ''
      );

    const subtitleControl =
      control(
        '副标题（可选）',
        target?.subtitle ||
        ''
      );

    box.append(
      titleControl.wrap,
      shortControl.wrap,
      subtitleControl.wrap
    );

    openModal(
      target
        ? '编辑卡片'
        : '新增卡片',

      box,

      () => {
        const cardTitle =
          titleControl.element.value
            .trim();

        if (!cardTitle) {
          alert(
            '卡片标题不能为空'
          );

          return false;
        }

        pushUndo(
          target
            ? '编辑卡片'
            : '新增卡片'
        );

        if (target) {
          target.title =
            cardTitle;

          target.shortName =
            shortControl.element.value
              .trim() ||
            cardTitle;

          target.subtitle =
            subtitleControl.element.value
              .trim();

        } else {
          const card = {
            id:
              uid('card'),

            title:
              cardTitle,

            shortName:
              shortControl.element.value
                .trim() ||
              cardTitle,

            subtitle:
              subtitleControl.element.value
                .trim(),

            items:
              []
          };

          category.cards.push(
            card
          );

          state.cardId =
            card.id;
        }

        saveDB();
        saveUI();
        render();

        return true;
      }
    );
  }

  function deleteCard() {
    const category =
      currentCategory();

    const card =
      currentCard();

    if (
      !category ||
      !card
    ) {
      return;
    }

    if (
      !confirm(
        `确定删除卡片「${card.title}」及其全部字段吗？`
      )
    ) {
      return;
    }

    pushUndo('删除卡片');

    const index =
      category.cards.findIndex(
        item =>
          item.id ===
          card.id
      );

    category.cards.splice(
      index,
      1
    );

    state.cardId =
      category.cards[
        Math.min(
          index,
          category.cards.length -
            1
        )
      ]?.id ||
      '';

    saveDB();

    saveUI();

    render();
  }

  // =========================================================
  // 字段 CRUD
  // =========================================================

  function editItem(
    target = null,
    index = -1
  ) {
    const card =
      currentCard();

    if (!card) {
      notify(
        '请先添加卡片'
      );

      return;
    }

    const box =
      document.createElement(
        'div'
      );

    const kind =
      control(
        '类型',
        '',
        'select'
      );

    [
      [
        'field',
        '短字段'
      ],
      [
        'text',
        '长文本'
      ],
      [
        'period',
        '时间区间'
      ]
    ].forEach(
      ([
        value,
        label
      ]) => {
        const option =
          document.createElement(
            'option'
          );

        option.value =
          value;

        option.textContent =
          label;

        kind.element
          .appendChild(
            option
          );
      }
    );

    kind.element.value =
      target?.kind ||
      'field';

    const labelControl =
      control(
        '字段名称',
        target?.label ||
        ''
      );

    const valueControl =
      control(
        '内容',
        target?.value ||
        '',
        'textarea'
      );

    const startControl =
      control(
        '开始时间',
        target?.start ||
        ''
      );

    const endControl =
      control(
        '结束时间',
        target?.end ||
        ''
      );

    box.append(
      kind.wrap,
      labelControl.wrap,
      valueControl.wrap,
      startControl.wrap,
      endControl.wrap
    );

    function sync() {
      const isPeriod =
        kind.element.value ===
        'period';

      valueControl.wrap
        .style.display =
          isPeriod
            ? 'none'
            : '';

      startControl.wrap
        .style.display =
          isPeriod
            ? ''
            : 'none';

      endControl.wrap
        .style.display =
          isPeriod
            ? ''
            : 'none';
    }

    kind.element.onchange =
      sync;

    sync();

    openModal(
      target
        ? '编辑字段'
        : '新增字段',

      box,

      () => {
        const label =
          labelControl.element.value
            .trim();

        if (!label) {
          alert(
            '字段名称不能为空'
          );

          return false;
        }

        const item = {
          label,
          kind:
            kind.element.value
        };

        if (
          item.kind ===
          'period'
        ) {
          item.start =
            startControl.element.value
              .trim();

          item.end =
            endControl.element.value
              .trim();

        } else {
          item.value =
            valueControl.element.value;
        }

        pushUndo(
          target
            ? '编辑字段'
            : '新增字段'
        );

        if (target) {
          card.items[
            index
          ] =
            item;

        } else {
          card.items.push(
            item
          );
        }

        saveDB();

        render();

        return true;
      }
    );
  }

  function deleteItem(
    index
  ) {
    const card =
      currentCard();

    const item =
      card?.items[
        index
      ];

    if (!item) {
      return;
    }

    if (
      !confirm(
        `确定删除「${item.label}」吗？`
      )
    ) {
      return;
    }

    pushUndo('删除字段');

    card.items.splice(
      index,
      1
    );

    saveDB();

    render();
  }

  // =========================================================
  // 字段显示
  // =========================================================

  function itemView(
    item,
    index,
    allowManage = true
  ) {
    const box =
      document.createElement(
        'section'
      );

    box.className =
      `ch344-item${
        item.kind ===
        'text'
          ? ' ch344-textitem'
          : ''
      }`;

    box.dataset.index =
      String(index);

    box.draggable =
      Boolean(
        state.manage &&
        allowManage
      );

    const labelRow =
      document.createElement(
        'div'
      );

    labelRow.className =
      'ch344-labelrow';

    const label =
      document.createElement(
        'div'
      );

    label.className =
      'ch344-label';

    label.textContent =
      item.label;

    labelRow.appendChild(
      label
    );

    if (
      state.manage &&
      allowManage
    ) {
      const handle =
        document.createElement(
          'span'
        );

      handle.className =
        'ch344-handle';

      handle.textContent =
        '≡';

      labelRow.appendChild(
        handle
      );
    }

    box.appendChild(
      labelRow
    );

    // 时间区间
    if (
      item.kind ===
      'period'
    ) {
      const value =
        document.createElement(
          'div'
        );

      value.className =
        'ch344-period';

      value.textContent =
        `${txt(item.start)} — ${txt(item.end)}`;

      box.appendChild(
        value
      );

      const actions =
        document.createElement(
          'div'
        );

      actions.className =
        'ch344-actions';

      actions.append(
        button(
          '复制区间',
          () =>
            copy(
              `${txt(item.start)} — ${txt(item.end)}`,
              item.label
            ),
          true
        ),

        button(
          '开始',
          () =>
            copy(
              item.start,
              `${item.label} · 开始`
            )
        ),

        button(
          '结束',
          () =>
            copy(
              item.end,
              `${item.label} · 结束`
            )
        )
      );

      box.appendChild(
        actions
      );

    // 短字段
    } else if (
      item.kind ===
      'field'
    ) {
      const row =
        document.createElement(
          'div'
        );

      row.className =
        'ch344-fieldrow';

      const value =
        document.createElement(
          'div'
        );

      value.className =
        'ch344-value';

      value.textContent =
        txt(item.value);

      row.append(
        value,

        button(
          '复制',
          () =>
            copy(
              item.value,
              item.label
            ),
          true
        )
      );

      box.appendChild(
        row
      );

    // 长文本
    } else {
      const value =
        document.createElement(
          'div'
        );

      value.className =
        'ch344-value';

      value.textContent =
        txt(item.value);

      const needCut =
        txt(
          item.value
        ).length >
        180;

      if (needCut) {
        value.classList.add(
          'ch344-cut'
        );
      }

      box.appendChild(
        value
      );

      const actions =
        document.createElement(
          'div'
        );

      actions.className =
        'ch344-actions';

      actions.appendChild(
        button(
          '复制整段',
          () =>
            copy(
              item.value,
              item.label
            ),
          true
        )
      );

      if (needCut) {
        const expand =
          button(
            '展开',
            () => {
              const collapsed =
                value.classList
                  .toggle(
                    'ch344-cut'
                  );

              expand.textContent =
                collapsed
                  ? '展开'
                  : '收起';
            }
          );

        actions.appendChild(
          expand
        );
      }

      box.appendChild(
        actions
      );
    }

    // 管理模式
    if (
      state.manage &&
      allowManage
    ) {
      const actions =
        document.createElement(
          'div'
        );

      actions.className =
        'ch344-actions';

      actions.append(
        button(
          '编辑',
          () =>
            editItem(
              item,
              index
            )
        ),

        button(
          '删除',
          () =>
            deleteItem(
              index
            )
        )
      );

      box.appendChild(
        actions
      );
    }

    return box;
  }

  // =========================================================
  // 分类栏
  // =========================================================

  function renderRail() {
    rail.replaceChildren();

    const toggle =
      button(
        '☷',
        () => {
          rememberScroll(false);

          state.open =
            !state.open;

          saveUI();
          render();
        }
      );

    toggle.className =
      'ch344-toggle';

    toggle.title =
      '展开 / 收起';

    rail.appendChild(
      toggle
    );

    db.categories.forEach(
      (
        category,
        index
      ) => {
        const element =
          button(
            category.shortName ||
            category.name,

            () => {
              rememberScroll(false);

              if (
                state.open &&
                state.categoryId ===
                  category.id
              ) {
                state.open =
                  false;

              } else {
                state.categoryId =
                  category.id;

                const rememberedId =
                  state.lastCardByCategory[
                    category.id
                  ];

                state.cardId =
                  category.cards.some(
                    card =>
                      card.id ===
                      rememberedId
                  )
                    ? rememberedId
                    : category.cards[0]
                        ?.id ||
                      '';

                if (state.cardId) {
                  state.lastCardByCategory[
                    category.id
                  ] =
                    state.cardId;
                }

                state.search =
                  '';

                search.value =
                  '';

                state.open =
                  true;
              }

              saveUI();
              render();
            }
          );

        element.title =
          category.name;

        element.classList.toggle(
          'ch344-on',

          state.open &&
          state.categoryId ===
            category.id
        );

        element.draggable =
          state.manage;

        if (
          state.manage
        ) {
          element.ondragstart =
            event => {
              element.classList.add(
                'ch344-dragging'
              );

              event.dataTransfer
                .setData(
                  'text/category',
                  String(index)
                );
            };

          element.ondragend =
            () =>
              element.classList.remove(
                'ch344-dragging'
              );

          element.ondragover =
            event =>
              event.preventDefault();

          element.ondrop =
            event => {
              event.preventDefault();

              const from =
                Number(
                  event.dataTransfer
                    .getData(
                      'text/category'
                    )
                );

              if (
                Number.isInteger(
                  from
                ) &&
                from !==
                  index
              ) {
                pushUndo('调整分类顺序');

                const [moved] =
                  db.categories.splice(
                    from,
                    1
                  );

                db.categories.splice(
                  index,
                  0,
                  moved
                );

                saveDB();

                render();
              }
            };
        }

        rail.appendChild(
          element
        );
      }
    );
  }

  // =========================================================
  // 顶部卡片按钮
  // =========================================================

  function renderTabs() {
    tabs.replaceChildren();

    const category =
      currentCategory();

    if (!category) {
      return;
    }

    category.cards.forEach(
      (
        card,
        index
      ) => {
        const element =
          button(
            card.shortName ||
            card.title,

            () => {
              rememberScroll(false);

              state.cardId =
                card.id;

              state.lastCardByCategory[
                category.id
              ] =
                card.id;

              state.search =
                '';

              search.value =
                '';

              saveUI();

              render();
            }
          );

        element.className =
          `ch344-tab${
            card.id ===
            state.cardId
              ? ' ch344-on'
              : ''
          }`;

        element.title =
          card.title;

        element.draggable =
          state.manage;

        if (
          state.manage
        ) {
          element.ondragstart =
            event => {
              element.classList.add(
                'ch344-dragging'
              );

              event.dataTransfer
                .setData(
                  'text/card',
                  String(index)
                );
            };

          element.ondragend =
            () =>
              element.classList.remove(
                'ch344-dragging'
              );

          element.ondragover =
            event =>
              event.preventDefault();

          element.ondrop =
            event => {
              event.preventDefault();

              const from =
                Number(
                  event.dataTransfer
                    .getData(
                      'text/card'
                    )
                );

              if (
                Number.isInteger(
                  from
                ) &&
                from !==
                  index
              ) {
                pushUndo('调整卡片顺序');

                const [moved] =
                  category.cards.splice(
                    from,
                    1
                  );

                category.cards.splice(
                  index,
                  0,
                  moved
                );

                saveDB();

                render();
              }
            };
        }

        tabs.appendChild(
          element
        );
      }
    );
  }

  // =========================================================
  // 当前卡片
  // =========================================================

  function renderCard() {
    content.replaceChildren();

    const card =
      currentCard();

    if (!card) {
      const empty =
        document.createElement(
          'div'
        );

      empty.className =
        'ch344-empty';

      empty.textContent =
        state.manage
          ? '这个分类还没有卡片，点“＋卡片”添加。'
          : '这个分类暂无资料。';

      content.appendChild(
        empty
      );

      return;
    }

    const head =
      document.createElement(
        'div'
      );

    head.className =
      'ch344-cardhead';

    const cardTitle =
      document.createElement(
        'b'
      );

    cardTitle.textContent =
      card.title;

    head.appendChild(
      cardTitle
    );

    if (
      card.subtitle
    ) {
      const subtitle =
        document.createElement(
          'div'
        );

      subtitle.className =
        'ch344-subtitle';

      subtitle.textContent =
        card.subtitle;

      head.appendChild(
        subtitle
      );
    }

    content.appendChild(
      head
    );

    card.items.forEach(
      (
        item,
        index
      ) => {
        content.appendChild(
          itemView(
            item,
            index,
            true
          )
        );
      }
    );

    if (
      !card.items.length
    ) {
      const empty =
        document.createElement(
          'div'
        );

      empty.className =
        'ch344-empty';

      empty.textContent =
        state.manage
          ? '这个卡片还没有字段，点“＋字段”添加。'
          : '这个卡片暂无内容。';

      content.appendChild(
        empty
      );
    }

    // 字段拖拽排序
    if (
      state.manage
    ) {
      content
        .querySelectorAll(
          '.ch344-item'
        )
        .forEach(
          element => {
            element.ondragstart =
              event => {
                element.classList.add(
                  'ch344-dragging'
                );

                event.dataTransfer
                  .setData(
                    'text/item',
                    element.dataset
                      .index
                  );
              };

            element.ondragend =
              () =>
                element.classList.remove(
                  'ch344-dragging'
                );

            element.ondragover =
              event =>
                event.preventDefault();

            element.ondrop =
              event => {
                event.preventDefault();

                const from =
                  Number(
                    event.dataTransfer
                      .getData(
                        'text/item'
                      )
                  );

                const to =
                  Number(
                    element.dataset
                      .index
                  );

                if (
                  Number.isInteger(
                    from
                  ) &&
                  Number.isInteger(
                    to
                  ) &&
                  from !==
                    to
                ) {
                  pushUndo('调整字段顺序');

                  const [moved] =
                    card.items.splice(
                      from,
                      1
                    );

                  card.items.splice(
                    to,
                    0,
                    moved
                  );

                  saveDB();

                  render();
                }
              };
          }
        );
    }
  }

  // =========================================================
  // 搜索
  // =========================================================

  function renderSearch(
    query
  ) {
    content.replaceChildren();

    const category =
      currentCategory();

    if (!category) {
      return;
    }

    const needle =
      query.toLowerCase();

    let count =
      0;

    category.cards.forEach(
      card => {
        const hits =
          card.items.filter(
            item =>
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
                .includes(
                  needle
                )
          );

        if (
          !hits.length
        ) {
          return;
        }

        const head =
          document.createElement(
            'div'
          );

        head.className =
          'ch344-cardhead';

        const titleElement =
          document.createElement(
            'b'
          );

        titleElement.textContent =
          card.title;

        head.appendChild(
          titleElement
        );

        content.appendChild(
          head
        );

        hits.forEach(
          item => {
            content.appendChild(
              itemView(
                item,
                -1,
                false
              )
            );

            count++;
          }
        );
      }
    );

    if (!count) {
      const empty =
        document.createElement(
          'div'
        );

      empty.className =
        'ch344-empty';

      empty.textContent =
        '当前分类没有匹配内容。';

      content.appendChild(
        empty
      );
    }
  }

  // =========================================================
  // 总渲染
  // =========================================================

  function render() {
    const category =
      currentCategory();

    currentCard();

    renderRail();

    title.textContent =
      `${
        category?.name ||
        '资料库'
      }${
        state.manage
          ? ' · 管理模式'
          : ''
      }`;

    panel.hidden =
      !state.open;

    toolbar.hidden =
      !state.manage;

    $('#ch344-manage')
      .textContent =
        state.manage
          ? '完成'
          : '管理';

    applyLayout();

    if (
      !state.open
    ) {
      return;
    }

    renderTabs();

    state.search.trim()
      ? renderSearch(
          state.search.trim()
        )
      : renderCard();

    restoreScroll();
  }

  // =========================================================
  // 主交互
  // =========================================================

  $('#ch344-close').onclick =
    () => {
      rememberScroll(false);

      state.open =
        false;

      saveUI();
      render();
    };

  $('#ch344-manage').onclick =
    () => {
      state.manage =
        !state.manage;

      render();
    };

  search.oninput =
    event => {
      if (!state.search.trim()) {
        rememberScroll(false);
      }

      state.search =
        event.target.value ||
        '';

      render();
    };

  // =========================================================
  // 分类操作
  // =========================================================

  $('#ch344-addcat').onclick =
    () =>
      editCategory();

  $('#ch344-editcat').onclick =
    () => {
      const category =
        currentCategory();

      if (category) {
        editCategory(
          category
        );
      }
    };

  $('#ch344-delcat').onclick =
    deleteCategory;

  // =========================================================
  // 卡片操作
  // =========================================================

  $('#ch344-addcard').onclick =
    () =>
      editCard();

  $('#ch344-editcard').onclick =
    () => {
      const card =
        currentCard();

      if (card) {
        editCard(
          card
        );
      }
    };

  $('#ch344-delcard').onclick =
    deleteCard;

  // =========================================================
  // 字段操作
  // =========================================================

  $('#ch344-additem').onclick =
    () =>
      editItem();

  // =========================================================
  // 重置布局
  // =========================================================

  $('#ch344-reset').onclick =
    () => {
      resetLayout();

      notify(
        '布局已重置'
      );
    };

  // =========================================================
  // 导出
  // =========================================================

  $('#ch344-export').onclick =
    () => {
      const blob =
        new Blob(
          [
            JSON.stringify(
              db,
              null,
              2
            )
          ],
          {
            type:
              'application/json;charset=utf-8'
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          'a'
        );

      anchor.href =
        url;

      anchor.download =
        `campus-helper-v346-${new Date()
          .toISOString()
          .slice(
            0,
            10
          )}.json`;

      document.body
        .appendChild(
          anchor
        );

      anchor.click();

      anchor.remove();

      setTimeout(
        () =>
          URL.revokeObjectURL(
            url
          ),
        20000
      );

      notify(
        '已导出'
      );
    };

  // =========================================================
  // 导入
  // =========================================================

  $('#ch344-import').onclick =
    () =>
      $('#ch344-file')
        .click();

  $('#ch344-file').onchange =
    async event => {
      const file =
        event.target
          .files?.[0];

      event.target.value =
        '';

      if (!file) {
        return;
      }

      try {
        const raw =
          JSON.parse(
            await file.text()
          );

        const next =
          normalize(raw) ||
          migrate(raw);

        if (!next) {
          throw new Error(
            '不支持的资料库格式'
          );
        }

        if (
          !confirm(
            '导入会覆盖当前资料库。确定继续吗？'
          )
        ) {
          return;
        }

        pushUndo('导入资料库');

        db =
          next;

        state.categoryId =
          db.categories[0]
            ?.id ||
          '';

        state.cardId =
          db.categories[0]
            ?.cards[0]
            ?.id ||
          '';

        state.lastCardByCategory =
          state.categoryId &&
          state.cardId
            ? {
                [state.categoryId]:
                  state.cardId
              }
            : {};

        state.scrollPositions =
          {};

        saveDB();

        saveUI();

        render();

        notify(
          '导入完成'
        );

      } catch (error) {
        alert(
          `导入失败：${error.message}`
        );
      }
    };

  // =========================================================
  // 拖动整个窗口
  // =========================================================

  (() => {
    const drag =
      $('#ch344-drag');

    let active =
      false;

    let startX =
      0;

    let startY =
      0;

    let startLeft =
      0;

    let startTop =
      0;

    drag.onpointerdown =
      event => {
        if (
          event.target.closest(
            'button,input'
          )
        ) {
          return;
        }

        active =
          true;

        startX =
          event.clientX;

        startY =
          event.clientY;

        startLeft =
          state.left;

        startTop =
          state.top;

        drag.setPointerCapture?.(
          event.pointerId
        );

        event.preventDefault();
      };

    drag.onpointermove =
      event => {
        if (!active) {
          return;
        }

        state.left =
          startLeft +
          event.clientX -
          startX;

        state.top =
          startTop +
          event.clientY -
          startY;

        applyLayout();
      };

    const stop =
      () => {
        if (!active) {
          return;
        }

        active =
          false;

        saveUI();
      };

    drag.onpointerup =
      stop;

    drag.onpointercancel =
      stop;
  })();

  // =========================================================
  // 调整窗口大小
  // =========================================================

  (() => {
    let active =
      false;

    let startX =
      0;

    let startY =
      0;

    let startW =
      0;

    let startH =
      0;

    resizeHandle.onpointerdown =
      event => {
        active =
          true;

        startX =
          event.clientX;

        startY =
          event.clientY;

        startW =
          state.width;

        startH =
          state.height;

        resizeHandle
          .setPointerCapture?.(
            event.pointerId
          );

        event.preventDefault();

        event.stopPropagation();
      };

    resizeHandle.onpointermove =
      event => {
        if (!active) {
          return;
        }

        const maxW =
          Math.max(
            MIN_W,
            innerWidth -
              state.left -
              DEF.rail -
              DEF.gap -
              12
          );

        const maxH =
          Math.max(
            MIN_H,
            innerHeight -
              state.top -
              8
          );

        state.width =
          Math.max(
            MIN_W,
            Math.min(
              maxW,
              startW +
                event.clientX -
                startX
            )
          );

        state.height =
          Math.max(
            MIN_H,
            Math.min(
              maxH,
              startH +
                event.clientY -
                startY
            )
          );

        applyLayout();
      };

    const stop =
      () => {
        if (!active) {
          return;
        }

        active =
          false;

        saveUI();
      };

    resizeHandle.onpointerup =
      stop;

    resizeHandle.onpointercancel =
      stop;

    resizeHandle.ondblclick =
      event => {
        event.preventDefault();

        state.width =
          DEF.width;

        state.height =
          DEF.height;

        applyLayout();

        saveUI();

        notify(
          '大小已恢复默认'
        );
      };
  })();

  // =========================================================
  // Ctrl/Cmd + Z：撤回资料库操作
  // =========================================================

  document.addEventListener(
    'keydown',

    event => {
      if (
        !(event.ctrlKey ||
          event.metaKey) ||
        event.shiftKey ||
        event.altKey ||
        event.key.toLowerCase() !==
          'z' ||
        !state.open ||
        (
          !state.manage &&
          !root.contains(
            document.activeElement
          )
        )
      ) {
        return;
      }

      const target =
        event.target;

      // 在编辑输入框里保留浏览器原生文字撤销，
      // 不抢 Ctrl/Cmd+Z。
      if (
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLTextAreaElement ||
        target instanceof
          HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      undoLast();
    },

    true
  );

  // =========================================================
  // ESC
  // =========================================================

  document.addEventListener(
    'keydown',

    event => {
      if (
        event.key !==
        'Escape'
      ) {
        return;
      }

      if (
        !modal.hidden
      ) {
        closeModal();

      } else if (
        state.open
      ) {
        rememberScroll(false);

        state.open =
          false;

        saveUI();
        render();
      }
    },

    true
  );

  // =========================================================
  // 浏览器窗口改变
  // =========================================================

  addEventListener(
    'resize',

    () => {
      applyLayout();

      saveUI();
    }
  );

  // =========================================================
  // 初始化
  // =========================================================

  const initialCategory =
    db.categories.find(
      category =>
        category.id ===
        state.categoryId
    );

  if (initialCategory) {
    const rememberedId =
      state.lastCardByCategory[
        initialCategory.id
      ];

    if (
      !initialCategory.cards.some(
        card =>
          card.id ===
          state.cardId
      )
    ) {
      state.cardId =
        initialCategory.cards.some(
          card =>
            card.id ===
            rememberedId
        )
          ? rememberedId
          : initialCategory.cards[0]
              ?.id ||
            '';
    }

    if (state.cardId) {
      state.lastCardByCategory[
        initialCategory.id
      ] =
        state.cardId;
    }
  }

  applyLayout();

  render();

  addEventListener(
    'pagehide',
    () => {
      rememberScroll(false);
      saveUI();
    }
  );

  console.log(
    '[秋招网申资料库 v3.4.6] 已启动'
  );

})();