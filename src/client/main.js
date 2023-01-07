/*eslint global-require:off*/
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage.js');
local_storage.setStoragePrefix('LD52'); // Before requiring anything else that might load from this

import assert from 'assert';
import { createAnimationSequencer } from 'glov/client/animation';
import * as camera2d from 'glov/client/camera2d.js';
import * as engine from 'glov/client/engine.js';
import { fontStyle, intColorFromVec4Color } from 'glov/client/font';
import { KEYS, eatAllInput, keyDownEdge } from 'glov/client/input.js';
import * as net from 'glov/client/net.js';
import {
  SPOT_DEFAULT_BUTTON,
  SPOT_DEFAULT_BUTTON_DISABLED,
  spot,
} from 'glov/client/spot';
import { spriteSetGet } from 'glov/client/sprite_sets.js';
import { createSprite } from 'glov/client/sprites.js';
import * as ui from 'glov/client/ui.js';
import { LINE_ALIGN, drawLine, drawRect } from 'glov/client/ui.js';
import { mashString, randCreate } from 'glov/common/rand_alea';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { clamp, easeIn, easeInOut, easeOut, lerp } from 'glov/common/util';
import { v2copy, v2lerp, v2same, v3copy, v3lerp, vec2, vec4 } from 'glov/common/vmath';

const { floor, min, round, PI } = Math;

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SEP = 10;
Z.CELLS = 20;
Z.DICE = 100;
Z.SPRITES = 100;

// Virtual viewport for our game logic
const game_width = 480;
const game_height = 480;

const CELLDIM = 64;

const bg_color = vec4(0.15,0.1,0,1);
const bg_color_font = intColorFromVec4Color(bg_color);
const fg_color = vec4(1,0.95,0.8,1);
const fg_color_font = intColorFromVec4Color(fg_color);
const fg_color_disabled = v3copy(vec4(0,0,0, 0.4), fg_color);
const fg_color_used = v3lerp(vec4(0,0,0, 1), 0.3, bg_color, fg_color);
const fg_color_font_used = intColorFromVec4Color(fg_color_used);
const font_style_currency = fontStyle(null, {
  color: fg_color_font,
  outline_color: bg_color_font,
  outline_width: 3,
});

let sprites = {};
let font;

const level_def = {
  seed: 'test',
  w: 16, h: 12,
};

const FACES = [{
  name: 'Farm',
}, {
  name: 'Gather',
}, {
  name: 'Explore',
}, {
  name: 'Trade',
}, {
  name: 'Build',
}, {
  name: 'Entertain',
}, {
  name: 'Any',
}];
const Face = {};
FACES.forEach((a, idx) => {
  Face[a.name] = idx;
});

function faceMatch(fa, fb) {
  return fa === fb || fa === Face.Any || fb === Face.Any;
}

function resourceInit(game_state, cell) {
  cell.resources = 5 + game_state.rand.range(5);
}

