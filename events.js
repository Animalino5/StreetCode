// ══════════ DEFINITIONS ══════════
const KEYS=['UP','DOWN','LEFT','RIGHT','A','B','X','Y','L','R','START','SELECT', 'CPAD_UP', 'CPAD_DOWN', 'CPAD_RIGHT', 'CPAD_LEFT', 'ZR', 'ZL', 'CSTICK_UP', 'CSTICK_DOWN', 'CSTICK_RIGHT', 'CSTICK_LEFT'];
const DIRS=['UP','DOWN','LEFT','RIGHT'];

const CONDITIONS=[
  {group:'Timing',items:[
    {id:'every_frame', icon:'⟳',name:'Every Frame',     desc:'Runs every game loop tick',               params:[]},
    {id:'every_n_ms', icon:'⏱',name:'Every N Milliseconds', desc:'Recurring timer (ms between fires)',   params:[{k:'ms',label:'Milliseconds',type:'expr',def:'500'}]},
    {id:'scene_start', icon:'🎬',name:'At start of scene', desc:'Runs on first frame of scene',         params:[]},
    {id:'execute_once', icon:'📍',name:'Execute once',     desc:'Runs once, then never again',           params:[]},
  ]},
  {group:'Input',items:[
    {id:'key_held',    icon:'⌨',name:'Key Pressed',      desc:'True while key is held',                 params:[{k:'key',label:'Key',type:'key',def:'RIGHT'}]},
    {id:'key_pressed', icon:'⌨',name:'Key Just Pressed', desc:'True only on first frame of press',      params:[{k:'key',label:'Key',type:'key',def:'A'}]},
    {id:'key_released',icon:'⌨',name:'Key Released',     desc:'True on frame key is released',          params:[{k:'key',label:'Key',type:'key',def:'A'}]},
    {id:'touch_down',  icon:'✋',name:'Touch Down',       desc:'True while touchscreen is held',         params:[]},
    {id:'touch_pressed',icon:'✋',name:'Touch Pressed',   desc:'True on first frame of touch press',     params:[]},
    {id:'touch_released',icon:'✋',name:'Touch Released', desc:'True on frame touch is released',        params:[]},
    {id:'touch_in_rect', icon:'▭',name:'Touch in rectangle', desc:'Touch active inside rect (bottom screen px)', params:[{k:'x',label:'X',type:'expr',def:'0'},{k:'y',label:'Y',type:'expr',def:'0'},{k:'w',label:'W',type:'expr',def:'80'},{k:'h',label:'H',type:'expr',def:'40'}]},
  ]},
  {group:'Objects',items:[
    {id:'obj_overlaps',icon:'⬡',name:'Object Overlaps Trigger',desc:'AABB overlap check',              params:[{k:'obj',label:'Object',type:'obj',def:'Player'},{k:'trigger',label:'Trigger',type:'obj',def:'Zone_1'}]},
    {id:'obj_exists',  icon:'✦',name:'Object Exists',          desc:'True if object is in scene',       params:[{k:'obj',label:'Object',type:'obj',def:'Player'}]},
    {id:'obj_out_of_view', icon:'🔲',name:'Is out of view',   desc:'True if object is off-screen',     params:[{k:'obj',label:'Object',type:'obj',def:'Player'}]},
  ]},
  {group:'Variables',items:[
    {id:'var_eq',      icon:'＝',name:'Variable Equals',      desc:'Compare variable to value',          params:[{k:'var',label:'Variable',type:'text',def:'score'},{k:'val',label:'Value',type:'expr',def:'0'}]},
    {id:'var_gt',      icon:'＞',name:'Variable Greater Than', desc:'Variable exceeds threshold',         params:[{k:'var',label:'Variable',type:'text',def:'health'},{k:'val',label:'Value',type:'expr',def:'0'}]},
  ]},
];

