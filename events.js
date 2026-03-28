const KEYS=['UP','DOWN','LEFT','RIGHT','A','B','X','Y','L','R','START','SELECT', 'CPAD_UP', 'CPAD_DOWN', 'CPAD_RIGHT', 'CPAD_LEFT', 'ZR', 'ZL', 'CSTICK_UP', 'CSTICK_DOWN', 'CSTICK_RIGHT', 'CSTICK_LEFT'];
const DIRS=['UP','DOWN','LEFT','RIGHT'];

const urlParams = new URLSearchParams(window.location.search);
const CurScene = decodeURIComponent(urlParams.get('scene'));
  
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
const CAList = document.querySelector("#condActList");
console.log(CMAP.toString());
console.log(AMAP.toString());