const CELL_TYPES = [{
  name: 'Unexplored', // just a tile, not actually a type
  action: 'Scout',
  label: '?',
  indoors: false,
  need_face: Face.Explore,
  activate: function (game_state, cell) {
    // TODO: floater 'Explored!'
    cell.explored = true;
  },
}, {
  name: 'Meadow',
  label: 'Meadow',
  action: 'Forage',
  indoors: false,
  need_face: Face.Explore,
}, {
  name: 'Bedroom',
  label: 'Bunk',
  indoors: true,
}, {
  name: 'Forest',
  label: 'Forest',
  action: 'Gather',
  init: resourceInit,
  indoors: false,
  need_face: Face.Gather,
  show_resources: true,
}, {
  name: 'Quarry',
  label: 'Quarry',
  action: 'Gather',
  init: resourceInit,
  indoors: false,
  need_face: Face.Gather,
  show_resources: true,
}, {
  name: 'Build',
  label: 'Shed',
  action: 'Build',
  indoors: false,
  need_face: Face.Build,
}, {
  name: 'TownSell',
  label: 'Port',
  action: 'Sell',
  indoors: true,
  need_face: Face.Trade,
}, {
  name: 'TownBuy',
  label: 'Market',
  action: 'Buy',
  indoors: true,
  need_face: Face.Trade,
}, {
  name: 'TownEntertain',
  label: 'Square',
  action: 'Play',
  indoors: true,
  need_face: Face.Entertain,
}, {
  name: 'Ruin',
  label: 'Ruin',
  action: 'Explore',
  indoors: false,
  need_face: Face.Explore,
}, {
  name: 'Study',
  label: 'Study',
  action: 'Study',
  indoors: true,
}, {
  name: 'Crop',
  init: function (game_state, cell) {
    cell.crop_stage = 0;
    cell.progress_max = 2;
  },
  label: function (game_stae, cell) {
    if (cell.crop_stage === 0) {
      return 'Field';
    } else if (cell.crop_stage === 1) {
      return 'Sprout';
    } else {
      return 'Ripe';
    }
  },
  action: function (game_state, cell) {
    if (cell.crop_stage === 0) {
      return 'Sow';
    } else if (cell.crop_stage === 1) {
      return 'Tend';
    } else {
      return 'Harvest';
    }
  },
  check: function (game_state, cell) {
    if (cell.crop_stage === 0 && cell.progress === 0) {
      if (!game_state.seeds) {
        return 'Need\nseeds';
      }
    }
    return null;
  },
  activate: function (game_state, cell, die) {
    if (cell.crop_stage === 0 && cell.progress === 0) {
      // TODO: floater 'Planted!'
      // TODO: floater -1 seed
      game_state.seeds--;
    }
    cell.progress += die.level;
    if (cell.progress >= cell.progress_max) {
      cell.crop_stage++;
      cell.just_advanced = true;
      cell.last_progress_max = cell.progress_max;
      cell.progress = 0;
      if (cell.crop_stage === 1) {
        cell.progress_max = 8;
      } else {
        cell.progress_max = 4;
      }
    }
  },
  indoors: false,
  need_face: Face.Farm,
}, {
  name: 'Reroll',
  label: 'Exercise',
  action: 'Reroll',
  indoors: true,
  need_face: Face.Any,
}, {
  name: 'Replace',
  label: 'Library',
  action: 'Replace',
  indoors: true,
  need_face: Face.Any,
}, {
  name: 'Entertain',
  label: 'Parlor',
  action: 'Sing',
  indoors: true,
  need_face: Face.Entertain,
}, {
  name: 'StorageWood',
  indoors: false,
  currency: 'wood',
}, {
  name: 'StorageStone',
  indoors: false,
  currency: 'stone',
}, {
  name: 'StorageSeed',
  indoors: false,
  currency: 'seeds',
}, {
  name: 'StorageCrop',
  indoors: false,
  currency: 'crop',
}, {
  name: 'StorageMoney',
  label: 'Bank',
  indoors: true,
  currency: 'money',
}, {
  name: 'CuddleLeft',
  indoors: true,
  need_face: Face.Any,
}, {
  name: 'CuddleRight',
  indoors: true,
  need_face: Face.Any,
}, {
  name: 'UpgradeLeft',
  indoors: true,
  need_face: Face.Any,
}, {
  name: 'UpgradeRight',
  indoors: true,
  need_face: Face.Any,
}, {
  name: 'KitchenLeft',
  label: 'Kitchen',
  action: 'Prep',
  indoors: true,
  wide: true,
  need_face: Face.Any,
}, {
  name: 'KitchenRight',
  label: null,
  action: 'Assign',
  indoors: true,
  need_face: Face.Any,
}, {
  name: 'TempleUpperLeft',
  indoors: false,
}, {
  name: 'TempleUpperRight',
  indoors: false,
}, {
  name: 'TempleLowerLeft',
  indoors: false,
}, {
  name: 'TempleLowerRight',
  indoors: false,
}];
const CellType = {};
CELL_TYPES.forEach((a, idx) => {
  CellType[a.name] = idx;
  a.type_id = idx;
});

