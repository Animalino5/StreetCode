/**
 * pf_project.js
 * PixelFlow Project I/O
 *
 * Uses the File System Access API (Chrome/Edge) to read and write
 * project files directly on disk — no server, no compile step.
 *
 * Folder layout:
 *   MyGame/
 *     project.json           — project manifest (name, platform, scenes, layers)
 *     Level_01.scene.json    — object definitions for Level_01
 *     Level_01.events.json   — events for Level_01
 *     assets/
 *       Player.png
 *       Enemy.png
 *       ...
 *
 * Usage:
 *   <script src="pf_project.js"></script>
 *   const ok = await PFProject.newProject();   // pick folder, init files
 *   const ok = await PFProject.openProject();  // pick folder, load into app
 *   await PFProject.save();                    // save current state to disk
 */

(function(root, factory){
  if(typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PFProject = factory();
}(typeof self !== 'undefined' ? self : this, function(){

  // ─────────────────────────────────────────────
  // File System Access API check
  // ─────────────────────────────────────────────
  function supported(){
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  // ─────────────────────────────────────────────
  // STATE — current open directory handle
  // ─────────────────────────────────────────────
  let _dir      = null;   // FileSystemDirectoryHandle (root)
  let _assetsDir = null;  // FileSystemDirectoryHandle (root/assets/)

  // ─────────────────────────────────────────────
  // LOW-LEVEL FILE HELPERS
  // ─────────────────────────────────────────────

  /** Read a text file from the project folder. Returns null if not found. */
  async function readFile(path){
    try{
      const parts = path.split('/');
      let dir = _dir;
      for(let i=0;i<parts.length-1;i++){
        dir = await dir.getDirectoryHandle(parts[i], {create:false});
      }
      const fh = await dir.getFileHandle(parts[parts.length-1], {create:false});
      const file = await fh.getFile();
      return await file.text();
    }catch(_){ return null; }
  }

  /** Write text to a file in the project folder, creating it if needed. */
  async function writeFile(path, text){
    const parts = path.split('/');
    let dir = _dir;
    for(let i=0;i<parts.length-1;i++){
      dir = await dir.getDirectoryHandle(parts[i], {create:true});
    }
    const fh = await dir.getFileHandle(parts[parts.length-1], {create:true});
    const w  = await fh.createWritable();
    await w.write(text);
    await w.close();
  }

  /** Read a binary file as a Blob. Returns null if not found. */
  async function readBinary(path){
    try{
      const parts = path.split('/');
      let dir = _dir;
      for(let i=0;i<parts.length-1;i++){
        dir = await dir.getDirectoryHandle(parts[i], {create:false});
      }
      const fh = await dir.getFileHandle(parts[parts.length-1], {create:false});
      return await fh.getFile(); // File is a Blob
    }catch(_){ return null; }
  }

  /** Write a binary Blob/File to the project folder. */
  async function writeBinary(path, blob){
    const parts = path.split('/');
    let dir = _dir;
    for(let i=0;i<parts.length-1;i++){
      dir = await dir.getDirectoryHandle(parts[i], {create:true});
    }
    const fh = await dir.getFileHandle(parts[parts.length-1], {create:true});
    const w  = await fh.createWritable();
    await w.write(blob);
    await w.close();
  }

  /** List files in a subdirectory. Returns [] if not found. */
  async function listDir(path){
    try{
      const parts = path ? path.split('/') : [];
      let dir = _dir;
      for(const p of parts) dir = await dir.getDirectoryHandle(p, {create:false});
      const names = [];
      for await(const entry of dir.values()) names.push(entry.name);
      return names;
    }catch(_){ return []; }
  }

  /** Delete a file (best-effort). */
  async function deleteFile(path){
    try{
      const parts = path.split('/');
      let dir = _dir;
      for(let i=0;i<parts.length-1;i++){
        dir = await dir.getDirectoryHandle(parts[i], {create:false});
      }
      await dir.removeEntry(parts[parts.length-1]);
    }catch(_){}
  }

  // ─────────────────────────────────────────────
  // PROJECT MANIFEST SCHEMA
  // ─────────────────────────────────────────────
  function emptyManifest(name, platform){
    return {
      pixelflow: '0.1',
      name:      name || 'My Game',
      platform:  platform || 'psp',
      scenes: [
        {name:'Level_01', hasEvents:true}
      ],
      layers:[
        {id:0,name:'Background',color:'#3a7bd5'},
        {id:1,name:'Terrain',   color:'#27ae60'},
        {id:2,name:'Objects',   color:'#f39c12'},
        {id:3,name:'Player',    color:'#e74c3c'},
        {id:4,name:'UI',        color:'#9b59b6'},
      ],
      created:  Date.now(),
      modified: Date.now(),
    };
  }

  // ─────────────────────────────────────────────
  // SERIALISE / DESERIALISE APP STATE
  //
  // The app state lives in memory (scene editor S object,
  // events localStorage). These functions bridge between that
  // and the file representations.
  // ─────────────────────────────────────────────

  /**
   * Collect the current app state from the scene editor and events editor.
   * Returns a plain object ready for serialisation.
   */
  function collectState(){
    // Scene editor exposes PFProject._getState() which we hook in below.
    if(typeof PFProject._getState === 'function'){
      return PFProject._getState();
    }
    // Fallback: read from localStorage
    const eventsRaw = JSON.parse(localStorage.getItem('pf_events_v1') || '[]');
    return { events: eventsRaw };
  }

  // ─────────────────────────────────────────────
  // ASSET I/O
  // ─────────────────────────────────────────────

  /**
   * Export all sprite images from IndexedDB to assets/ folder.
   * Called during save.
   */
  async function exportAssets(sceneObjs){
    const promises = [];
    for(const obj of sceneObjs){
      if(!obj.hasImage) continue;
      const blob = await _idbGet(obj.id);
      if(!blob) continue;
      // Use sanitised object name as filename
      const safeName = (obj.name||'sprite_'+obj.id).replace(/[^a-zA-Z0-9_\-]/g,'_');
      const ext  = blob.type === 'image/png' ? 'png' : 'png';
      const path = 'assets/' + safeName + '_' + obj.id + '.' + ext;
      promises.push(writeBinary(path, blob).then(() => ({
        objId: obj.id,
        file:  safeName + '_' + obj.id + '.' + ext,
      })));
    }
    return await Promise.all(promises);
  }

  // (importAssets is handled inline during loadProject)

  // ─────────────────────────────────────────────
  // INDEXED DB HELPERS
  // Delegates to the scene editor's idbGet/idbPut which are already
  // open on version 1. We never open our own IDB connection — that
  // would cause a version conflict and break the existing connection.
  // ─────────────────────────────────────────────
  function _idbGet(key){
    // idbGet is defined on the scene editor's page scope
    if(typeof idbGet === 'function') return idbGet(key);
    return Promise.resolve(null);
  }
  function _idbPut(key, blob){
    if(typeof idbPut === 'function') return idbPut(key, blob);
    return Promise.resolve();
  }
  // No separate openIDB — reuse the editor's connection

  // ─────────────────────────────────────────────
  // SAVE PROJECT
  // ─────────────────────────────────────────────

  /**
   * Save the entire project to the open directory.
   * @param {Object} appState — { manifest, scenes: [{name, objs, events}] }
   */
  async function saveProject(appState){
    if(!_dir) throw new Error('No project folder open. Use newProject() or openProject() first.');

    const { manifest, scenes } = appState;

    // 1. Update manifest timestamp
    manifest.modified = Date.now();
    manifest.scenes = scenes.map(s => ({name:s.name, hasEvents:true}));

    // 2. Write project.json
    await writeFile('project.json', JSON.stringify(manifest, null, 2));

    // 3. Write one .scene.json and one .events.json per scene
    for(const scene of scenes){
      const scenePath  = scene.name + '.scene.json';
      const eventsPath = scene.name + '.events.json';

      // Scene: objects without runtime-only fields
      const sceneData = {
        name:    scene.name,
        objects: (scene.objs||[]).map(o => ({
          id:       o.id,
          name:     o.name,
          type:     o.type,
          layerId:  o.layerId,
          x:        o.x,     y:      o.y,
          w:        o.w,     h:      o.h,
          rot:      o.rot||0,
          vis:      o.vis,
          zi:       o.zi||0,
          hasImage: !!o.hasImage,
          assetFile:o.assetFile||null,  // filename in assets/ folder
          fx:       o.fx||false,
          fy:       o.fy||false,
          anim:     o.anim||'',
          txt:      o.txt||'Text',
          fs:       o.fs||16,
          fc:       o.fc||'#000000',
          tag:      o.tag||'',
          oneShot:  o.oneShot||false,
          opacity:  o.opacity!=null ? o.opacity : 1.0,
        })),
      };
      await writeFile(scenePath, JSON.stringify(sceneData, null, 2));

      // Events: filter to this scene
      const sceneEvents = (scene.events||[]).filter(e => e.scene === scene.name);
      await writeFile(eventsPath, JSON.stringify(sceneEvents, null, 2));
    }

    // 4. Export images to assets/
    const allObjs = scenes.flatMap(s => s.objs || []);
    for(const obj of allObjs){
      if(!obj.hasImage) continue;
      const blob = await _idbGet(obj.id);
      if(!blob) continue;
      const safe = (obj.name||'img').replace(/[^a-zA-Z0-9_\-]/g,'_');
      const fname = safe + '_' + obj.id + '.png';
      await writeBinary('assets/' + fname, blob);
      obj.assetFile = fname; // record filename back on the object
    }

    // Re-write scene files now that assetFile is set
    for(const scene of scenes){
      const scenePath = scene.name + '.scene.json';
      const sceneData = JSON.parse(await readFile(scenePath));
      sceneData.objects.forEach((o,i) => {
        if(scene.objs[i]) o.assetFile = scene.objs[i].assetFile || null;
      });
      await writeFile(scenePath, JSON.stringify(sceneData, null, 2));
    }

    return true;
  }

  // ─────────────────────────────────────────────
  // LOAD PROJECT
  // ─────────────────────────────────────────────

  /**
   * Load an open project from disk into app-usable data.
   * @returns {Object} { manifest, scenes: [{name, objs, events}] }
   */
  async function loadProject(){
    if(!_dir) throw new Error('No project folder open.');

    // 1. Read manifest
    const manifestText = await readFile('project.json');
    if(!manifestText) throw new Error('No project.json found in this folder.');
    const manifest = JSON.parse(manifestText);

    // 2. Load assets into IDB
    const assetFiles = (await listDir('assets')).filter(f =>
      /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f)
    );
    const assetNameToId = {}; // fname → objId (resolved when loading scenes)
    // (asset files are imported into IDB during scene loading below)

    // 3. Load each scene
    const scenes = [];
    for(const sceneRef of (manifest.scenes || [])){
      const name = sceneRef.name || sceneRef;

      const sceneText  = await readFile(name + '.scene.json');
      const eventsText = await readFile(name + '.events.json');

      const sceneData  = sceneText  ? JSON.parse(sceneText)  : {objects:[]};
      const eventsData = eventsText ? JSON.parse(eventsText) : [];

      // Restore images from assets/ into IDB keyed by obj.id
      for(const obj of (sceneData.objects||[])){
        if(obj.assetFile){
          const blob = await readBinary('assets/' + obj.assetFile);
          if(blob){
            await _idbPut(obj.id, blob);
            obj.hasImage = true;
          }
        }
      }

      // Ensure all events have the correct scene tag
      eventsData.forEach(e => { e.scene = name; });

      scenes.push({
        name,
        objs:   sceneData.objects || [],
        events: eventsData,
      });
    }

    return { manifest, scenes };
  }

  // ─────────────────────────────────────────────
  // PUBLIC: NEW PROJECT
  // ─────────────────────────────────────────────

  /**
   * Ask the user to pick an empty folder and initialise a new project there.
   * @param {string} projectName
   * @param {string} platform
   * @returns {Object|null} initial app state, or null if cancelled
   */
  async function newProject(projectName, platform){
    if(!supported()) return { error:'File System Access API not supported. Use Chrome or Edge.' };
    try{
      _dir = await window.showDirectoryPicker({ mode:'readwrite', startIn:'documents' });
      _idb = null; // reset IDB handle

      // Check folder is empty-ish (ignore hidden files)
      const existing = [];
      for await(const entry of _dir.values()){
        if(!entry.name.startsWith('.')) existing.push(entry.name);
      }
      if(existing.length > 0){
        const ok = confirm(
          `"${_dir.name}" already has ${existing.length} file(s).\n\n` +
          `Create a new project here anyway? Existing files won't be deleted.`
        );
        if(!ok){ _dir=null; return null; }
      }

      const name = projectName || _dir.name || 'My Game';
      const manifest = emptyManifest(name, platform || 'psp');

      // Create assets/ folder
      await _dir.getDirectoryHandle('assets', {create:true});

      // Write project.json
      await writeFile('project.json', JSON.stringify(manifest, null, 2));

      // Write blank Level_01 scene and events files
      const blankScene  = {name:'Level_01', objects:[]};
      const blankEvents = [];
      await writeFile('Level_01.scene.json',  JSON.stringify(blankScene,  null, 2));
      await writeFile('Level_01.events.json', JSON.stringify(blankEvents, null, 2));

      return {
        manifest,
        scenes:[{name:'Level_01', objs:[], events:[]}],
      };
    }catch(e){
      if(e.name==='AbortError') return null; // user cancelled
      throw e;
    }
  }

  // ─────────────────────────────────────────────
  // PUBLIC: OPEN PROJECT
  // ─────────────────────────────────────────────

  /**
   * Ask the user to pick an existing project folder and load it.
   * @returns {Object|null} loaded app state, or null if cancelled
   */
  async function openProject(){
    if(!supported()) return { error:'File System Access API not supported. Use Chrome or Edge.' };
    try{
      _dir = await window.showDirectoryPicker({ mode:'readwrite', startIn:'documents' });
      _idb = null;
      return await loadProject();
    }catch(e){
      if(e.name==='AbortError') return null;
      throw e;
    }
  }

  // ─────────────────────────────────────────────
  // PUBLIC: SAVE
  // ─────────────────────────────────────────────

  /**
   * Save the current project. appState must be provided by the caller.
   * @param {Object} appState — { manifest, scenes }
   */
  async function save(appState){
    if(!_dir){
      // No folder open — ask user to pick one
      if(!supported()) return { error:'File System Access API not supported.' };
      try{
        _dir = await window.showDirectoryPicker({ mode:'readwrite', startIn:'documents' });
        _idb = null;
      }catch(e){
        if(e.name==='AbortError') return null;
        throw e;
      }
    }
    return await saveProject(appState);
  }

  // ─────────────────────────────────────────────
  // PUBLIC: ADD SCENE
  // ─────────────────────────────────────────────

  /**
   * Add a new scene to an open project folder.
   * Creates Name.scene.json and Name.events.json.
   */
  async function addScene(sceneName){
    if(!_dir) throw new Error('No project open.');
    await writeFile(sceneName + '.scene.json',  JSON.stringify({name:sceneName, objects:[]}, null, 2));
    await writeFile(sceneName + '.events.json', JSON.stringify([], null, 2));
  }

  // ─────────────────────────────────────────────
  // PUBLIC: HELPERS
  // ─────────────────────────────────────────────

  function isOpen(){ return !!_dir; }
  function projectName(){ return _dir?.name || null; }
  function isSupported(){ return supported(); }

  // ─────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────
  return {
    newProject,
    openProject,
    save,
    addScene,
    isOpen,
    projectName,
    isSupported,
    // Returns the open FileSystemDirectoryHandle so other modules (build.html) can write files
    getDir: () => _dir,
    // Exposed so scene editor can hook in its state getter
    _getState: null,
  };

}));
