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
  SPOT_STATE_DOWN,
  spot,
} from 'glov/client/spot';
import { spriteSetGet } from 'glov/client/sprite_sets.js';
import { createSprite } from 'glov/client/sprites.js';
import * as ui from 'glov/client/ui.js';
import { LINE_ALIGN, drawLine, drawRect } from 'glov/client/ui.js';
import { mashString, randCreate } from 'glov/common/rand_alea';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { clamp, easeIn, easeInOut, easeOut, lerp, ridx } from 'glov/common/util';
import { v2copy, v2lerp, v2same, v3copy, v3lerp, vec2, vec4 } from 'glov/common/vmath';

const { floor, min, round, PI } = Math;

// Balance Notes
//   * Crops: 3+ actions, 14+ levels => 8 crops
//   * Gather: 1 action, level === wood/stone
//   * Forage:
const TICKS_SOW = 2;
const TICKS_TEND = 8;
const TICKS_HARVEST = 4;
const CROPS_PER_HARVEST = 8;

const MAX_LEVEL = 8;

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SEP = 10;
Z.CELLS = 20;
Z.DICE = 100;
Z.UI = 150;
Z.PROMPT = 180;
Z.FLOATERS = 200;

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

const font_style_floater = fontStyle(font_style_currency, {
});

const font_style_normal = fontStyle(null, {
  color: fg_color_font,
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

function drawDieFace(face_state, x, y, z, selected, used, focused) {
  let color1 = selected ? bg_color : used ? fg_color_used : fg_color;
  let color2 = selected ? fg_color : bg_color;
  let font_color = selected ? fg_color_font : bg_color_font;

  let show_xp = face_state.level < MAX_LEVEL && (face_state.xp || face_state.level > 1);
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
    frame: face_state.type,
    color: color2,
  });
  font.draw({
    x: x + 43,
    y: y + 14,
    z: z + 3,
    text: `${face_state.level}`,
    color: font_color,
  });
  if (show_xp) {
    let w = clamp(round(face_state.xp / face_state.xp_next * 33), face_state.xp ? 1 : 0, 32);
    drawLine(x + 16, y + 49.5, x + 16 + w, y + 49.5, z + 2, 1, 1, color2);
  }
}

function kitchenActivate(game_state, pos_left, pos_right) {
  let left = game_state.getCell(pos_left);
  let right = game_state.getCell(pos_right);
  let { dice } = game_state;
  let left_die = dice[game_state.freeDieAt(pos_left)];
  let right_die_idx = game_state.freeDieAt(pos_right);
  let right_die = dice[right_die_idx];
  left.used_idx = game_state.turn_idx;
  right.used_idx = game_state.turn_idx;
  left_die.used = true;
  game_state.selected_die = right_die_idx;
  const PROMPT_PAD = 8;
  const PROMPT_H = CELLDIM + PROMPT_PAD * 4 + ui.font_height + ui.button_height;
  const PROMPT_W = (CELLDIM + PROMPT_PAD) * 6 + PROMPT_PAD;
  let z = Z.PROMPT;
  game_state.prompt = function () {
    let w = PROMPT_W;
    let y0 = camera2d.y1() - PROMPT_H;
    let x0 = round(camera2d.x0() + (camera2d.w() - w) / 2);
    let y = y0 + PROMPT_PAD;
    font.draw({
      color: fg_color_font,
      x: x0, y: y + PROMPT_PAD, z, w, align: font.ALIGN.HCENTER,
      text: 'Yum!  Which face would you like to be active?',
    });
    y += ui.font_height + PROMPT_PAD;
    let x = x0 + PROMPT_PAD;
    let done = false;
    for (let ii = 0; ii < 6; ++ii) {
      let face_state = right_die.faces[ii];
      let selected = right_die.cur_face === ii;
      let spot_ret = spot({
        x, y, w: CELLDIM, h: CELLDIM,
        def: selected ? SPOT_DEFAULT_BUTTON_DISABLED : SPOT_DEFAULT_BUTTON,
        disabled_focusable: false,
      });
      let { focused, ret, spot_state } = spot_ret;
      drawDieFace(face_state, x, y, z, spot_state === SPOT_STATE_DOWN, selected, focused);
      if (ret && !done) {
        done = true;
        right_die.cur_face = ii;
        game_state.prompt = null;
      }
      x += CELLDIM + PROMPT_PAD;
    }
    y += CELLDIM + PROMPT_PAD;
    if (!done && ui.buttonText({
      text: 'Cancel',
      x: x0 + w - ui.button_width - PROMPT_PAD,
      y, z,
    })) {
      left.used_idx = -1;
      right.used_idx = -1;
      left_die.used = false;
      game_state.prompt = null;
      game_state.activateCell(right_die.bedroom);
    }
    ui.panel({
      x: x0,
      y: y0,
      w,
      h: PROMPT_H,
      z: z - 1,
    });
  };
}