class Cell {
  constructor() {
    this.type = CellType.Meadow;
    this.explored = false;
    this.indoors = false;
    this.used_idx = -1;
    this.crop_stage = 0;
    this.resources = 0;
    this.progress = 0;
    this.progress_max = 0;
  }

  getEffType() {
    return CELL_TYPES[this.explored ? this.type : CellType.Unexplored];
  }
}

const MAX_LEVEL = 8;
function xpForNextLevel(level) {
  return level * level;
}

class Die {
  constructor(pos) {
    this.faces = [Face.Explore, Face.Farm, Face.Farm, Face.Gather, Face.Build, Face.Trade];
    this.pos = [pos[0],pos[1]];
    this.bedroom = [pos[0],pos[1]];
    this.cur_face = 1;
    this.level = 1;
    this.xp = 0;
    this.xp_next = xpForNextLevel(this.level);
    this.lerp_to = null;
    this.lerp_t = 0;
    this.used = false;
  }
  getFace() {
    return this.faces[this.cur_face];
  }
}

class GameState {
  constructor(def) {
    const { w, h, seed } = def;
    this.rand = randCreate(mashString(seed));
    this.turn_idx = 0;
    this.w = w;
    this.h = h;
    this.board = [];
    this.interp_data = {};
    for (let ii = 0; ii < h; ++ii) {
      let row = [];
      for (let jj = 0; jj < w; ++jj) {
        row.push(new Cell());
      }
      this.board.push(row);
    }
    this.dice = [];
    [
      [5,6],
      [6,6],
    ].forEach((pos) => {
      let die = new Die(pos);
      if (engine.DEBUG) {
        die.level = 8;
      }
      this.dice.push(die);
      this.setInitialCell(pos, CellType.Bedroom);
    });
    [
      [3,5,CellType.StorageSeed],
      [4,5,CellType.StorageCrop],
      [3,6,CellType.StorageWood],
      [4,6,CellType.StorageStone],
      [5,4,CellType.Build],
      [5,5,CellType.KitchenLeft],
      [6,5,CellType.KitchenRight],
      [5,7,CellType.Crop],
      [6,7,CellType.Meadow],
      [7,5,CellType.Forest],
      [8,5,CellType.Quarry],
      [9,5,CellType.TownBuy],
      [10,5,CellType.TownSell],
      [9,6,CellType.TownEntertain],
      [10,6,CellType.StorageMoney],
    ].forEach((pair) => {
      this.setInitialCell(pair, pair[2]);
    });
    this.selected_die = null;
    this.animation = null;
    this.money = 0;
    this.seeds = 1;
    this.wood = 0;
    this.stone = 0;
    this.crop = 0;
    if (engine.DEBUG) {
      //this.selectDie(0);
    }
  }
  lazyInterpReset(key, value) {
    let id = this.interp_data[key];
    assert(id);
    id.dt = 0;
    id.value0 = value;
    id.value1 = value;
    id.last_value = value;
  }
  lazyInterp(key, value, time, easeFn) {
    let id = this.interp_data[key];
    if (!id) {
      id = this.interp_data[key] = {
        value0: value,
        value1: value,
        last_value: value,
        dt: 0,
      };
    }
    if (value !== id.value1) {
      id.dt = 0;
      id.value0 = id.last_value;
      id.value1 = value;
    }
    id.frame = engine.frame_index;
    id.dt += engine.frame_dt;
    let t = min(id.dt / time, 1);
    let new_value = lerp(easeFn(t, 2), id.value0, id.value1);
    id.last_value = new_value;
    return new_value;
  }
  nextTurn() {
    assert(!this.animation);
    this.turn_idx++;
    this.selected_die = null;
    let { dice } = this;
    let anim = this.animation = createAnimationSequencer();
    for (let ii = 0; ii < dice.length; ++ii) {
      let die = dice[ii];
      die.used = false;
      die.lerp_to = die.bedroom;
      die.lerp_t = 0;
    }
    anim.add(0, 300, (progress) => {
      for (let ii = 0; ii < dice.length; ++ii) {
        let die = dice[ii];
        die.lerp_t = progress;
        die.cur_face = floor(progress * 6);
        if (progress === 1) {
          v2copy(die.pos, die.lerp_to);
          die.lerp_to = null;
          die.lerp_t = 0;
          die.cur_face = this.rand.range(6);
        }
      }
    });
  }
  allDiceUsed() {
    let { dice } = this;
    for (let ii = 0; ii < dice.length; ++ii) {
      if (!dice[ii].used) {
        return false;
      }
    }
    return true;
  }
  numDiceUsed() {
    let { dice } = this;
    let ret = 0;
    for (let ii = 0; ii < dice.length; ++ii) {
      if (dice[ii].used) {
        ret++;
      }
    }
    return ret;
  }
  kitchenAvailable() {
    if (this.dice.length - this.numDiceUsed() < 2) {
      return false;
    }
    let { board, turn_idx } = this;
    for (let yy = 0; yy < board.length; ++yy) {
      let row = board[yy];
      for (let xx = 0; xx < row.length; ++xx) {
        let cell = row[xx];
        if (cell.used_idx === turn_idx) {
          continue;
        }
        if (cell.type === CellType.KitchenRight) {
          return true;
        }
      }
    }
    return false;
  }
  setExplored(pos) {
    this.board[pos[1]][pos[0]].explored = true;
  }
  setCell(pos, type) {
    let cell = this.board[pos[1]][pos[0]];
    cell.type = type;
    CELL_TYPES[type].init?.(this, cell);
  }
  setInitialCell(pos, type) {
    this.setCell(pos, type);
    this.setExplored(pos);
  }
  selectDie(idx) {
    if (this.selected_die === idx) {
      this.selected_die = null;
    } else {
      this.selected_die = idx;
    }
  }
  getCell(pos) {
    return this.board[pos[1]]?.[pos[0]] || null;
  }

