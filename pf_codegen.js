/**
 * pf_codegen.js
 * PixelFlow Code Generator — standalone module
 *
 * Takes the events array from localStorage (pf_events_v1) and
 * produces a complete, compilable C++ file using the
 * pixelflow_runtime.h API.
 *
 * Usage (Node.js):
 *   const gen = require('./pf_codegen.js');
 *   const cpp = gen.generateAll('Level_01', 'PSP');
 *   require('fs').writeFileSync('generated/events_Level_01.cpp', cpp);
 *
 * Usage (browser):
 *   <script src="pf_codegen.js"></script>
 *   const cpp = PFCodegen.generateAll('Level_01', 'PSP');
 */

(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();          // Node / Tauri sidecar
  } else {
    root.PFCodegen = factory();          // browser / iframe
  }
}(typeof self !== 'undefined' ? self : this, function() {

  // ─────────────────────────────────────────────────────────────
  // CONDITION CODEGEN
  // Each returns a plain C string (no HTML).
  // p(chip, key) → chip.params[key] with fallback to empty string.
  // ─────────────────────────────────────────────────────────────
  function p(chip, k) { return (chip.params && chip.params[k] != null) ? chip.params[k] : ''; }
  function exprToCpp(s) {
    let out = String(s || '').trim();
    if (!out) return '0';
    out = out.replace(/\btouch\.(x|y)\b/g, (_, axis) => axis === 'x' ? 'pf_touch_x(state)' : 'pf_touch_y(state)');
    out = out.replace(/\bobject\.([A-Za-z_][A-Za-z0-9_]*)\b/g, (_, obj) => `(pf_obj_exists(state,"${obj}")?1.0f:0.0f)`);
    out = out.replace(/\btext\.content\b/g, 'pf_get_var(state,"text.content")');
    // Allow editor-style object field expressions like: Player.posX + 10
    out = out.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.(posX|posY|x|y|w|h|width|height)\b/g, (_, obj, prop) => {
      const map = {
        posX: 'pos.x', x: 'pos.x',
        posY: 'pos.y', y: 'pos.y',
        w: 'size.x', width: 'size.x',
        h: 'size.y', height: 'size.y',
      };
      return `(pf_get_obj(state,"${obj}")?pf_get_obj(state,"${obj}")->${map[prop]}:0.0f)`;
    });
    return out;
  }
  // Ensure proper C float literal: "1" → "1.0f", "1.5" → "1.5f", already "1.0f" → "1.0f"
  function flit(v) {
    const raw = String(v).trim();
    if (!raw || raw === 'null') return '0.0f';
    const s = exprToCpp(raw);
    // Strip trailing f/F only for pure numeric check
    const noSuffix = s.replace(/f$/i, '');
    const n = parseFloat(noSuffix);
    // Pure number — add .0f suffix
    if (!isNaN(n) && String(n) === noSuffix.trim())
      return (Number.isInteger(n) ? n.toFixed(1) : noSuffix) + 'f';
    // Expression (contains operators, dots, function calls) — pass through as float cast
    return '(float)(' + s + ')';
  }

  function condCpp(c, evIdx, ci) {
    switch (c.id) {
      case 'every_frame':   return null;
      case 'scene_start':
      case 'frame_start':   return `state->frame == 0`;
      case 'execute_once':  return `pf_timer_once(state, ${evIdx}, ${ci})`;
      case 'every_n_ms':    return `pf_timer_every(state, (float)(${String(flit(p(c, 'ms'))).replace(/f$/, '')}) / 1000.0f)`;
      case 'every_n_sec':   return `pf_timer_every(state, ${flit(p(c,'seconds'))})`;
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
      default:              return `/* unknown condition: ${c.id} */ true`;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ACTION CODEGEN
  // ─────────────────────────────────────────────────────────────
  function actCpp(a) {
    switch (a.id) {
      case 'create_obj':    return `pf_spawn_from_template(state, "${p(a,'obj')}", ${flit(p(a,'x'))}, ${flit(p(a,'y'))});`;
      case 'delete_obj':    return `pf_delete_obj(state, "${p(a,'obj')}");`;
      case 'add_force':     return `pf_add_force(state, "${p(a,'obj')}", DIR_${p(a,'dir')}, ${flit(p(a,'mag'))});`;
      case 'force_towards': return `pf_force_towards(state, "${p(a,'obj')}", "${p(a,'target')}", ${flit(p(a,'mag'))});`;
      case 'stop_moving':   return `pf_stop_moving(state, "${p(a,'obj')}");`;
      case 'set_pos':       return `pf_set_pos(state, "${p(a,'obj')}", ${flit(p(a,'x'))}, ${flit(p(a,'y'))});`;
      case 'set_var':       return `pf_set_var(state, "${p(a,'var')}", ${flit(p(a,'val'))});`;
      case 'add_var':       return `pf_add_var(state, "${p(a,'var')}", ${flit(p(a,'val'))});`;
      case 'load_scene':    return `pf_load_scene(state, "${p(a,'scene')}");`;
      case 'set_obj_property':
        return `pf_set_obj_property(state, "${p(a,'obj')}", "${p(a,'prop')}", ${flit(p(a,'val'))});`;
      default:              return `/* unknown action: ${a.id} */`;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // GENERATE ONE SCENE FILE
  // ─────────────────────────────────────────────────────────────
  function generateScene(events, sceneName, platform) {
    const sn    = sceneName.replace(/[^a-zA-Z0-9_]/g, '_');
    const plat  = 'Nintendo 3DS';
    const list  = events.filter(e => e.scene === sceneName && !e.disabled);
    const all   = events.filter(e => e.scene === sceneName);
    const lines = [];

    lines.push(`/**`);
    lines.push(` * events_${sn}.cpp`);
    lines.push(` * PixelFlow Generated — Scene: ${sceneName}`);
    lines.push(` * Platform: ${platform || 'PSP'}`);
    lines.push(` *`);
    lines.push(` * DO NOT EDIT — regenerate from the PixelFlow Events editor.`);
    lines.push(` * Compile alongside pixelflow_runtime.cpp`);
    lines.push(` */`);
    lines.push(``);
    lines.push(`#include "pixelflow_runtime.h"`);
    lines.push(``);
    lines.push(`void pf_events_${sn}(PF_State* state) {`);
    lines.push(``);

    if (all.length === 0) {
      lines.push(`    // No events defined for ${sceneName}`);
    }

    all.forEach((ev, i) => {
      if (ev.disabled) {
        lines.push(`    // [DISABLED] Event ${i + 1}`);
        lines.push(``);
        return;
      }

      lines.push(`    // ── Event ${i + 1} ─────────────────────────────────────`);

      // Build condition expressions, filtering out every_frame (always-true)
      const conds = ev.conditions
        .map((c, ci) => condCpp(c, i, ci))
        .filter(Boolean);

      const isAlways = conds.length === 0;
      const rev = !!ev.reversed;
      if (isAlways) {
        if (rev) {
          lines.push(`    // [REVERSED] No conditions => always true, reversed never runs`);
          lines.push('');
          return;
        }
        lines.push(`    {`);
      } else {
        const combined = conds.join(' && ');
        const test = rev ? `!(${combined})` : combined;
        lines.push(`    if (${test}) {`);
      }

      if (ev.actions.length === 0) {
        lines.push(`        // (no actions)`);
      }
      ev.actions.forEach(a => {
        const line = actCpp(a);
        if (line) lines.push(`        ${line}`);
      });

      lines.push(`    }`);
      lines.push(``);
    });

    lines.push(`} // pf_events_${sn}`);
    lines.push(``);

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────────────────────
  // GENERATE RUNTIME HEADER (pixelflow_runtime.h)
  // The full version lives in the repo; this is a self-contained
  // reference copy that ships with every exported project.
  // ─────────────────────────────────────────────────────────────
  function generateRuntimeHeader(platform) {
    return `/**
 * pixelflow_runtime.h
 * PixelFlow Runtime API
 * Platform: Nintendo 3DS
 *
 * All game logic (generated events) calls these functions.
 * Implemented in pixelflow_runtime.cpp
 */

#pragma once
#include <stdint.h>
#include <stdbool.h>
#include <citro2d.h>

#ifdef __cplusplus
extern "C" {
#endif

// ── Types ────────────────────────────────────────────

typedef struct { float x, y; } PF_Vec2;
typedef struct { float x, y, w, h; } PF_Rect;

typedef enum {
    DIR_UP = 0, DIR_DOWN, DIR_LEFT, DIR_RIGHT
} PF_Direction;

// Keys — mapped to 3DS buttons in pixelflow_runtime.cpp
// Prefixed PF_KEY_ to avoid colliding with libctru's KEY_A/KEY_B/etc macros
typedef enum {
    PF_KEY_UP, PF_KEY_DOWN, PF_KEY_LEFT, PF_KEY_RIGHT,
    PF_KEY_A, PF_KEY_B, PF_KEY_X, PF_KEY_Y,
    PF_KEY_L, PF_KEY_R,
    PF_KEY_START, PF_KEY_SELECT,
    PF_KEY_CROSS, PF_KEY_CIRCLE, PF_KEY_SQUARE, PF_KEY_TRIANGLE,
    PF_KEY_COUNT
} PF_Key;

typedef struct PF_Object {
    char        name[64];
    PF_Vec2     pos;
    PF_Vec2     vel;       /* pixels per second */
    PF_Vec2     size;
    float       base_w, base_h; /* original w/h for scale=1 */
    float       rotation;  /* degrees */
    char        anim[32];  /* current animation name */
    bool        active;
    bool        visible;
    float       opacity;   /* 0.0 = transparent, 1.0 = opaque; applied during rendering */
    uint32_t    _id;       /* internal unique id */
    bool        on_bottom;    /* true = render on bottom screen (BS_ layer) */
    bool        is_trigger;   /* true = invisible collision zone */
    bool        is_text;      /* true = render as text label */
    char        _textbuf[128]; /* text content */
    float       text_size;    /* editor font size in px */
    uint8_t     text_r, text_g, text_b; /* text color */
    C2D_Image   tex;          /* sprite texture loaded from romfs */
    bool        has_tex;      /* true when tex is valid */
    struct PF_Object* _next;
} PF_Object;

#define PF_VAR_COUNT 64
typedef struct { char key[32]; float value; bool used; } PF_Var;

#define PF_TIMER_COUNT 32
typedef struct { float interval; float elapsed; bool fired; } PF_Timer;

typedef struct {
    float        delta;          /* seconds since last frame */
    float        elapsed;        /* total seconds since scene start */
    uint32_t     frame;
    uint32_t     keys_held;      /* bitmask */
    uint32_t     keys_pressed;   /* just-pressed this frame */
    uint32_t     keys_released;  /* just-released this frame */
    bool         touch_down;
    bool         touch_pressed;
    bool         touch_released;
    float        touch_x;
    float        touch_y;
    PF_Object*   objects;
    uint32_t     object_count;
    PF_Var       vars[PF_VAR_COUNT];
    PF_Timer     timers[PF_TIMER_COUNT];
    const char*  current_scene;
    const char*  next_scene;     /* non-null triggers load at frame end */
    uint16_t     screen_w;
    uint16_t     screen_h;
    bool         running;
} PF_State;

// ── Input ────────────────────────────────────────────
bool pf_key_held(PF_State* s, PF_Key k);
bool pf_key_pressed(PF_State* s, PF_Key k);    /* first frame only */
bool pf_key_released(PF_State* s, PF_Key k);
bool pf_touch_down(PF_State* s);
bool pf_touch_pressed(PF_State* s);
bool pf_touch_released(PF_State* s);
float pf_touch_x(PF_State* s);
float pf_touch_y(PF_State* s);
bool  pf_touch_in_rect(PF_State* s, float x, float y, float w, float h);

// ── Timers ───────────────────────────────────────────
bool pf_timer_every(PF_State* s, float seconds);
bool pf_timer_once(PF_State* s, int event_id, int cond_id);

// ── Objects ──────────────────────────────────────────
bool        pf_obj_exists(PF_State* s, const char* name);
PF_Object*  pf_get_obj(PF_State* s, const char* name);
void        pf_create_obj(PF_State* s, const char* name, float x, float y);
void        pf_delete_obj(PF_State* s, const char* name);
void        pf_set_anim(PF_State* s, const char* name, const char* anim);
void        pf_set_pos(PF_State* s, const char* name, float x, float y);
void        pf_set_obj_property(PF_State* s, const char* name, const char* prop, float val);  /* prop: "opacity" (0-1), "rotation" (degrees), or "scale" (multiplier) */
void        _free_all_objs(PF_State* s);  /* free entire object list — used by spawn_scene */
void        pf_load_texture(PF_State* s, const char* objname, const char* romfs_path);
void        pf_set_type(PF_State* s, const char* name, int is_trigger, int is_text, const char* text, float text_size, uint8_t text_r, uint8_t text_g, uint8_t text_b);
void        pf_spawn_from_template(PF_State* s, const char* tmpl_name, float x, float y);

// ── Physics ──────────────────────────────────────────
void pf_add_force(PF_State* s, const char* name, PF_Direction dir, float mag);
void pf_force_towards(PF_State* s, const char* name, const char* target, float mag);
void pf_stop_moving(PF_State* s, const char* name);

// ── Collision ────────────────────────────────────────
bool pf_overlaps(PF_State* s, const char* a, const char* b);

// ── Variables ────────────────────────────────────────
float pf_get_var(PF_State* s, const char* key);
void  pf_set_var(PF_State* s, const char* key, float val);
void  pf_add_var(PF_State* s, const char* key, float delta);

// ── Scene ────────────────────────────────────────────
void pf_load_scene(PF_State* s, const char* scene);

// ── Rendering ───────────────────────────────────────
// Objects are rendered with their opacity applied to the alpha channel.
// All visible objects in layer order are rendered to both top and bottom screens.

// ── Runtime lifecycle (called by main.cpp) ───────────
void pf_runtime_init(PF_State* s, uint16_t w, uint16_t h);
void pf_runtime_update(PF_State* s);
void pf_runtime_render(PF_State* s);  /* renders all visible objects with opacity applied */
void pf_runtime_shutdown(void);

#ifdef __cplusplus
}
#endif
`;
  }

  // ─────────────────────────────────────────────────────────────
  // GENERATE MAIN.CPP
  // Entry point wiring runtime + scenes + events together.
  // ─────────────────────────────────────────────────────────────
  function generateMain(scenes, platform) {
    const gameScenes = (scenes || ['Level_01']).filter(s => !s.endsWith('(Events)'));
    const plat  = 'Nintendo 3DS';

    // Nintendo 3DS — top screen 400×240
    const [W, H] = [400, 240];

    const forwardDecls = gameScenes.map(s => {
      const sn = s.replace(/[^a-zA-Z0-9_]/g,'_');
      return `void pf_events_${sn}(PF_State* state);`;
    }).join('\n');

    const dispatchCases = gameScenes.map(s => {
      const sn = s.replace(/[^a-zA-Z0-9_]/g,'_');
      return `    if (strcmp(s->current_scene, "${s}") == 0) pf_events_${sn}(s);`;
    }).join('\n');

    return `/**
 * main.cpp
 * PixelFlow Game Entry Point
 * Platform: ${plat}  |  Screen: ${W}x${H}
 *
 * Generated by PixelFlow — edit to add your own startup logic.
 * DO NOT regenerate (this file is not overwritten after first export).
 */

#include "pixelflow_runtime.h"
#include <string.h>

// Forward-declare generated event functions
${forwardDecls}

// Dispatch events for the current scene
static void run_events(PF_State* s) {
${dispatchCases}
}

int main(int argc, char* argv[]) {
    (void)argc; (void)argv;

    PF_State state;
    pf_runtime_init(&state, ${W}, ${H});
    state.current_scene = "${gameScenes[0] || 'Level_01'}";

    while (state.running) {
        pf_runtime_update(&state);   // poll input, physics, timers
        run_events(&state);           // run generated IF/THEN logic
        pf_runtime_render(&state);   // platform render
        if (state.next_scene) {
            state.current_scene = state.next_scene;
            state.next_scene    = nullptr;
        }
    }

    pf_runtime_shutdown();
    return 0;
}
`;
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────
  return {
    /**
     * Generate the C++ events file for one scene.
     * @param {Array}  events    — the full events array (pf_events_v1)
     * @param {string} scene     — scene name, e.g. "Level_01"
     * @param {string} platform  — "PSP" | "Vita" | "Wii" | "WiiU" | "3DS" | "Windows"
     * @returns {string} C++ source
     */
    generateScene,

    /**
     * Generate all scene files + header + main.cpp.
     * @param {Array}  events
     * @param {Array}  scenes   — array of scene name strings
     * @param {string} platform
     * @returns {Object} { files: { filename: string, content: string }[] }
     */
    generateAll(events, scenes, platform) {
      const gameScenes = (scenes || []).filter(s => !s.endsWith('(Events)'));
      const files = [];

      // One events_<scene>.cpp per game scene
      gameScenes.forEach(s => {
        const sn = s.replace(/[^a-zA-Z0-9_]/g, '_');
        files.push({
          filename: `generated/events_${sn}.cpp`,
          content:  generateScene(events, s, platform),
        });
      });

      // Runtime header
      files.push({
        filename: 'pixelflow_runtime.h',
        content:  generateRuntimeHeader(platform),
      });

      // Entry point
      files.push({
        filename: 'main.cpp',
        content:  generateMain(scenes, platform),
      });

      return { files };
    },

    /** Expose helpers for testing */
    condCpp,
    actCpp,
    generateRuntimeHeader,
    generateMain,
  };

}));
