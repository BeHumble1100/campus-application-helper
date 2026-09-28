// ==UserScript==
// @name         秋招网申助手 v2 · 快捷填充
// @namespace    campus-application-helper
// @version      2.0.0
// @description  本地网申资料库；经历锁定、输入框旁快捷候选、手动填入/撤销、搜索和 JSON 备份。不自动提交。
// @match        http://*/*
// @match        https://*/*
// @noframes
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';
  if (document.getElementById('campus-application-helper-v2-root')) return;

  // 沿用 v1.x 的 JSON 字段和存储键；Tampermonkey 的不同脚本可能隔离存储，升级前请从旧脚本导出 JSON，再在本版导入。分组索引仅在内存中生成。
  const DB_KEY = 'campus-application-helper.entries.v1';
  const POS_KEY = 'campus-application-helper.position.v1';
  const SCHEMA = 'campus-application-helper';
  const CATS = ['基本信息','求职意向','教育经历','毕业设计','实习经历','项目经验','自我评价','获奖经历','其他'];
  const GROUPS = [
    {id:'global',name:'基础资料',category:null,prefix:null},
    {id:'edu:硕士',name:'硕士 · 早稻田大学',category:'教育经历',prefix:'硕士'},
    {id:'edu:本科',name:'本科 · 大连理工大学',category:'教育经历',prefix:'本科'},
    {id:'edu:高中',name:'高中',category:'教育经历',prefix:'高中'},
    {id:'intern:联合汽车电子 UAES',name:'联合汽车电子 UAES',category:'实习经历',prefix:'联合汽车电子 UAES'},
    {id:'intern:挚达科技',name:'挚达科技',category:'实习经历',prefix:'挚达科技'},
    {id:'project:PRISM',name:'PRISM',category:'项目经验',prefix:'PRISM'},
    {id:'project:CheckList',name:'CheckList',category:'项目经验',prefix:'CheckList'},
    {id:'project:DeepResearch',name:'DeepResearch',category:'项目经验',prefix:'DeepResearch'},
    {id:'project:自动充电机械臂碰撞检测与自恢复系统',name:'机械臂项目',category:'项目经验',prefix:'自动充电机械臂碰撞检测与自恢复系统'}
  ];
  const CONTROL_TYPES = new Set(['text','search','email','tel','url','number']);
  const MAX_ITEMS = 500, MAX_TEXT = 20000, MAX_TOTAL = 1500000;
  const $id = (id) => ui.getElementById(id);
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const norm = (s) => String(s || '').replace(/\s+/g,' ').replace(/[：:*必填]/g,'').trim().slice(0,90);
  const lower = (s) => norm(s).toLowerCase();
  const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

  // 字段含义只从明确关联的标签等少量文字判定，不读取输入框已有值，不上传页面数据。
  const FIELDS = [
    {key:'email',cat:'基本信息',rx:/(?:电子)?邮箱|电子邮件|e[ -]?mail/i},
    {key:'wechat',cat:'基本信息',rx:/微信|wechat|weixin/i},
    {key:'github',cat:'基本信息',rx:/github/i},
    {key:'phone',cat:'基本信息',rx:/手机号|手机号码|联系电话|手机|mobile(?: number)?|phone(?: number)?/i},
    {key:'birth',cat:'基本信息',rx:/出生年月|出生日期|生日|date of birth|\bdob\b/i},
    {key:'gender',cat:'基本信息',rx:/性别|gender/i},
    {key:'name',cat:'基本信息',rx:/^姓名$|^(?:应聘人|申请人|候选人)姓名$|^中文名$|^真实姓名$|^full[ _-]?name$|^real[ _-]?name$/i},
    {key:'hometown',cat:'基本信息',rx:/生源地|籍贯|户籍地/i},
    {key:'city',cat:'求职意向',rx:/意向工作(?:城市|地|地点)|期望工作(?:城市|地|地点)|工作城市|意向城市|work location/i},
    {key:'job',cat:'求职意向',rx:/应聘岗位|意向岗位|期望职位|求职岗位|求职意向|应聘职位/i},
    {key:'school',cat:'教育经历',rx:/毕业院校|就读学校|学校名称|院校名称|毕业学校|^学校$|^university$|^school$/i},
    {key:'major',cat:'教育经历',rx:/所学专业|专业名称|^专业$|^major$/i},
    {key:'college',cat:'教育经历',rx:/院系|学院|研究科|^college$|^faculty$/i},
    {key:'degree',cat:'教育经历',rx:/学位|^degree$/i},
    {key:'level',cat:'教育经历',rx:/学历|education level/i},
    {key:'eduStart',cat:'教育经历',rx:/入学(?:时间|日期|年月|年份)|就读开始|入校日期/i},
    {key:'eduEnd',cat:'教育经历',rx:/毕业(?:时间|日期|年月|年份)|就读结束|graduation date/i},
    {key:'thesisTitle',cat:'毕业设计',rx:/毕业(?:设计|论文)(?:题目|名称)|论文题目|研究课题名称|thesis title/i},
    {key:'thesisBody',cat:'毕业设计',rx:/毕业(?:设计|论文)(?:内容|简介|摘要)|研究内容|研究工作|论文摘要/i},
    {key:'company',cat:'实习经历',rx:/实习(?:公司|单位)|公司名称|单位名称|工作单位|^雇主$|^employer$|^company$/i},
    {key:'internRole',cat:'实习经历',rx:/实习(?:岗位|职位)|职位名称|岗位名称|^岗位$|^职位$|job title/i},
    {key:'department',cat:'实习经历',rx:/实习部门|所在部门|部门名称|^部门$/i},
    {key:'internStart',cat:'实习经历',rx:/实习开始|实习起始|入职日期|入职时间/i},
    {key:'internEnd',cat:'实习经历',rx:/实习结束|实习截止|离职日期|离职时间/i},
    {key:'internBody',cat:'实习经历',rx:/实习(?:工作|内容|收获|描述)|岗位职责|工作职责|工作内容|实践内容|工作描述/i},
    {key:'projectName',cat:'项目经验',rx:/项目(?:名称|名字)|project name|project title/i},
    {key:'projectRole',cat:'项目经验',rx:/项目(?:角色|身份|职位)|担任角色|project role/i},
    {key:'projectStack',cat:'项目经验',rx:/技术栈|项目技术|技术框架|tech stack/i},
    {key:'projectStart',cat:'项目经验',rx:/项目开始|项目起始|项目启动日期/i},
    {key:'projectDesc',cat:'项目经验',rx:/项目(?:介绍|描述|简介|概述|内容)|project description|project summary/i},
    {key:'projectWork',cat:'项目经验',rx:/项目(?:职责|贡献|工作|成果)|负责内容|项目中承担/i},
    {key:'self',cat:'自我评价',rx:/自我评价|自我介绍|个人评价|个人优势|个人总结|self evaluation/i},
    {key:'award',cat:'获奖经历',rx:/获奖经历|奖项荣誉|奖学金|荣誉奖励|award|scholarship/i},
    {key:'skills',cat:'其他',rx:/专业技能|技术技能|技能特长|计算机水平|technical skills/i}
  ];
  const BLOCK = /身份证|证件号码|护照号码|银行卡|验证码|校验码|密码|家庭成员|父亲|母亲|监护人|紧急联系人|推荐人|工资|薪酬|期望薪资|政治面貌|民族/i;

  function mappedEntry(e) {
    const i = e.title.indexOf('｜');
    const prefix = i < 0 ? '' : e.title.slice(0,i).trim();
    const label = i < 0 ? e.title : e.title.slice(i+1).trim();
    let group = 'global';
    if (e.category === '教育经历' || e.category === '毕业设计') {
      if (['硕士','本科','高中'].includes(prefix)) group = `edu:${prefix}`;
    } else if (e.category === '实习经历') {
      if (prefix.includes('联合汽车电子') || /UAES/i.test(prefix)) group = 'intern:联合汽车电子 UAES';
      else if (prefix.includes('挚达')) group = 'intern:挚达科技';
    } else if (e.category === '项目经验') {
      const hit = GROUPS.find(g => g.category === '项目经验' && g.prefix === prefix);
      if (hit) group = hit.id;
    }
    let field = null;
    if (e.category === '基本信息') {
      if (/^姓名$/.test(e.title)) field='name';
      else if (/邮箱/.test(e.title)) field='email';
      else if (/手机号/.test(e.title)) field='phone';
      else if (/微信/.test(e.title)) field='wechat';
      else if (/GitHub/i.test(e.title)) field='github';
      else if (/出生/.test(e.title)) field='birth';
      else if (/性别/.test(e.title)) field='gender';
      else if (/生源地|籍贯/.test(e.title)) field='hometown';
    } else if (e.category === '求职意向') {
      if (/岗位|求职意向/.test(e.title)) field='job';
      else if (/城市|工作地点/.test(e.title)) field='city';
    } else if (e.category === '教育经历') {
      if (/学校$/.test(label)) field='school';
      else if (/专业$/.test(label)) field='major';
      else if (/学院|研究科/.test(label)) field='college';
      else if (/学位/.test(label)) field='degree';
      else if (/学历/.test(label)) field='level';
      else if (/入学/.test(label)) field='eduStart';
      else if (/毕业/.test(label) && /时间|日期|年份/.test(label)) field='eduEnd';
    } else if (e.category === '毕业设计') {
      if (/论文题目/.test(label)) field='thesisTitle';
      else if (/研究内容/.test(label)) field='thesisBody';
    } else if (e.category === '实习经历') {
      if (/公司名称|公司全称/.test(label)) field='company';
      else if (/实习岗位/.test(label)) field='internRole';
      else if (/实习部门|^部门$/.test(label)) field='department';
      else if (/开始日期/.test(label)) field='internStart';
      else if (/结束日期/.test(label)) field='internEnd';
      else if (/实习内容|岗位职责|经历概述/.test(label)) field='internBody';
    } else if (e.category === '项目经验') {
      if (/项目名称$/.test(label)) field='projectName';
      else if (/项目角色/.test(label)) field='projectRole';
      else if (/技术栈/.test(label)) field='projectStack';
      else if (/项目开始年月/.test(label)) field='projectStart';
      else if (/项目介绍|项目描述/.test(label)) field='projectDesc';
      else if (/项目职责|工作内容/.test(label)) field='projectWork';
    } else if (e.category === '自我评价') field='self';
    else if (e.category === '获奖经历') field='award';
    else if (e.category === '其他' && /技能/.test(e.title)) field='skills';
    return {group,field,label};
  }

  function validate(list) {
    if (!Array.isArray(list) || list.length > MAX_ITEMS) throw Error('信息库格式错误或超过 500 条');
    const ids=new Set(); let size=0;
    return list.map(raw=>{
      if (!raw || !CATS.includes(raw.category) || typeof raw.title!=='string' || !raw.title.trim() || raw.title.length>120 || typeof raw.content!=='string' || !raw.content.trim() || raw.content.length>MAX_TEXT) throw Error('条目类别、标题或内容无效');
      const id = typeof raw.id==='string' && /^[\w-]{1,100}$/.test(raw.id) ? raw.id : makeId();
      if (ids.has(id)) throw Error('备份包含重复 ID'); ids.add(id);
      size += raw.title.length + raw.content.length;
      return {id,category:raw.category,title:raw.title.trim(),content:raw.content,createdAt:Number.isFinite(raw.createdAt)?raw.createdAt:Date.now(),updatedAt:Number.isFinite(raw.updatedAt)?raw.updatedAt:Date.now(),favorite:raw.favorite===true};
    }).map((e,i,a)=>{if(i===a.length-1 && size>MAX_TOTAL) throw Error('信息库总容量超出限制');return e;});
  }

  let entries=[], snapshot=null, healthy=true, dbError='';
  try {
    const original=GM_getValue(DB_KEY,null);
    snapshot=original===null?null:typeof original==='string'?original:JSON.stringify(original);
    if (original!==null) entries=validate(typeof original==='string'?JSON.parse(original):original);
  } catch(err) {healthy=false;dbError=String(err);console.error('[网申助手 v2] 读取失败，为保护数据已禁止写入',err);}
  function save(next) {
    if(!healthy) throw Error('原数据读取异常，已禁止修改');
    const current=GM_getValue(DB_KEY,null);
    const now=current===null?null:typeof current==='string'?current:JSON.stringify(current);
    if(now!==snapshot) throw Error('另一个标签页已修改资料库，请刷新本页再操作');
    const checked=validate(next), serialized=JSON.stringify(checked);
    GM_setValue(DB_KEY,serialized);
    snapshot=serialized;entries=checked;
  }

  let active=null, context='global', detected=null, search='', filter='all';
  let menuOpen=false, managerOpen=false, editId=null, importPlan=null, undo=null, filling=false;
  let bubble={x:Math.max(10,innerWidth-58),y:Math.max(10,innerHeight-135)}, drag=null, ignoreClick=false;
  try {
    const pos=GM_getValue(POS_KEY,null);
    if(pos && Number.isFinite(pos.xRatio) && Number.isFinite(pos.yRatio)) {
      bubble={x:clamp(pos.xRatio*(innerWidth-40),10,Math.max(10,innerWidth-40)),y:clamp(pos.yRatio*(innerHeight-40),10,Math.max(10,innerHeight-40))};
    }
  } catch (_) {}

  // 使用 closed Shadow DOM 隔离招聘网站 CSS；输入框边上的按钮只在手动选中时可见。
  const host=document.createElement('div');host.id='campus-application-helper-v2-root';
  const ui=host.attachShadow({mode:'closed'});
  ui.innerHTML=`<style>
    :host{all:initial;color-scheme:light;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;position:fixed;inset:0;width:0;height:0;z-index:2147483646;pointer-events:none}
    *,*:before,*:after{box-sizing:border-box} [hidden]{display:none!important}button,input,select,textarea{font:inherit}
    button{cursor:pointer}button:disabled{opacity:.4;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
    .surface{pointer-events:auto;background:white;color:#17243b;border:1px solid #d9e2ef;border-radius:11px;box-shadow:0 8px 30px #102b4a30}
    #bubble{position:fixed;width:38px;height:38px;background:#155eef;color:white;border:0;border-radius:13px;pointer-events:auto;box-shadow:0 5px 15px #1114;touch-action:none;user-select:none;font-size:18px}
    #trigger{position:fixed;width:26px;height:26px;background:#155eef;color:white;border:2px solid white;border-radius:9px;pointer-events:auto;box-shadow:0 2px 9px #0003;font-size:13px}
    #quick{position:fixed;width:min(324px,calc(100vw - 16px));max-height:min(330px,70vh);overflow:auto;padding:9px;pointer-events:auto}
    #manager{position:fixed;right:10px;top:10px;width:min(420px,calc(100vw - 20px));height:min(730px,calc(100vh - 20px));display:flex;flex-direction:column;overflow:hidden;pointer-events:auto}
    .row{display:flex;gap:7px;align-items:center}.between{justify-content:space-between}.grow{flex:1;min-width:0}.muted{color:#64748b;font-size:11px}.title{font-weight:750;font-size:15px}.btn{border:1px solid #cbd5e1;background:white;color:#243750;border-radius:8px;padding:6px 9px;white-space:nowrap}.btn.primary{background:#155eef;border-color:#155eef;color:white}.btn.sm{padding:4px 7px;font-size:11px}.btn:hover:not(:disabled){background:#eef4ff}.btn.primary:hover:not(:disabled){background:#0b4bcc}
    .input{width:100%;min-width:0;background:#fff;color:#17243b;border:1px solid #cbd5e1;border-radius:8px;padding:7px}textarea.input{resize:vertical;min-height:95px}
    .quick-item{width:100%;text-align:left;display:block;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:white;color:#17243b;margin-top:6px;white-space:normal;overflow-wrap:anywhere}.quick-item:hover{background:#edf5ff}.quick-title{font-weight:650}.quick-preview{color:#64748b;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .mutedbox{background:#f1f5f9;border-radius:7px;padding:6px 8px;color:#475569}.head{padding:12px;border-bottom:1px solid #e2e8f0}.controls{padding:9px 12px;border-bottom:1px solid #e2e8f0}.scroll{padding:10px 12px;overflow:auto;flex:1;min-height:0;overscroll-behavior:contain}.foot{padding:9px 12px;border-top:1px solid #e2e8f0}.item{border:1px solid #e2e8f0;border-radius:9px;padding:9px;margin-bottom:7px}.item-top{display:flex;justify-content:space-between;gap:6px}.tag{color:#2563eb;font-size:11px}.preview{color:#64748b;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:5px 0}
    #status{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;color:#475569;margin-top:6px}#status.error{color:#b42318}#status.success{color:#17633b}#edit,#import{padding:12px;overflow:auto;flex:1;min-height:0}.field{display:block;font-weight:600;margin:0 0 10px}.field .input{display:block;margin-top:4px;font-weight:400}.divider{border:0;border-top:1px solid #e2e8f0;margin:8px 0}
  </style>
  <button id="bubble" aria-label="网申资料库（可拖动）" title="点击管理资料；拖动换位置">✎</button>
  <button id="trigger" aria-label="打开当前字段快捷填充" title="打开当前字段快捷填充" hidden>↧</button>
  <section id="quick" class="surface" aria-label="当前字段快捷填充" hidden>
    <div class="row between"><strong id="quickTitle">快捷填充</strong><button class="btn sm" id="quickClose">×</button></div>
    <div class="row" style="margin-top:7px"><select class="input grow" id="quickGroup" aria-label="当前填写对象"></select><button class="btn sm" id="quickManage">资料库</button></div>
    <div id="quickHint" class="muted" style="margin-top:6px"></div><div id="quickCandidates"></div>
    <div class="row" style="margin-top:8px"><button id="quickMore" class="btn sm grow">搜索更多</button><button id="undo" class="btn sm" disabled>撤销上次填充</button></div>
  </section>
  <section id="manager" class="surface" aria-label="网申资料库" hidden>
    <div class="head"><div class="row between"><div class="title">秋招网申助手 v2</div><button id="managerClose" class="btn sm">关闭</button></div><div class="muted">资料仅保存在本地；选字段 → 点击 ↧ → 手动填入</div><div class="row" style="margin-top:7px"><span class="muted">正在填写：</span><select id="contextSelect" class="input grow" aria-label="锁定当前填写对象"></select></div></div>
    <div id="main" style="display:flex;flex-direction:column;min-height:0;flex:1">
      <div class="controls"><div class="row"><select id="managerGroup" class="input grow" aria-label="筛选资料组"></select><button id="add" class="btn primary sm">＋ 新增</button></div><div class="row" style="margin-top:7px"><input id="search" class="input grow" type="search" placeholder="搜索当前组或全部资料"/><select id="category" class="input" style="width:110px" aria-label="类别"></select></div></div>
      <div id="list" class="scroll"></div>
    </div>
    <form id="edit" hidden><strong id="editTitle">新增信息</strong><label class="field">类别<select id="editCat" class="input" required></select></label><label class="field">标题<input id="editName" class="input" maxlength="120" required placeholder="例：硕士｜学校"/></label><label class="field">内容<textarea id="editText" class="input" maxlength="20000" required></textarea></label><div class="row between"><button type="button" id="editCancel" class="btn">取消</button><button type="submit" class="btn primary">保存</button></div></form>
    <section id="import" hidden><strong>JSON 导入预览</strong><p id="importInfo" class="muted"></p><div id="importConflicts"></div><div class="row between"><button id="importCancel" class="btn">取消</button><button id="importApply" class="btn primary">确认导入</button></div></section>
    <div class="foot"><div class="row"><button id="export" class="btn sm">导出 JSON</button><button id="importBtn" class="btn sm">导入 JSON</button><span id="count" class="muted grow" style="text-align:right"></span><input id="file" type="file" accept=".json,application/json" hidden/></div><div id="status" role="status" aria-live="polite"></div></div>
  </section>`;
  (document.documentElement||document.body).appendChild(host);
  const trigger=$id('trigger'),quick=$id('quick'),manager=$id('manager');
  const option=(v,t)=>{const x=document.createElement('option');x.value=v;x.textContent=t;return x;};
  for(const g of GROUPS){$id('quickGroup').append(option(g.id,g.name));$id('managerGroup').append(option(g.id,g.name));$id('contextSelect').append(option(g.id,g.name));}
  $id('managerGroup').prepend(option('all','全部资料'));
  $id('category').append(option('all','全部类别'));
  for(const c of CATS){$id('category').append(option(c,c));$id('editCat').append(option(c,c));}
  $id('managerGroup').value='all';
  function status(s,type=''){$id('status').textContent=s;$id('status').className=type;}
  function targetOK(t){
    if(!(t instanceof HTMLElement)||!t.isConnected||t.ownerDocument!==document||host.contains(t)||t.closest('[inert]')||t.getClientRects().length===0)return false;
    const css=getComputedStyle(t);if(css.visibility==='hidden'||css.visibility==='collapse')return false;
    if(t instanceof HTMLInputElement)return CONTROL_TYPES.has(t.type.toLowerCase())&&!t.disabled&&!t.readOnly;
    if(t instanceof HTMLTextAreaElement)return !t.disabled&&!t.readOnly;
    return t.isContentEditable;
  }
  function targetFrom(node){
    if(!(node instanceof HTMLElement)||node===host||host.contains(node))return null;
    if(node instanceof HTMLInputElement||node instanceof HTMLTextAreaElement)return targetOK(node)?node:null;
    const content=node.closest('[contenteditable="true"],[contenteditable="plaintext-only"]');
    return content&&targetOK(content)?content:null;
  }
  function evidence(target){
    const strong=[],medium=[],weak=[];
    const add=(list,s)=>{const n=norm(s);if(n&&!list.includes(n))list.push(n);};
    if(target.labels) for(const label of Array.from(target.labels).slice(0,2))add(strong,label.textContent);
    if(!strong.length && target.id) {
      try{const label=document.querySelector(`label[for="${CSS.escape(target.id)}"]`);if(label)add(strong,label.textContent);}catch(_){}
    }
    const aria=target.getAttribute('aria-labelledby');
    if(aria)for(const id of aria.split(/\s+/).slice(0,3)){const node=document.getElementById(id);if(node)add(strong,node.textContent);}
    add(strong,target.getAttribute('aria-label'));
    if(!strong.length){
      for(let p=target.parentElement,d=0;p&&d<3&&p!==document.body;p=p.parentElement,d++){
        const labels=Array.from(p.children).filter(n=>n.matches?.('label,.ant-form-item-label,.el-form-item__label,.form-label'));
        if(labels.length===1 && p.querySelectorAll('input,textarea,[contenteditable="true"]').length===1){add(strong,labels[0].textContent);break;}
      }
    }
    add(medium,target.getAttribute('placeholder'));add(medium,target.getAttribute('title'));
    add(weak,target.getAttribute('name'));add(weak,target.getAttribute('id'));
    return {strong,medium,weak};
  }
  function identify(t){
    if(!targetOK(t))return null;
    const ev=evidence(t);
    for(const [rank,list] of [[3,ev.strong],[2,ev.medium],[1,ev.weak]]){
      const findings=[];
      for(const part of list){if(BLOCK.test(part))return null;const hits=FIELDS.filter(f=>f.rx.test(part));if(hits.length===1)findings.push(hits[0]);}
      const unique=[...new Set(findings.map(f=>f.key))];
      if(unique.length>1)return null;
      if(unique.length===1){const rule=findings[0];return {...rule,rank,hint:list[0]||rule.key};}
    }
    if(t instanceof HTMLInputElement && t.type==='email')return {...FIELDS[0],rank:1,hint:'邮箱'};
    if(t instanceof HTMLInputElement && t.type==='tel')return {...FIELDS.find(f=>f.key==='phone'),rank:1,hint:'联系电话'};
    // “开始时间/结束时间”本身无法判断是哪段经历，仅在用户手动锁定资料对象后解释。
    const wording=[...ev.strong,...ev.medium].join(' ');
    let contextual=null;
    if(/^(edu:|intern:|project:)/.test(context)) {
      const isStart=/开始时间|开始日期|起始时间|起始日期|^开始$|^start date$/i.test(wording);
      const isEnd=/结束时间|结束日期|截止时间|^结束$|^end date$/i.test(wording);
      if(isStart||isEnd){
        const prefix=context.startsWith('edu:')?'edu':context.startsWith('intern:')?'intern':'project';
        contextual=FIELDS.find(f=>f.key===prefix+(isStart?'Start':'End'))||null;
      }
    }
    return contextual?{...contextual,rank:2,hint:wording.slice(0,35)}:null;
  }
  function groupFor(entry){return mappedEntry(entry).group;}
  function eligible(entry,det,ctx){
    if(!det)return false;
    const map=mappedEntry(entry);
    if(map.field!==det.key)return false;
    if(['基本信息','求职意向','自我评价','获奖经历','其他'].includes(entry.category))return true;
    if(ctx==='global')return true; // 未锁定时明确展示多个候选，绝不自行选定硕士/本科/公司。
    if(ctx.startsWith('edu:'))return map.group===ctx;
    if(ctx.startsWith('intern:'))return map.group===ctx;
    if(ctx.startsWith('project:'))return map.group===ctx;
    return false;
  }
  function matchCandidates(){
    if(!detected)return [];
    const candidates=entries.filter(e=>eligible(e,detected,context));
    const hints=evidence(active),text=[...hints.strong,...hints.medium].join(' ');
    const year=/年份|year/i.test(text),full=/YYYY[-/]MM[-/]DD|完整日期|具体日期/i.test(text),month=/年月|YYYY[-/]MM/i.test(text);
    return candidates.sort((a,b)=>{
      const weight=e=>{
        let n=e.favorite?2:0;const t=e.title;
        if(year&&/年份/.test(t))n+=20;
        if(full&&/日期|YYYY[-/]MM[-/]DD/.test(t))n+=20;
        if(month&&!full&&/YYYY[-/]MM|年月|月份/.test(t))n+=20;
        if(!year&&!full&&!month&&/精简|简述/.test(t))n+=1;
        return n;
      };
      return weight(b)-weight(a)||a.title.localeCompare(b.title,'zh-CN');
    });
  }
  function placeTrigger(){
    if(!targetOK(active)||managerOpen||(!menuOpen&&document.activeElement!==active)){trigger.hidden=true;return;}
    const r=active.getBoundingClientRect();const x=clamp(r.right-23,8,innerWidth-32);const y=clamp(r.top+(r.height-26)/2,8,innerHeight-34);
    trigger.style.left=x+'px';trigger.style.top=y+'px';trigger.hidden=false;
  }
  function placeQuick(){
    if(!menuOpen)return;
    const anchor=targetOK(active)?active.getBoundingClientRect():trigger.getBoundingClientRect();
    const w=quick.getBoundingClientRect().width||320,h=quick.getBoundingClientRect().height||200;
    const x=clamp(anchor.left,8,Math.max(8,innerWidth-w-8));
    let y=anchor.bottom+6;
    if(y+h>innerHeight-8)y=anchor.top-h-6;
    quick.style.left=x+'px';quick.style.top=clamp(y,8,Math.max(8,innerHeight-h-8))+'px';
  }
  function renderQuick(){
    $id('quickGroup').value=context;
    $id('quickTitle').textContent=detected?`快捷填充 · ${detected.hint.slice(0,28)}`:'快捷填充 · 未识别字段';
    const matched=matchCandidates();const wrap=$id('quickCandidates');wrap.replaceChildren();
    $id('quickHint').textContent=detected?(matched.length?`当前对象：${GROUPS.find(g=>g.id===context)?.name} · 请核对候选内容`:'当前对象下暂无明确匹配，改用搜索或切换资料组'):'字段名称不明确，不猜测内容；可以手动搜索';
    for(const e of matched.slice(0,3)){
      const b=document.createElement('button');b.type='button';b.className='quick-item';b.dataset.id=e.id;
      const heading=document.createElement('div');heading.className='quick-title';heading.textContent=e.title;
      const preview=document.createElement('div');preview.className='quick-preview';preview.textContent=e.content;
      b.append(heading,preview);wrap.append(b);
    }
    $id('undo').disabled=!undo;
    $id('quickMore').textContent=matched.length>3?`查看更多（共 ${matched.length} 条）`:'搜索更多';
    if(menuOpen)placeQuick();
  }
  function setContext(value){
    context=GROUPS.some(g=>g.id===value)?value:'global';
    $id('quickGroup').value=context;$id('contextSelect').value=context;
    if(targetOK(active))detected=identify(active);
    // 下拉资料组是主动行为，管理面板的筛选可由用户独立修改。
    renderQuick();
  }
  function openQuick(){
    if(!targetOK(active)){status('先点击网页中的文本输入框','error');return;}
    if(managerOpen)closeManager();
    menuOpen=true;quick.hidden=false;detected=identify(active);renderQuick();placeTrigger();
  }
  function closeQuick(){menuOpen=false;quick.hidden=true;placeTrigger();}
  function onPageFocus(e){
    if(e.target===host||host.contains(e.target)||filling)return;
    const next=targetFrom(e.target);
    if(!next){if(menuOpen)closeQuick();trigger.hidden=true;return;}
    if(active!==next){active=next;undo=null;detected=identify(active);closeQuick();}
    placeTrigger();
  }
  document.addEventListener('focusin',onPageFocus,true);
  document.addEventListener('pointerdown',e=>{
    if(e.target===host||host.contains(e.target))return;
    const next=targetFrom(e.target);
    if(next && next!==active){active=next;undo=null;detected=identify(next);closeQuick();placeTrigger();}
    else if(!next){if(menuOpen)closeQuick();trigger.hidden=true;}
  },true);
  window.addEventListener('scroll',()=>{placeTrigger();placeQuick();},true);
  window.addEventListener('resize',()=>{positionBubble();placeTrigger();placeQuick();},true);

  function valueSetter(t,v){
    const isText=t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement;
    if(isText){
      const proto=t instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if(!setter)throw Error('此字段不支持通用填入');
      setter.call(t,v);
      try{t.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertReplacementText',data:v}));}
      catch(_){t.dispatchEvent(new Event('input',{bubbles:true,composed:true}));}
      t.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
      return t.value===v;
    }
    return false; // 复杂富文本默认复制粘贴，不破坏其编辑器内部结构。
  }
  function fill(e){
    const t=active;
    if(!targetOK(t)){status('目标字段已失效，请重新点击输入框','error');return;}
    if(!(t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement)){
      status('富文本编辑器请使用“复制”后自行粘贴，避免破坏排版','error');openManager(e.id);return;
    }
    if(t.maxLength>=0 && e.content.length>t.maxLength){status(`该字段最多 ${t.maxLength} 字符，请选精简版或手动编辑`,'error');return;}
    if(t instanceof HTMLInputElement && t.type==='number'&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(e.content.trim())){status('数字输入框不能填入这条文字内容','error');return;}
    const previous=t.value;
    if(previous===e.content){status('字段已经是相同内容，没有修改','success');closeQuick();return;}
    if(previous&&!window.confirm(`该字段已有内容，确定用“${e.title}”覆盖吗？`))return;
    if(!targetOK(t))return;
    try{
      filling=true;undo=null;
      if(!valueSetter(t,e.content))throw Error('页面未接受填入，请使用复制功能');
      undo={target:t,before:previous,after:e.content};
      closeQuick();if(managerOpen)closeManager();status(`已填入“${e.title}”，请核对网页提示；不会自动提交`,'success');
      setTimeout(()=>{
        if(undo?.target!==t)return;
        if(!targetOK(t)||t.value!==e.content){undo=null;status('网页恢复/修改了字段，建议手动复制粘贴','error');}
        renderQuick();
      },350);
    }catch(err){undo=null;status(String(err.message||err),'error');}
    finally{filling=false;}
    placeTrigger();
  }
  function undoLast(){
    if(!undo)return;
    const {target,before,after}=undo;undo=null;
    if(!targetOK(target)||target.value!==after){status('字段已变化，为保护新内容不能撤销','error');renderQuick();return;}
    if(!window.confirm('撤销助手上一次填充，恢复原字段内容？')){renderQuick();return;}
    try{if(!valueSetter(target,before))throw Error('网页拒绝恢复原内容');status('已撤销上次填充，请核对网页字段','success');}
    catch(err){status('撤销失败：'+err.message,'error');}
    renderQuick();
  }
  async function copyText(e){
    try{
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(e.content);status(`已复制“${e.title}”`,'success');return;}
    }catch(_){}
    const tmp=document.createElement('textarea');tmp.value=e.content;tmp.style.cssText='position:fixed;top:0;left:-9999px';ui.append(tmp);tmp.focus();tmp.select();
    let ok=false;try{ok=document.execCommand('copy');}finally{tmp.remove();}
    status(ok?`已复制“${e.title}”`:'复制失败，请检查浏览器权限',ok?'success':'error');
  }
  function openManager(query=''){
    closeQuick();managerOpen=true;manager.hidden=false;trigger.hidden=true;
    $id('main').hidden=false;$id('edit').hidden=true;$id('import').hidden=true;
    if(typeof query==='string'){$id('search').value=query;search=query;}
    $id('managerGroup').value=context==='global'?'all':context;
    renderManager();
  }
  function closeManager(){managerOpen=false;manager.hidden=true;placeTrigger();}
  function renderManager(){
    const g=$id('managerGroup').value,cat=$id('category').value,q=lower($id('search').value);
    const items=entries.filter(e=>{
      if(cat!=='all'&&e.category!==cat)return false;
      if(g!=='all'&&g!=='global'&&groupFor(e)!==g)return false;
      if(g==='global'&&groupFor(e)!=='global')return false;
      return !q||lower(e.category+' '+e.title+' '+e.content).includes(q);
    }).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.updatedAt-a.updatedAt);
    const list=$id('list');list.replaceChildren();
    if(!items.length){const x=document.createElement('p');x.className='muted';x.textContent='该筛选下没有条目，可切换为“全部资料”或搜索其他关键词。';list.append(x);}
    for(const e of items){
      const item=document.createElement('div');item.className='item';item.dataset.id=e.id;
      const top=document.createElement('div');top.className='item-top';
      const title=document.createElement('strong');title.textContent=e.title;
      const category=document.createElement('span');category.className='muted';category.textContent=e.category;top.append(title,category);
      const preview=document.createElement('div');preview.className='preview';preview.textContent=e.content;
      const bar=document.createElement('div');bar.className='row';
      for(const [action,label] of [['fill','填入'],['copy','复制'],['favorite',e.favorite?'★':'☆'],['edit','编辑'],['delete','删除']]){
        const b=document.createElement('button');b.type='button';b.className='btn sm';b.dataset.action=action;b.textContent=label;
        if(!healthy&&['favorite','edit','delete'].includes(action))b.disabled=true;
        bar.append(b);
      }
      item.append(top,preview,bar);list.append(item);
    }
    $id('count').textContent=`${items.length}/${entries.length} 条`;
    $id('add').disabled=$id('importBtn').disabled=!healthy;
    if(!healthy)status('数据读取异常，已停止写入：'+dbError,'error');
  }
  function editEntry(e){
    if(!healthy)return;
    editId=e?.id||null;$id('main').hidden=true;$id('edit').hidden=false;$id('import').hidden=true;
    $id('editTitle').textContent=e?'编辑资料':'新增资料';
    $id('editCat').value=e?.category||(context.startsWith('edu:')?'教育经历':context.startsWith('intern:')?'实习经历':context.startsWith('project:')?'项目经验':'基本信息');
    $id('editName').value=e?.title||((GROUPS.find(g=>g.id===context)?.prefix||'')+(context==='global'?'':'｜'));
    $id('editText').value=e?.content||'';
  }
  function backToManager(){$id('edit').hidden=true;$id('import').hidden=true;$id('main').hidden=false;editId=null;renderManager();}
  function deleteEntry(e){
    if(!window.confirm(`删除“${e.title}”？此操作不可撤销，建议先导出备份。`))return;
    try{save(entries.filter(x=>x.id!==e.id));renderManager();status('已删除','success');}catch(err){status(err.message,'error');}
  }
  function toggleFavorite(e){
    try{save(entries.map(x=>x.id===e.id?{...x,favorite:!x.favorite}:x));renderManager();status('收藏状态已更新','success');}catch(err){status(err.message,'error');}
  }
  function exportJson(){
    if(!healthy){status('数据读取失败，不能生成可靠备份','error');return;}
    const backup={schema:SCHEMA,version:1,exportedAt:new Date().toISOString(),entries};
    const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`campus-helper-backup-${new Date().toISOString().slice(0,10)}.json`;ui.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);status('已请求下载 JSON，请确认下载完成并妥善保管明文资料','success');
  }
  function importPreview(file,data){
    if(!data||data.schema!==SCHEMA||data.version!==1)throw Error('备份格式不兼容');
    const incoming=validate(data.entries);
    const byId=new Map(entries.map(e=>[e.id,e]));
    const byTitle=new Map();for(const e of entries){const k=JSON.stringify([e.category,e.title]);byTitle.set(k,[...(byTitle.get(k)||[]),e]);}
    const incomingTitles=new Map(),seenSignatures=new Set(),pending=[],conflicts=[];let skip=0;
    for(const e of incoming){
      const sig=JSON.stringify([e.category,e.title,e.content]),key=JSON.stringify([e.category,e.title]);
      if(incomingTitles.has(key)&&incomingTitles.get(key)!==sig)throw Error('备份存在同类别同名但内容不同的条目，请先整理');
      incomingTitles.set(key,sig);
      if(seenSignatures.has(sig)){skip++;continue;}seenSignatures.add(sig);
      const same=entries.find(x=>x.category===e.category&&x.title===e.title&&x.content===e.content);
      if(same){skip++;continue;}
      const match=byId.get(e.id)||byTitle.get(key)?.[0];
      if(!byId.has(e.id)&&(byTitle.get(key)?.length||0)>1)throw Error(`当前资料库包含多条同名“${e.title}”，请先整理`);
      if(match)conflicts.push({incoming:e,existing:match});else pending.push(e);
    }
    importPlan={pending,conflicts,skip,snapshot};
    $id('main').hidden=true;$id('edit').hidden=true;$id('import').hidden=false;
    $id('importInfo').textContent=`${file.name}：新增 ${pending.length}、冲突 ${conflicts.length}、跳过重复 ${skip}。冲突默认保留本地版本。`;
    const root=$id('importConflicts');root.replaceChildren();
    for(let i=0;i<conflicts.length;i++){
      const c=conflicts[i],wrap=document.createElement('div');wrap.className='item';
      const t=document.createElement('strong');t.textContent=c.incoming.title;
      const p=document.createElement('div');p.className='preview';p.textContent=`当前：${c.existing.content.slice(0,70)}\n备份：${c.incoming.content.slice(0,70)}`;
      const sel=document.createElement('select');sel.className='input';sel.dataset.conflict=String(i);
      sel.append(option('keep','保留当前内容（默认）'),option('replace','使用备份版本覆盖'));
      wrap.append(t,p,sel);root.append(wrap);
    }
  }
  function applyImport(){
    if(!importPlan)return;
    try{
      if(importPlan.snapshot!==snapshot)throw Error('本地数据已变化，请重新导入');
      const replaces=new Map();
      for(const sel of $id('importConflicts').querySelectorAll('select[data-conflict]')){
        if(sel.value!=='replace')continue;
        const c=importPlan.conflicts[Number(sel.dataset.conflict)];
        if(replaces.has(c.existing.id))throw Error('同一记录出现多次覆盖冲突');
        replaces.set(c.existing.id,{...c.incoming,id:c.existing.id,createdAt:c.existing.createdAt,favorite:c.existing.favorite,updatedAt:Date.now()});
      }
      const occupied=new Set(entries.map(e=>e.id));const added=importPlan.pending.map(e=>{const x={...e};while(occupied.has(x.id))x.id=makeId();occupied.add(x.id);return x;});
      const next=[...entries.map(e=>replaces.get(e.id)||e),...added];validate(next);
      if(!window.confirm(`准备新增 ${added.length} 条、覆盖 ${replaces.size} 条。确认写入本地信息库？`))return;
      save(next);const n=added.length,r=replaces.size;importPlan=null;backToManager();status(`导入完成：新增 ${n}，覆盖 ${r}`,'success');
    }catch(err){status('导入未完成：'+err.message,'error');}
  }
  function positionBubble(){bubble.x=clamp(bubble.x,8,Math.max(8,innerWidth-46));bubble.y=clamp(bubble.y,8,Math.max(8,innerHeight-46));$id('bubble').style.left=bubble.x+'px';$id('bubble').style.top=bubble.y+'px';}
  positionBubble();
  $id('bubble').addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:bubble.x,oy:bubble.y,moved:false};$id('bubble').setPointerCapture(e.pointerId);});
  $id('bubble').addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.moved=true;if(drag.moved){bubble.x=drag.ox+dx;bubble.y=drag.oy+dy;positionBubble();}});
  $id('bubble').addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const moved=drag.moved;drag=null;ignoreClick=true;if($id('bubble').hasPointerCapture(e.pointerId))$id('bubble').releasePointerCapture(e.pointerId);if(moved){try{GM_setValue(POS_KEY,{xRatio:bubble.x/Math.max(8,innerWidth-46),yRatio:bubble.y/Math.max(8,innerHeight-46)});}catch(_){}}else openManager();});
  $id('bubble').addEventListener('click',e=>{if(e.detail===0&&!ignoreClick)openManager();ignoreClick=false;});
  trigger.addEventListener('click',openQuick);
  $id('quickClose').addEventListener('click',closeQuick);
  $id('quickGroup').addEventListener('change',e=>setContext(e.target.value));
  $id('contextSelect').addEventListener('change',e=>{setContext(e.target.value);$id('managerGroup').value=e.target.value==='global'?'all':e.target.value;renderManager();});
  $id('quickCandidates').addEventListener('click',e=>{const b=e.target.closest('button[data-id]');const item=b&&entries.find(x=>x.id===b.dataset.id);if(item)fill(item);});
  $id('quickManage').addEventListener('click',()=>openManager(''));
  $id('quickMore').addEventListener('click',()=>{$id('managerGroup').value=context==='global'?'all':context;openManager('');});
  $id('undo').addEventListener('click',undoLast);
  $id('managerClose').addEventListener('click',closeManager);
  $id('managerGroup').addEventListener('change',renderManager);
  $id('category').addEventListener('change',renderManager);
  $id('search').addEventListener('input',renderManager);
  $id('add').addEventListener('click',()=>editEntry(null));
  $id('editCancel').addEventListener('click',backToManager);
  $id('edit').addEventListener('submit',e=>{
    e.preventDefault();const title=$id('editName').value.trim(),content=$id('editText').value;if(!title||!content.trim())return;
    const old=entries.find(x=>x.id===editId),now=Date.now(),item={id:old?.id||makeId(),category:$id('editCat').value,title,content,createdAt:old?.createdAt||now,updatedAt:now,favorite:old?.favorite||false};
    try{save(old?entries.map(x=>x.id===old.id?item:x):[...entries,item]);backToManager();status('资料已保存','success');}catch(err){status(err.message,'error');}
  });
  $id('list').addEventListener('click',e=>{
    const b=e.target.closest('button[data-action]');const row=b?.closest('.item');const item=row&&entries.find(x=>x.id===row.dataset.id);if(!item)return;
    if(b.dataset.action==='fill')fill(item);
    if(b.dataset.action==='copy')void copyText(item);
    if(b.dataset.action==='favorite')toggleFavorite(item);
    if(b.dataset.action==='edit')editEntry(item);
    if(b.dataset.action==='delete')deleteEntry(item);
  });
  $id('export').addEventListener('click',exportJson);
  $id('importBtn').addEventListener('click',()=>$id('file').click());
  $id('file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    if(file.size>8*1024*1024){status('JSON 超过 8MB，已拒绝导入','error');return;}
    try{importPreview(file,JSON.parse(await file.text()));}catch(err){status('读取备份失败：'+err.message,'error');}
  });
  $id('importCancel').addEventListener('click',()=>{importPlan=null;backToManager();status('已取消导入，原信息未变');});
  $id('importApply').addEventListener('click',applyImport);
  ui.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(menuOpen)closeQuick();else if(managerOpen)closeManager();e.stopPropagation();});
  renderQuick();if(!healthy)status('原数据读取异常，为保护资料已禁止写入：'+dbError,'error');
})();