  activateCell(pos) {
    let { dice, selected_die } = this;
    let die = dice[selected_die];
    assert(die);
    let cell = this.getCell(pos);
    assert(cell);
    let eff_type = cell.getEffType();
    assert(faceMatch(eff_type.need_face, die.getFace()));
    assert(!eff_type.check || !eff_type.check(this, cell));
    assert(!this.animation);
    let anim = this.animation = createAnimationSequencer();
    die.lerp_to = pos;
    die.lerp_t = 0;
    this.selected_die = null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let t = anim.add(0, 300, (progress) => {
      die.lerp_t = progress;
      if (progress === 1) {
        this.dieActivated(pos, cell, eff_type, die);
        die.lerp_to = null;
        die.lerp_t = 0;
        die.used = true;
        v2copy(die.pos, pos);
        cell.used_idx = this.turn_idx;
      }
    });
    // t = anim.add(t + 1000, 300, (progress) => alpha = 1 - progress);
  }

  dieActivated(pos, cell, eff_type, die) {
    if (eff_type.activate) {
      eff_type.activate(this, cell, die);
    }
  }

  freeDieAt(pos) {
    let { dice } = this;
    for (let ii = 0; ii < dice.length; ++ii) {
      let die = dice[ii];
      if (!die.used && v2same(die.pos, pos)) {
        return ii;
      }
    }
    return -1;
  }

  tick(dt) {
    if (this.animation) {
      if (!this.animation.update(dt)) {
        this.animation = null;
      } else {
        eatAllInput();
      }
    }
    for (let key in this.interp_data) {
      let id = this.interp_data[key];
      if (id.frame < engine.frame_index - 1) {
        delete this.interp_data[key];
      }
    }
  }
}