const ACTIONS=[
  {group:'Objects',items:[
    {id:'create_obj',   icon:'✦',name:'Create Object',    desc:'Spawn object at position',  params:[{k:'obj',label:'Object',type:'obj',def:'Enemy'},{k:'x',label:'X',type:'expr',def:'0'},{k:'y',label:'Y',type:'expr',def:'0'}]},
    {id:'delete_obj',   icon:'✕',name:'Delete Object',    desc:'Remove object from scene',  params:[{k:'obj',label:'Object',type:'obj',def:'Enemy'}]},
  ]},
  {group:'Movement',items:[
    {id:'add_force',    icon:'→',name:'Add Force',          desc:'Push in a direction',      params:[{k:'obj',label:'Object',type:'obj',def:'Player'},{k:'dir',label:'Direction',type:'dir',def:'RIGHT'},{k:'mag',label:'Force',type:'expr',def:'200'}]},
    {id:'force_towards',icon:'◎',name:'Add Force Towards',  desc:'Pull toward target',       params:[{k:'obj',label:'Object',type:'obj',def:'Enemy'},{k:'target',label:'Target',type:'obj',def:'Player'},{k:'mag',label:'Force',type:'expr',def:'150'}]},
    {id:'stop_moving',  icon:'■',name:'Stop Moving',        desc:'Zero velocity',            params:[{k:'obj',label:'Object',type:'obj',def:'Player'}]},
    {id:'set_pos',      icon:'⊕',name:'Set Position',       desc:'Teleport to coordinates',  params:[{k:'obj',label:'Object',type:'obj',def:'Player'},{k:'x',label:'X',type:'expr',def:'100'},{k:'y',label:'Y',type:'expr',def:'100'}]},
    {id:'set_obj_property',icon:'◎',name:'Set Object Property', desc:'Opacity, rotation, or scale', params:[{k:'obj',label:'Object',type:'obj',def:'Player'},{k:'prop',label:'Property',type:'choice',options:['opacity','rotation','scale'],def:'opacity'},{k:'val',label:'Value',type:'expr',def:'1'}]},
  ]},
  {group:'Variables',items:[
    {id:'set_var',      icon:'$',name:'Set Variable',      desc:'Assign value to variable', params:[{k:'var',label:'Variable',type:'text',def:'score'},{k:'val',label:'Value',type:'expr',def:'0'}]},
    {id:'add_var',      icon:'+',name:'Add to Variable',   desc:'Increment/decrement',      params:[{k:'var',label:'Variable',type:'text',def:'score'},{k:'val',label:'Amount',type:'expr',def:'1'}]},
  ]},
  {group:'Scene',items:[
    {id:'load_scene',   icon:'▶',name:'Load Scene',         desc:'Transition to scene',      params:[{k:'scene',label:'Scene',type:'scene',def:'Level_02'}]},
  ]},
];

const CMAP={},AMAP={};
CONDITIONS.forEach(g=>g.items.forEach(c=>CMAP[c.id]=c));
ACTIONS.forEach(g=>g.items.forEach(a=>AMAP[a.id]=a));