const CELL_TYPES = [{
  name: 'Unexplored', // just a tile, not actually a type
  action: 'Scout',
  label: '',
  indoors: false,
  need_face: Face.Explore,
  activate: function (game_state, cell, die) {
    game_state.addFloater({
      pos: cell.pos,
      text: 'Explored!',
    });
    cell.doProgress(game_state, die, true);
    game_state.setExplored(cell.pos);
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
  need_face: Face.Any,
  hide_face: true,
  activate: function (game_state, cell, die) {
    die.used = false;
    cell.used_idx = -1;
    if (!v2same(die.bedroom, cell.pos)) {
      let other_die = game_state.dieForBedroom(cell.pos);
      if (other_die) {
        other_die.bedroom = die.bedroom;
      }
      die.bedroom = cell.pos;
    }
  },
}, {
  name: 'Forest',
  label: 'Forest',
  action: 'Gather',
  gather_currency: 'wood',
  init: resourceInit,
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  activate: resourceActivate,
  indoors: false,
  need_face: Face.Gather,
  show_resources: true,
}, {
  name: 'Quarry',
  label: 'Quarry',
  action: 'Gather',
  gather_currency: 'stone',
  init: resourceInit,
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  activate: resourceActivate,
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
    cell.progress_max = TICKS_SOW;
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
    let dec_seeds = cell.crop_stage === 0 && cell.progress === 0;
    let { advanced, floaters } = cell.doProgress(game_state, die, false);
    if (advanced) {
      cell.crop_stage++;
      cell.just_advanced = true;
      cell.last_progress_max = cell.progress_max;
      cell.progress = 0;
      if (cell.crop_stage === 1) {
        game_state.addFloater({
          pos: cell.pos,
          text: 'Planted!',
        });
        cell.progress_max = TICKS_TEND;
      } else if (cell.crop_stage === 2) {
        game_state.addFloater({
          pos: cell.pos,
          text: 'Ready for harvest!',
        });
        cell.progress_max = TICKS_HARVEST;
      } else {
        game_state.addFloater({
          pos: cell.pos,
          text: 'Harvested!',
        });
        game_state.resourceMod(cell, 'crop', CROPS_PER_HARVEST);
        cell.init(game_state);
      }
    }
    if (dec_seeds) {
      if (cell.crop_stage === 0) { // didn't finish
        game_state.addFloater({
          pos: cell.pos,
          text: 'Planting started!',
        });
      }
      game_state.resourceMod(cell, 'seeds', -1);
    }
    floaters.forEach((f) => game_state.addFloater(f));
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
  activate: function (game_state, cell, die) {
    die.used = false;
    cell.used_idx = -1;
    let right = [cell.pos[0]+1, cell.pos[1]];
    let other_die = game_state.freeDieAt(right);
    if (other_die === -1) {
      return;
    }
    kitchenActivate(game_state, cell.pos, right);
  },
}, {
  name: 'KitchenRight',
  label: null,
  action: 'Assign',
  indoors: true,
  need_face: Face.Any,
  activate: function (game_state, cell, die) {
    die.used = false;
    cell.used_idx = -1;
    let left = [cell.pos[0]-1, cell.pos[1]];
    let other_die = game_state.freeDieAt(left);
    if (other_die === -1) {
      return;
    }
    kitchenActivate(game_state, left, cell.pos);
  },
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

function resourceActivate(game_state, cell, die) {
  cell.progress = 0;
  cell.progress_max = cell.resources;
  let { advanced, prog } = cell.doProgress(game_state, die, true);
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  let { gather_currency } = this;
  game_state.resourceMod(cell, gather_currency, prog);
  cell.resources -= prog;
  cell.progress = cell.progress_max = 0;
  if (advanced) {
    game_state.addFloater({
      pos: cell.pos,
      // eslint-disable-next-line @typescript-eslint/no-invalid-this
      text: `${this.label} Cleared!`,
    });
    cell.type = CellType.Meadow;
    cell.init(game_state);
  }
}

function xpForNextLevel(level) {
  return level * level;
}

class Cell {
  constructor(x, y) {
    this.pos = [x, y];
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

  init(game_state) {
    this.progress = 0;
    this.progress_max = 0;
    CELL_TYPES[this.type].init?.(game_state, this);
  }

  doProgress(game_state, die, add_floaters) {
    let progress_max = this.progress_max || 1;
    let left = progress_max - this.progress;
    let face_state = die.getFaceState();
    let prog = min(left, face_state.level);
    this.progress += prog;
    let floaters = [];
    if (face_state.level !== MAX_LEVEL) {
      face_state.xp += prog;
      floaters.push({
        pos: this.pos,
        text: `+${prog} XP`,
      });
      if (face_state.xp >= face_state.xp_next) {
        face_state.xp -= face_state.xp_next;
        face_state.level++;
        face_state.xp_next = xpForNextLevel(face_state.level);
        floaters.push({
          pos: this.pos,
          text: 'Face level up!',
        });
      }
    }
    if (add_floaters) {
      floaters.forEach((f) => game_state.addFloater(f));
    }
    return {
      advanced: this.progress === progress_max,
      floaters,
      prog,
    };
  }
}

class FaceState {
  constructor(type) {
    this.type = type;
    this.level = 1;
    if (engine.DEBUG) {
      this.level = 8;
    }
    this.xp = 0;
    this.xp_next = xpForNextLevel(this.level);
  }
}

function newFace(type) {
  return new FaceState(type);
}

class Die {
  constructor(pos) {
    this.faces = [Face.Explore, Face.Farm, Face.Farm, Face.Gather, Face.Build, Face.Trade].map(newFace);
    this.pos = [pos[0],pos[1]];
    this.bedroom = [pos[0],pos[1]];
    this.cur_face = 1;
    this.lerp_to = null;
    this.lerp_t = 0;
    this.used = false;
  }
  getFace() {
    return this.faces[this.cur_face].type;
  }
  getFaceState() {
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
    this.floaters = [];
    this.floater_idx = 0;
    this.resource_pos = {};
    for (let yy = 0; yy < h; ++yy) {
      let row = [];
      for (let xx = 0; xx < w; ++xx) {
        row.push(new Cell(xx, yy));
      }
      this.board.push(row);
    }
    this.dice = [];
    [
      [5,6],
      [6,6],
    ].forEach((pos) => {
      let die = new Die(pos);
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
    this.prompt = null;
    this.animation = null;
    this.money = 0;
    this.seeds = 1;
    this.wood = 0;
    this.stone = 0;
    this.crop = 0;
    if (engine.DEBUG) {
      // Kitchen test
      // this.selectDie(0);
      // this.activateCell([5,5]);
      // setTimeout(() => {
      //   this.selectDie(1);
      //   this.activateCell([6,5]);
      // }, 500);
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
    let cell = this.board[pos[1]][pos[0]];
    cell.explored = true;
    cell.init(this);
  }
  setCell(pos, type) {
    let cell = this.board[pos[1]][pos[0]];
    cell.type = type;
    cell.init(this);
  }
  setInitialCell(pos, type) {
    this.setCell(pos, type);
    this.setExplored(pos);
    let { currency } = CELL_TYPES[type];
    if (currency) {
      this.resource_pos[currency] = pos;
    }
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
        die.lerp_to = null;
        die.lerp_t = 0;
        die.used = true;
        v2copy(die.pos, pos);
        cell.used_idx = this.turn_idx;
        this.dieActivated(pos, cell, eff_type, die);
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

  dieForBedroom(pos) {
    let { dice } = this;
    for (let ii = 0; ii < dice.length; ++ii) {
      let die = dice[ii];
      if (v2same(die.bedroom, pos)) {
        return die;
      }
    }
    return null;
  }

  addFloater(floater) {
    floater.t = 0;
    floater.idx = this.floater_idx++;
    this.floaters.push(floater);
  }

  getResourcePos(resource) {
    return this.resource_pos[resource];
  }

  resourceMod(cell, resource, delta) {
    let text = `${delta > 0 ? '+' : ''}${delta} ${resource}`;
    if (delta !== 1 && delta !== -1 && resource === 'crop') {
      text += 's';
    }
    let pos = cell.pos;
    this.addFloater({
      pos,
      text,
    });
    this[resource] += delta;
  }

  tick(dt) {
    this.floater_idx = 0;
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

    if (this.prompt) {
      this.prompt(dt);
      eatAllInput();
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
      let used = cell.used_idx === turn_idx;
      let cell_selectable = any_selected && faceMatch(eff_type.need_face, dice[selected_die].getFace()) &&
        (!eff_type.check || !(err = eff_type.check(game_state, cell))) && die_at === -1 && !used;
      let die_selectable = die_at !== -1; // && (!any_selected || selected_die === die_at);
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
      // Draw header
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
      // Draw error overlay
      if (err) {
        font.draw({
          x: x + 1, y: y + 1, z: Z.CELLS+1,
          w: CELLDIM, h: CELLDIM,
          align: font.ALIGN.HVCENTER | font.ALIGN.HWRAP,
          color: title_color_font,
          text: err.toUpperCase(),
        });
      }
      // Draw resources left
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
      // Draw currency amount
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
      // Draw available die face
      if (!used && eff_type.need_face !== undefined && !eff_type.hide_face) {
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

const FLOATER_TIME = 2000;
const FLOATER_YFLOAT = 64;
const FLOATER_DELAY = 250;
const FLOATER_FADE = 250;
function drawFloaters() {
  let [x0, y0] = view_origin;
  let { floaters } = game_state;
  for (let ii = floaters.length - 1; ii >= 0; --ii) {
    let floater = floaters[ii];
    floater.t += engine.frame_dt;
    let t = floater.t;
    t -= floater.idx * FLOATER_DELAY;
    if (t <= 0) {
      continue;
    }
    if (t > FLOATER_TIME) {
      ridx(floaters, ii);
      continue;
    }
    font.draw({
      style: font_style_floater,
      align: font.ALIGN.HCENTER,
      x: x0 + (floater.pos[0] + 0.5) * CELLDIM,
      y: y0 + (floater.pos[1] + 0.5) * CELLDIM - round(FLOATER_YFLOAT * easeOut(t / FLOATER_TIME, 2)) +
        floater.idx * ui.font_height,
      z: Z.FLOATERS + floater.idx,
      alpha: clamp((FLOATER_TIME - t) / FLOATER_FADE, 0, 1),
      text: floater.text
    });
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
    let face_state = die.getFaceState();

    drawDieFace(face_state, x, y, z, selected, die.used, focused);
  }
}

function statePlay(dt) {
  camera2d.setAspectFixed(game_width, game_height);
  gl.clearColor(bg_color[0], bg_color[1], bg_color[2], 0);

  game_state.tick(dt);
  drawBoard();
  drawFloaters();
  drawDice();

  let button_w = 200;
  let disabled = Boolean(game_state.prompt || game_state.animation);
  if (ui.button({
    x: camera2d.x1() - button_w - 4,
    y: camera2d.y1() - ui.button_height - 4,
    w: button_w,
    text: game_state.allDiceUsed() ? 'NEXT TURN' : 'Next Turn (Pass)',
    disabled,
  }) || !disabled && (keyDownEdge(KEYS.N) || keyDownEdge(KEYS.RETURN))) {
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

  ui_sprites.button.ws = [24,16,24];
  ui_sprites.button.hs = [24];
  ui_sprites.button_rollover = { name: 'pixely/button_over', ws: [24,16,24], hs: [24] };
  ui_sprites.panel = { name: 'panel_wood', ws: [12, 8, 12], hs: [11,2,11] };

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

  ui.setFontStyles(font_style_normal);
  ui.scaleSizes(24 / 32);
  ui.setFontHeight(16);

  init();

  engine.setState(statePlay);
}