let game_state;
let view_origin;
function init() {
  sprites.sep_vert = createSprite({
    name: 'sep_vert',
    ws: [3,3,3],
    hs: [65],
    size: [3, CELLDIM+1],
  });
  sprites.cells = createSprite({
    name: 'cells',
    ws: [1,1,1,1,1,1,1,1],
    hs: [1,1,1,1],
    size: [CELLDIM, CELLDIM],
  });
  sprites.faces = createSprite({
    name: 'faces',
    ws: [1,1,1,1,1,1,1,1],
    hs: [1,1],
    size: [CELLDIM, CELLDIM],
  });
  game_state = new GameState(level_def);
  view_origin = [
    floor(-(game_state.w * CELLDIM - game_width) / 2),
    floor(-(game_state.h * CELLDIM - game_height) / 2),
  ];
  ({ font } = ui);
}

const DX = [-1,1,0,0];
const DY = [0,0,-1,1];
function neighborVisible(x, y) {
  let { board } = game_state;
  for (let ii = 0; ii < DX.length; ++ii) {
    let xx = x + DX[ii];
    let yy = y + DY[ii];
    let row = board[yy];
    if (row) {
      let cell = row[xx];
      if (cell?.explored) {
        return true;
      }
    }
  }
  return false;
}

const PROGRESS_H = 8;
function drawProgress(x, y, cell, color) {
  let z = Z.CELLS + 1;
  let x0 = x + 2;
  let x1 = x + CELLDIM - 2;
  let y0 = y + CELLDIM - 2 - PROGRESS_H;
  let y1 = y + CELLDIM - 2;
  drawRect(x0, y0, x1, y1, z, color);
  x0++;
  x1--;
  y0++;
  y1--;
  z+=0.1;
  let w = x1 - x0;
  let pmax = cell.just_advanced ? cell.last_progress_max : cell.progress_max;
  let desired_progress = cell.just_advanced ? 1 : cell.progress / cell.progress_max;
  let interp_progress = game_state.lazyInterp(`dp_${x}_${y}`,
    desired_progress, 200, easeInOut);
  if (cell.just_advanced && interp_progress === 1) {
    cell.just_advanced = false;
    game_state.lazyInterpReset(`dp_${x}_${y}`, 0);
  }
  let p = round(interp_progress * w);
  p = clamp(p, cell.progress ? 1 : 0, cell.progress < cell.progress_max ? w - 1 : w);
  if (p !== w) {
    drawRect(x0 + p, y0, x1, y1, z, bg_color);
    for (let ii = 1; ii < pmax; ++ii) {
      let xx = x0 + round(ii / cell.progress_max * w);
      drawLine(xx + 0.5, y0, xx + 0.5, y1, z+0.1, 1, 1, color);
    }
  }
}