// ══════════ STATE ══════════
const SK_BY_SCENE='pf_events_by_scene_v1';
let eventsMap={},selId=null,currentScene='',sceneObjs=['Player'],platform='3DS';
function ls(k){try{return JSON.parse(localStorage.getItem(k))||null;}catch{return null;}}
function sv(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
function uid(){return Math.random().toString(36).slice(2,9);}
function loadEventsFromStorage(){
  const byScene=ls(SK_BY_SCENE);
  console.log("raw load: ", byScene);
  if(byScene && typeof byScene==='object' && !Array.isArray(byScene)){
    const map={};
    Object.keys(byScene).forEach(sc=>{
      map[sc]=(byScene[sc]||[]).map(e=>({...e,scene:sc}));
    });
    console.log("mapped load: ", map);
    return map;
  }
}
function allEvents(){
  const out=[];
  Object.keys(eventsMap||{}).forEach(sc=>{
    (eventsMap[sc]||[]).forEach(e=>out.push({...e,scene:sc}));
  });
  return out;
}
function save(){
  sv(SK_BY_SCENE,eventsMap);
  console.log("raw write: ", eventsMap);
}

eventsMap=loadEventsFromStorage();

// ══════════ SCENE ══════════
function sceneEvts(){
  if(!currentScene) return [];
  if(!eventsMap[currentScene]) eventsMap[currentScene]=[];
  return eventsMap[currentScene];
}
function sceneEventById(id){return sceneEvts().find(e=>e.id===id)||null;}
function setScene(name){
  if(!name) return;
  currentScene=name;
  document.getElementById('sb-scene').textContent=name;
  loadSceneObjs(name);
  selId=null;updateToolbar();renderSheet();updateStatus();
  const _stab_cpp = document.getElementById('stab-cpp');
  if(_stab_cpp && _stab_cpp.classList.contains('on')) renderCpp();
}

// ══════════ CRUD ══════════
function addEvent(){
  const e={id:uid(),scene:currentScene,disabled:false,conditions:[],actions:[]};
  sceneEvts().push(e);save();selId=e.id;updateToolbar();renderSheet();updateStatus();
  postShell('pf-set',{key:'eventCount',value:sceneEvts().length});
}
function deleteSelected(){
  if(!selId)return;
  eventsMap[currentScene]=sceneEvts().filter(e=>e.id!==selId);
  selId=null;updateToolbar();save();renderSheet();updateStatus();
}
function duplicateSelected(){
  if(!selId)return;const src=sceneEventById(selId);if(!src)return;
  const copy=JSON.parse(JSON.stringify(src));copy.id=uid();
  const list=sceneEvts();
  list.splice(list.indexOf(src)+1,0,copy);
  selId=copy.id;save();renderSheet();
}
function toggleSelected(){
  if(!selId)return;const e=sceneEventById(selId);if(!e)return;
  e.disabled=!e.disabled;save();renderSheet();
}
function moveSelected(dir){
  if(!selId)return;const list=sceneEvts();const i=list.findIndex(e=>e.id===selId);
  const j=i+dir;if(j<0||j>=list.length)return;
  [list[i],list[j]]=[list[j],list[i]];save();renderSheet();
}
function selectEvt(id){selId=id;updateToolbar();renderSheet();}
function toggleReverse(evtId){
  const e=sceneEventById(evtId);
  if(!e) return;
  e.reversed=!e.reversed;
  selId=evtId;
  save();
  updateToolbar();
  renderSheet();
  cppIfOpen();
}
function updateToolbar(){
  const on=!!selId;
  ['tb-del','tb-dup','tb-tog','tb-up','tb-dn'].forEach(id=>{
    const el=document.getElementById(id);
    el.style.opacity=on?'1':'.4';el.style.pointerEvents=on?'':'none';
  });
}

// ══════════ CHIPS ══════════
function addCond(evtId,condId){
  const e=sceneEventById(evtId);const def=CMAP[condId];if(!e||!def)return;
  const p={};def.params.forEach(x=>p[x.k]=x.def);
  e.conditions.push({id:condId,params:p});save();renderSheet();cppIfOpen();
}
function addAct(evtId,actId){
  const e=sceneEventById(evtId);const def=AMAP[actId];if(!e||!def)return;
  const p={};def.params.forEach(x=>p[x.k]=x.def);
  e.actions.push({id:actId,params:p});save();renderSheet();cppIfOpen();
}
function removeChip(evtId,side,idx){
  const e=sceneEventById(evtId);if(!e)return;
  if(side==='c')e.conditions.splice(idx,1);else e.actions.splice(idx,1);
  save();renderSheet();cppIfOpen();
}
function cppIfOpen(){ const el=document.getElementById('stab-cpp'); if(el && el.classList.contains('on')) renderCpp(); }

// ══════════ PARAM MODAL ══════════
let _pe=null,_ps=null,_pi=null;
function openPM(evtId,side,idx){
  const e=sceneEventById(evtId);if(!e)return;
  const chip=side==='c'?e.conditions[idx]:e.actions[idx];if(!chip)return;
  const def=side==='c'?CMAP[chip.id]:AMAP[chip.id];if(!def||!def.params.length)return;
  _pe=evtId;_ps=side;_pi=idx;
  document.getElementById('pm-title').textContent=def.name;
  const body=document.getElementById('pm-body');
  body.innerHTML=def.params.map(p=>{
    const val=chip.params[p.k]??p.def;
    let inp;
    if(p.type==='key')
      inp=`<select class="pm-sel" data-k="${p.k}">${KEYS.map(k=>`<option ${k===val?'selected':''}>${k}</option>`).join('')}</select>`;
    else if(p.type==='dir')
      inp=`<select class="pm-sel" data-k="${p.k}">${DIRS.map(d=>`<option ${d===val?'selected':''}>${d}</option>`).join('')}</select>`;
    else if(p.type==='obj'){
      const opts=[...new Set([...sceneObjs,val])];
      inp=`<select class="pm-sel" data-k="${p.k}">${opts.map(o=>`<option ${o===val?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
    } else if(p.type==='scene'){
      const scenes=getSceneList();
      inp=`<select class="pm-sel" data-k="${p.k}">${[...new Set([...scenes,val])].map(s=>`<option ${s===val?'selected':''}>${esc(s)}</option>`).join('')}</select>`;
    } else if(p.type==='choice' && p.options){
      inp=`<select class="pm-sel" data-k="${p.k}">${p.options.map(o=>`<option value="${esc(o)}" ${o===val?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
    } else if(p.type==='expr'){
      inp=`<input class="pm-in pm-expr" type="text" value="${esc(String(val))}" data-k="${p.k}" placeholder="${esc(p.def)}" title="Accepts a number or C++ expression, e.g: pf_get_var(state,&quot;score&quot;)+1">`;
    } else
      inp=`<input class="pm-in" type="text" value="${esc(String(val))}" data-k="${p.k}" placeholder="${esc(p.def)}">`;
    return `<div class="pm-field"><div class="pm-lbl">${esc(p.label)}</div>${inp}</div>`;
  }).join('');
  document.getElementById('param-ov').classList.add('open');
  body.querySelector('input,select')?.focus();
}
function confirmPM(){
  const e=sceneEventById(_pe);if(!e)return;
  const chip=_ps==='c'?e.conditions[_pi]:e.actions[_pi];if(!chip)return;
  document.querySelectorAll('#pm-body [data-k]').forEach(el=>chip.params[el.dataset.k]=el.value);
  save();closePM();renderSheet();cppIfOpen();
}
function closePM(){document.getElementById('param-ov').classList.remove('open');}

// ══════════ RENDER SHEET ══════════
function renderSheet(){
  const el=document.getElementById('sheet');
  const list=sceneEvts();
  document.getElementById('sb-count').textContent='Events: '+list.length;
  if(!list.length){
    el.innerHTML=`<div class="empty"><div class="empty-icon">⚡</div>
      <div class="empty-title">No Events Yet</div>
      <div class="empty-desc">Events wire objects to gameplay.<br>Click <strong>+ Add Event</strong> or Ctrl+N.</div></div>`;
    return;
  }
  el.innerHTML=list.map((ev,i)=>`
    <div class="ev-row ${ev.id===selId?'sel':''} ${ev.disabled?'disabled':''} ${ev.reversed?'rev':''}" onclick="selectEvt('${ev.id}')"
      oncontextmenu="event.preventDefault();toggleReverse('${ev.id}');">
      <div class="ev-num">${i+1}</div>
      <div class="ev-cond" onclick="event.stopPropagation()">
        ${ev.conditions.map((c,ci)=>chip(ev.id,'c',c,ci)).join('')}
        <div class="add-chip cond" onclick="quickAdd('${ev.id}','c')">+ condition</div>
      </div>
      <div class="ev-act" onclick="event.stopPropagation()">
        ${ev.actions.map((a,ai)=>chip(ev.id,'a',a,ai)).join('')}
        <div class="add-chip act" onclick="quickAdd('${ev.id}','a')">+ action</div>
      </div>
    </div>`).join('');
}

function chip(evtId,side,c,idx){
  const def=side==='c'?CMAP[c.id]:AMAP[c.id];if(!def)return'';
  const cls=side==='c'?'cond':'act';
  const pText=def.params.map(p=>c.params[p.k]??p.def).join(', ');
  const hasP=def.params.length>0;
  return `<div class="chip ${cls}" onclick="${hasP?`openPM('${evtId}','${side}',${idx})`:'void 0'}">
    <span class="chip-icon">${def.icon}</span>
    <span class="chip-name">${esc(def.name)}</span>
    ${pText?`<span class="chip-params">(${esc(pText)})</span>`:''}
    <span class="chip-del" onclick="event.stopPropagation();removeChip('${evtId}','${side}',${idx})">✕</span>
  </div>`;
}

// ══════════ SIDEBAR ══════════
let _quickTarget=null;
function quickAdd(evtId,side){_quickTarget={evtId,side};setSideTab('add');}

function setSideTab(tab){
  document.getElementById('stab-add').classList.toggle('on',tab==='add');
  const _stab_cpp_el = document.getElementById('stab-cpp');
  if(_stab_cpp_el) _stab_cpp_el.classList.toggle('on', tab==='cpp');
  if(tab==='add')renderAddPanel();else renderCpp();
}

function renderAddPanel(){
  const body=document.getElementById('sb-body');
  const isC=_quickTarget?.side==='c',isA=_quickTarget?.side==='a';
  let html='';
  if(_quickTarget)
    html+=`<div style="padding:5px 10px;font-size:10px;background:rgba(0,122,204,.15);border-bottom:1px solid var(--border);color:#7db8e8">
      Adding ${isC?'condition':'action'} — click to pick
      <span style="float:right;cursor:pointer;color:var(--text2)" onclick="_quickTarget=null;renderAddPanel()">✕</span></div>`;
  if(!isA)
    html+=CONDITIONS.map(g=>`<div class="pick-group-head">⬡ ${g.group}</div>`+
      g.items.map(c=>`<div class="pick-item cond" onclick="pickItem('${c.id}','c')">
        <div class="pi-icon">${c.icon}</div>
        <div><div class="pi-name">${esc(c.name)}</div><div class="pi-desc">${esc(c.desc)}</div></div></div>`).join('')).join('');
  if(!isC)
    html+=ACTIONS.map(g=>`<div class="pick-group-head">▶ ${g.group}</div>`+
      g.items.map(a=>`<div class="pick-item act" onclick="pickItem('${a.id}','a')">
        <div class="pi-icon">${a.icon}</div>
        <div><div class="pi-name">${esc(a.name)}</div><div class="pi-desc">${esc(a.desc)}</div></div></div>`).join('')).join('');
  body.innerHTML=html;
}

function pickItem(defId,side){
  if(_quickTarget){
    if(side==='c')addCond(_quickTarget.evtId,defId);
    else addAct(_quickTarget.evtId,defId);
    _quickTarget=null;renderAddPanel();
  } else {
    addEvent();
    const cur=sceneEvts();
    const ev=cur[cur.length-1];
    if(side==='c')addCond(ev.id,defId);else addAct(ev.id,defId);
  }
}

// ══════════ C++ GENERATION ══════════
function renderCpp(){
  const body=document.getElementById('sb-body');
  const code=genCpp();
  const sn=currentScene.replace(/[^a-z0-9_]/gi,'_');
  body.innerHTML=`<div class="cpp-bar"><span>events_${esc(sn)}.cpp</span>
    <button class="cpp-copy" onclick="copyCpp()">Copy</button></div>
    <div class="cpp-wrap"><div class="cpp-code" id="cpp-out">${code}</div></div>`;
}

function hl(s){return s
  .replace(/\b(if|void|return|true|false|while|for|else|nullptr)\b/g,'<span class="kw">$1</span>')
  .replace(/\b(PF_State|PF_Object|bool|float|int|uint32_t)\b/g,'<span class="ty">$1</span>')
  .replace(/(pf_[a-z_]+)\(/g,'<span class="fn">$1</span>(')
  .replace(/#\w+/g,'<span class="kw">$&</span>')
  .replace(/(\/\/[^\n]*)/g,'<span class="cm">$1</span>')
  .replace(/"([^"]*)"/g,'<span class="str">"$1"</span>')
  .replace(/\b(DIR_\w+|KEY_\w+)\b/g,'<span class="kw">$1</span>');
}

function genCpp(){
  const list=sceneEvts();
  const sn=currentScene.replace(/[^a-z0-9_]/gi,'_');
  const lines=[
    `// PixelFlow — Generated Events`,
    `// Scene: ${currentScene}  Platform: ${platform}`,
    `// DO NOT EDIT — regenerate from PixelFlow`,
    ``,
    `#include "pixelflow_runtime.h"`,
    ``,
    `void pf_events_${sn}(PF_State* state) {`,
    ``,
  ];
  if(!list.length) lines.push(`    // No events`);
  list.forEach((ev,i)=>{
    if(ev.disabled){lines.push(`    // [DISABLED] Event ${i+1}`,'');return;}
    lines.push(`    // Event ${i+1}`);
    const conds=ev.conditions
      .filter(c=>c.id!=='every_frame')
      .map((c,ci)=>condLine(c, i, ci)).filter(Boolean);
    const combined = conds.join(' && ');
    const rev = !!ev.reversed;
    if(conds.length===0){
      if(rev){
        lines.push(`    // [REVERSED] No conditions => always true, reversed never runs`,'');
        return;
      }
      lines.push(`    {`);
    } else {
      const test = rev ? `!(${combined})` : combined;
      lines.push(`    if (${test}) {`);
    }
    ev.actions.forEach(a=>{const l=actLine(a);if(l)lines.push(`        ${l}`);});
    lines.push(`    }`,'');
  });
  lines.push(`} // pf_events_${sn}`);
  return hl(lines.map(l=>esc(l)).join('\n'));
}

function p(chip,k){return chip.params[k]??'';}
function flit(v){
  const s=String(v).trim();
  if(!s) return '0.0f';
  const expr=exprToCpp(s);
  const noSuffix=expr.replace(/f$/i,'');
  const n=parseFloat(noSuffix);
  if(!isNaN(n)&&String(n)===noSuffix.trim())
    return(Number.isInteger(n)?n.toFixed(1):noSuffix)+'f';
  return '(float)('+expr+')';
}
function exprToCpp(s){
  let out=String(s||'').trim();
  if(!out) return '0';
  out=out.replace(/\btouch\.(x|y)\b/g,(_,axis)=>axis==='x'?'pf_touch_x(state)':'pf_touch_y(state)');
  out=out.replace(/\bobject\.([A-Za-z_][A-Za-z0-9_]*)\b/g,(_,obj)=>`(pf_obj_exists(state,"${obj}")?1.0f:0.0f)`);
  out=out.replace(/\btext\.content\b/g,'pf_get_var(state,"text.content")');
  // Allow editor-style object field expressions like: Player.posX + 10
  out=out.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.(posX|posY|x|y|w|h|width|height)\b/g,(_,obj,prop)=>{
    const map={
      posX:'pos.x', x:'pos.x',
      posY:'pos.y', y:'pos.y',
      w:'size.x', width:'size.x',
      h:'size.y', height:'size.y',
    };
    return `(pf_get_obj(state,"${obj}")?pf_get_obj(state,"${obj}")->${map[prop]}:0.0f)`;
  });
  return out;
}

function condLine(c, evIdx, ci){
  switch(c.id){
    case 'scene_start':
    case 'frame_start':   return `state->frame == 0`;
    case 'execute_once':  return `pf_timer_once(state, ${evIdx}, ${ci})`;
    case 'every_n_ms':    return `pf_timer_every(state, (float)(${flit(p(c,'ms')).replace(/f$/,'')}) / 1000.0f)`;
    case 'every_n_sec':   return `pf_timer_every(state, ${flit(p(c,'seconds'))})`; /* legacy */
    case 'key_held':      return `pf_key_held(state, PF_KEY_${p(c,'key')})`;
    case 'key_pressed':   return `pf_key_pressed(state, PF_KEY_${p(c,'key')})`;
    case 'key_released':  return `pf_key_released(state, PF_KEY_${p(c,'key')})`;
    case 'touch_down':    return `pf_touch_down(state)`;
    case 'touch_pressed': return `pf_touch_pressed(state)`;
    case 'touch_released':return `pf_touch_released(state)`;
    case 'touch_in_rect': return `pf_touch_in_rect(state, ${flit(p(c,'x'))}, ${flit(p(c,'y'))}, ${flit(p(c,'w'))}, ${flit(p(c,'h'))})`;
    case 'obj_overlaps':  return `pf_overlaps(state, "${p(c,'obj')}", "${p(c,'trigger')}")`;
    case 'obj_exists':    return `pf_obj_exists(state, "${p(c,'obj')}")`;
    case 'obj_out_of_view': {
      const name = p(c,'obj');
      return `(pf_get_obj(state, "${name}") && (pf_get_obj(state, "${name}")->pos.x + pf_get_obj(state, "${name}")->size.x < 0 || pf_get_obj(state, "${name}")->pos.x > state->screen_w || pf_get_obj(state, "${name}")->pos.y + pf_get_obj(state, "${name}")->size.y < 0 || pf_get_obj(state, "${name}")->pos.y > state->screen_h))`;
    }
    case 'var_eq':        return `pf_get_var(state, "${p(c,'var')}") == ${flit(p(c,'val'))}`;
    case 'var_gt':        return `pf_get_var(state, "${p(c,'var')}") > ${flit(p(c,'val'))}`;
    default: return `/* unknown cond: ${c.id} */`;
  }
}

function actLine(a){
  switch(a.id){
    case 'create_obj':    return `pf_spawn_from_template(state, "${p(a,'obj')}", ${flit(p(a,'x'))}, ${flit(p(a,'y'))});`;
    case 'delete_obj':    return `pf_delete_obj(state, "${p(a,'obj')}");`;
    case 'add_force':     return `pf_add_force(state, "${p(a,'obj')}", DIR_${p(a,'dir')}, ${flit(p(a,'mag'))});`;
    case 'force_towards': return `pf_force_towards(state, "${p(a,'obj')}", "${p(a,'target')}", ${flit(p(a,'mag'))});`;
    case 'stop_moving':   return `pf_stop_moving(state, "${p(a,'obj')}");`;
    case 'set_pos':       return `pf_set_pos(state, "${p(a,'obj')}", ${flit(p(a,'x'))}, ${flit(p(a,'y'))});`;
    case 'set_var':       return `pf_set_var(state, "${p(a,'var')}", ${flit(p(a,'val'))});`;
    case 'add_var':       return `pf_add_var(state, "${p(a,'var')}", ${flit(p(a,'val'))});`;
    case 'load_scene':    return `pf_load_scene(state, "${p(a,'scene')}");`;
    case 'set_obj_property': return `pf_set_obj_property(state, "${p(a,'obj')}", "${p(a,'prop')}", ${flit(p(a,'val'))});`;
    default: return `/* unknown action: ${a.id} */`;
  }
}

function copyCpp(){
  const el=document.getElementById('cpp-out');if(!el)return;
  navigator.clipboard.writeText(el.innerText).then(()=>flashStatus('Copied!')).catch(()=>{});
}

// ══════════ SCENE OBJECTS ══════════
function loadSceneObjs(sceneName){
  // Read from localStorage — scene editor writes here on every object change
  try{
    const d=JSON.parse(localStorage.getItem('pf_scene_objects_'+sceneName)||'[]');
    // Always update, even if empty — an empty scene is valid
    sceneObjs=[...new Set(d.map(o=>o.name).filter(Boolean))];
  }catch{}
}
function getSceneList(){
  return Array.from(document.getElementById('scene-sel').options).map(o=>o.value);
}
function populateSceneSel(scenes){
  const sel=document.getElementById('scene-sel');
  const cur=sel.value||currentScene;
  // Only game scenes (not events placeholders)
  const game=scenes.filter(s=>{
    if(typeof s==='string') return !s.endsWith('(Events)');
    return !s.isEvents;
  }).map(s=>typeof s==='string'?s:s.name);

  if(!game.length) return;
  sel.innerHTML=game.map(s=>`<option value="${esc(s)}" ${s===cur?'selected':''}>${esc(s)}</option>`).join('');
  
  // If currentScene is not set, set it to the first available game scene
  if(!currentScene && game.length > 0){
    setScene(game[0]);
  } else if(!game.includes(currentScene)){
    setScene(game[0]);
  } else {
    // Make sure selector shows current
    sel.value=currentScene;
    document.getElementById('sb-scene').textContent=currentScene;
    loadSceneObjs(currentScene);
    renderSheet();
    updateStatus();
  }
}

// Try to load scene list from localStorage on startup (populated by scene editor)
function initFromStorage(){
  try{
    const stored=JSON.parse(localStorage.getItem('pf_scene_list')||'[]');
    if(Array.isArray(stored) && stored.length){ populateSceneSel(stored); loadSceneObjs(currentScene); return; }
  }catch{}

  // No stored scene list — request it from parent (robust for hosts that rewrite routes)
  try{ loadSceneObjs(currentScene); }catch(_){ }
  if(window.parent && window.parent!==window){
    try{ window.parent.postMessage({type:'pf-need-scene-list'}, '*'); }catch(_){ }
  }
}

window.addEventListener('storage',e=>{
  if(e.key==='pf_scene_objects_'+currentScene){
    loadSceneObjs(currentScene);
    renderSheet(); // refresh param dropdowns
  }
  if(e.key==='pf_scene_list'){
    try{const s=JSON.parse(e.newValue||'[]');if(s.length)populateSceneSel(s);}catch{}
  }
});

// ══════════ SHELL BRIDGE ══════════
function postShell(type,payload){if(window.parent!==window)window.parent.postMessage({type,...payload},'*');}
window.addEventListener('message',e=>{
  if(!e.data||typeof e.data!=='object')return;
  const {type}=e.data;
  console.debug('[events] message received:', type, e.data);
  if(type==='pf-init'&&e.data.project){
    platform=e.data.project.platform||'PSP';
    document.getElementById('sb-plat').textContent=platform.split(' ').pop();
    if(e.data.scenes) populateSceneSel(e.data.scenes);
  }
  if(type==='pf-scene-objects'){
    const {scene,objects}=e.data;
    // Always write to localStorage for param dropdowns
    try{localStorage.setItem('pf_scene_objects_'+scene,JSON.stringify(objects||[]));}catch{}
    // Update live object list if this matches our current scene
    if(scene===currentScene){
      sceneObjs=[...new Set((objects||[]).map(o=>o.name).filter(Boolean))];
      renderSheet(); // refresh param dropdowns with new object names
    }
  }
  if(type==='pf-scene-list'){
    const scenes=e.data.scenes||[];
    try{localStorage.setItem('pf_scene_list',JSON.stringify(scenes));}catch{}
    populateSceneSel(scenes);
  }
  // Scene editor tells us which game scene to show events for
  if(type==='pf-set-scene'&&e.data.scene){
    console.debug('[events] pf-set-scene ->', e.data.scene);
    const name=e.data.scene;
    // Update scene selector to this scene if it exists, or add it
    const sel=document.getElementById('scene-sel');
    const exists=[...sel.options].some(o=>o.value===name);
    if(!exists){
      const opt=document.createElement('option');
      opt.value=name; opt.textContent=name;
      sel.appendChild(opt);
    }
    sel.value=name;
    setScene(name);
  }
});
if(window.parent!==window) document.body.classList.add('embedded');
try{
  if(window.parent!==window) window.parent.postMessage({type:'pf-events-ready'}, '*');
}catch(_){}

// Pick up scene from URL hash (fallback when iframe src includes #sceneName)
(function(){
  const hash=decodeURIComponent(location.hash.slice(1));
  if(hash) setScene(hash);
})();

// ══════════ KEYBOARD ══════════
document.addEventListener('keydown',e=>{
  if(document.getElementById('param-ov').classList.contains('open')){
    if(e.key==='Escape') closePM();
    if(e.key==='Enter'){e.preventDefault();confirmPM();}
    return;
  }
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT') return;
  if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();addEvent();}
  if(e.key==='Delete'||e.key==='Backspace') deleteSelected();
  if((e.ctrlKey||e.metaKey)&&e.key==='d'){e.preventDefault();duplicateSelected();}
  if(e.key==='ArrowUp') moveSelected(-1);
  if(e.key==='ArrowDown') moveSelected(1);
  if(e.key==='Escape'){selId=null;updateToolbar();renderSheet();}
});

// ══════════ UTILS ══════════
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function updateStatus(){
  document.getElementById('sb-count').textContent='Events: '+sceneEvts().length;
  postShell('pf-set',{key:'eventCount',value:sceneEvts().length});
}
let _ft;
function flashStatus(msg){const el=document.getElementById('sb-count');const p=el.textContent;el.textContent=msg;clearTimeout(_ft);_ft=setTimeout(()=>el.textContent=p,1500);}

// ══════════ INIT ══════════
initFromStorage();
setScene(currentScene);
renderSheet();
renderAddPanel();
updateStatus();