function drawBoard() {
  let { board, w, h, selected_die, dice, turn_idx } = game_state;
  let any_selected = selected_die !== null;
  let [x0, y0] = view_origin;
  for (let yy = 0; yy < h; ++yy) {
    for (let xx = 0; xx < w; ++xx) {
      if (!neighborVisible(xx, yy)) {
        continue;
      }
      let cell = board[yy][xx];
      let type = CELL_TYPES[cell.type];
      let eff_type = cell.getEffType();
      if (neighborVisible(xx+1, yy) && !eff_type.wide) {
        let cellright = board[yy][xx+1];
        let typeright = CELL_TYPES[cellright.type];
        let interior = type.indoors && typeright.indoors;
        let empty = !type.indoors && !typeright.indoors;
        let frame = interior ? 2 : empty ? 0 : 1;
        sprites.sep_vert.draw({
          x: x0 + (xx+1) * CELLDIM - 1,
          y: y0 + yy * CELLDIM,
          z: Z.SEP,
          frame,
          color: fg_color,
        });
      }
      if (neighborVisible(xx, yy+1)) {
        let celldown = board[yy+1][xx];
        let typedown = CELL_TYPES[celldown.type];
        let interior = type.indoors && typedown.indoors;
        let empty = !type.indoors && !typedown.indoors;
        let frame = interior ? 2 : empty ? 0 : 1;
        sprites.sep_vert.draw({
          x: x0 + xx * CELLDIM,
          y: y0 + (yy+1) * CELLDIM + 2,
          rot: -PI/2,
          z: Z.SEP,
          frame,
          color: fg_color,
        });
      }
      let die_at = game_state.freeDieAt([xx, yy]);
      let err;
      let cell_selectable = any_selected && faceMatch(eff_type.need_face, dice[selected_die].getFace()) &&
        (!eff_type.check || !(err = eff_type.check(game_state, cell)));
      let die_selectable = die_at !== -1 && (!any_selected || selected_die === die_at);
      let frame = eff_type.type_id;
      let x = x0 + xx * CELLDIM;
      let y = y0 + yy * CELLDIM;
      let spot_ret = spot({
        x: x + 1, y: y + 1, w: CELLDIM - 1, h: CELLDIM - 1,
        def: (cell_selectable || die_selectable) ? SPOT_DEFAULT_BUTTON : SPOT_DEFAULT_BUTTON_DISABLED,
        disabled_focusable: false,
      });
      let { ret, focused } = spot_ret;
      if (ret) {
        if (cell_selectable) {
          game_state.activateCell([xx, yy]);
        } else {
          assert(die_selectable);
          game_state.selectDie(die_at);
        }
      }
      if (die_selectable) {
        dice[die_at].focused = focused;
        focused = false;
      }
      sprites.cells.draw({
        x, y, z: Z.CELLS,
        frame,
        color: err ? fg_color_disabled : fg_color,
      });
      let text;
      if (eff_type.label && !any_selected) {
        text = eff_type.label;
      }
      if (eff_type.action && cell_selectable) {
        text = eff_type.action;
      }
      if (typeof text === 'function') {
        text = text(game_state, cell);
      }
      let used = cell.used_idx === turn_idx;
      let title_color_font = used ? fg_color_font_used : fg_color_font;
      let title_color = used ? fg_color_used : fg_color;
      if (text) {
        let text_w = CELLDIM;
        if (eff_type.wide && !cell_selectable) {
          text_w += CELLDIM;
        }
        font.draw({
          x: x + 1, y, z: Z.CELLS+1,
          w: text_w,
          align: font.ALIGN.HCENTER,
          color: title_color_font,
          text: text.toUpperCase(),
        });
      }
      if (err) {
        font.draw({
          x: x + 1, y: y + 1, z: Z.CELLS+1,
          w: CELLDIM, h: CELLDIM,
          align: font.ALIGN.HVCENTER | font.ALIGN.HWRAP,
          color: title_color_font,
          text: err.toUpperCase(),
        });
      }
      if (eff_type.show_resources) {
        let value = cell.resources;
        font.draw({
          x: x - 2, y: y, z: Z.CELLS+1,
          w: CELLDIM, h: CELLDIM,
          align: font.ALIGN.HRIGHT | font.ALIGN.HWRAP | font.ALIGN.VBOTTOM,
          style: font_style_currency,
          size: ui.font_height,
          text: `${value}`,
        });
      }
      if (eff_type.currency) {
        let value = game_state[eff_type.currency];
        font.draw({
          x: x + 1, y: y - 2, z: Z.CELLS+1,
          w: CELLDIM, h: CELLDIM,
          align: font.ALIGN.HCENTER | font.ALIGN.HWRAP | font.ALIGN.VBOTTOM,
          style: font_style_currency,
          size: ui.font_height * 2,
          text: `${value}`,
        });
      }
      if (!used && eff_type.need_face !== undefined) {
        let color = any_selected && !cell_selectable ? fg_color_disabled : fg_color;
        // no dice in it at the moment
        sprites.faces.draw({
          x, y, z: Z.CELLS + 1,
          frame: 10,
          color,
        });
        if (focused) {
          sprites.faces.draw({
            x, y, z: Z.CELLS + 1.5,
            frame: 14,
            color,
          });
        }
        sprites.faces.draw({
          x, y, z: Z.CELLS + 2,
          frame: eff_type.need_face,
          color,
        });
      }
      if (cell.explored && cell.progress_max) {
        drawProgress(x, y, cell, title_color);
      }
    }
  }
}

let die_pos = vec2();
function drawDice() {
  let [x0, y0] = view_origin;
  let { dice, selected_die } = game_state;
  for (let ii = 0; ii < dice.length; ++ii) {
    let z = Z.DICE;
    let die = dice[ii];
    if (die.lerp_to) {
      v2lerp(die_pos, easeInOut(die.lerp_t, 2), die.pos, die.lerp_to);
      z += 5;
    } else {
      v2copy(die_pos, die.pos);
    }
    let x = x0 + die_pos[0] * CELLDIM;
    let y = y0 + die_pos[1] * CELLDIM;

    let { focused } = die;
    let selected = selected_die === ii;

    let color1 = die.used ? fg_color_used : selected ? bg_color : fg_color;
    let color2 = selected ? fg_color : bg_color;
    let font_color = selected ? fg_color_font : bg_color_font;

    let show_xp = die.level < MAX_LEVEL && (die.xp || die.level > 1);
    sprites.faces.draw({
      x, y, z,
      frame: show_xp ? 9: 8,
      color: color1,
    });
    if (focused || selected) {
      sprites.faces.draw({
        x, y, z: z + 0.5,
        frame: 13,
        color: fg_color,
      });
    }
    sprites.faces.draw({
      x, y, z: z + 1,
      frame: die.getFace(),
      color: color2,
    });
    font.draw({
      x: x + 43,
      y: y + 14,
      z: z + 3,
      text: `${die.level}`,
      color: font_color,
    });
    if (show_xp) {
      let w = clamp(round(die.xp / die.xp_next * 33), die.xp ? 1 : 0, 32);
      drawLine(x + 16, y + 49.5, x + 16 + w, y + 49.5, z + 2, 1, 1, color2);
    }
  }
}

function statePlay(dt) {
  camera2d.setAspectFixed(game_width, game_height);
  gl.clearColor(bg_color[0], bg_color[1], bg_color[2], 0);

  game_state.tick(dt);
  drawBoard();
  drawDice();

  let button_w = 200;
  if (ui.button({
    x: camera2d.x1() - button_w - 4,
    y: camera2d.y1() - ui.button_height - 4,
    w: button_w,
    text: game_state.allDiceUsed() ? 'NEXT TURN' : 'Next Turn (Pass)',
  }) || keyDownEdge(KEYS.N) || keyDownEdge(KEYS.RETURN)) {
    if (game_state.kitchenAvailable()) {
      ui.modalDialog({
        text: 'Hint: You can use any one die to PREP the Kitchen in order to ASSIGN any' +
          ' other die to any face.  Are you sure you wish to pass your turn?',
        buttons: {
          Yes: game_state.nextTurn.bind(game_state),
          No: null,
        },
      });
    } else {
      game_state.nextTurn();
    }
  }
}

export function main() {
  if (engine.DEBUG) {
    // Enable auto-reload, etc
    net.init({ engine });
  }

  const font_info_vgax2 = require('./img/font/vga_16x2.json');
  const font_info_vgax1 = require('./img/font/vga_16x1.json');
  const font_info_palanquin32 = require('./img/font/palanquin32.json');
  let pixely = 'on';
  let ui_sprites;
  if (pixely === 'strict' || true) {
    font = { info: font_info_vgax1, texture: 'font/vga_16x1' };
    ui_sprites = spriteSetGet('pixely');
  } else if (pixely && pixely !== 'off') {
    font = { info: font_info_vgax2, texture: 'font/vga_16x2' };
    ui_sprites = spriteSetGet('pixely');
  } else {
    font = { info: font_info_palanquin32, texture: 'font/palanquin32' };
  }

  if (!engine.startup({
    game_width,
    game_height,
    pixely,
    font,
    viewport_postprocess: false,
    antialias: false,
    do_borders: false,
    line_mode: LINE_ALIGN,
    ui_sprites,
  })) {
    return;
  }
  font = engine.font;

  ui.scaleSizes(24 / 32);
  ui.setFontHeight(16);

  init();

  engine.setState(statePlay);
}
