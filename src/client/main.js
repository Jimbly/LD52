/*eslint global-require:off*/
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage.js');
local_storage.setStoragePrefix('LD52'); // Before requiring anything else that might load from this

import * as camera2d from 'glov/client/camera2d.js';
import * as engine from 'glov/client/engine.js';
import * as net from 'glov/client/net.js';
import { spriteSetGet } from 'glov/client/sprite_sets.js';
import { createSprite } from 'glov/client/sprites.js';
import * as ui from 'glov/client/ui.js';
import { LINE_ALIGN, drawLine } from 'glov/client/ui.js';
import { mashString, randCreate } from 'glov/common/rand_alea';
import { clamp } from 'glov/common/util';
import { vec4 } from 'glov/common/vmath';

const { floor, round, PI } = Math;

window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SEP_EMPTY = 10;
Z.SEP_CLOSED = 11;
Z.CELLS = 20;
Z.DICE = 100;
Z.SPRITES = 100;

// Virtual viewport for our game logic
const game_width = 480;
const game_height = 480;

const CELLDIM = 64;

const bg_color = vec4(0,0,0,1);
const bg_color_font = 0x000000ff;
const fg_color = vec4(1,1,1,1);

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
}];
const Face = {};
FACES.forEach((a, idx) => {
  Face[a.name] = idx;
});

const CELL_TYPES = [{
  name: 'Unexplored', // just a tile, not actually a type
  label: '?',
  indoors: false,
  need_face: Face.Explore,
}, {
  name: 'Meadow',
  indoors: false,
}, {
  name: 'Bedroom',
  label: 'Bedroom',
  indoors: true,
}, {
  name: 'Forest',
  indoors: false,
}, {
  name: 'Quarry',
  indoors: false,
}, {
  name: 'Build',
  indoors: true,
}, {
  name: 'TownSell',
  indoors: true,
}, {
  name: 'TownBuy',
  indoors: true,
}, {
  name: 'TownEntertain',
  indoors: true,
}, {
  name: 'Ruin',
  indoors: false,
}, {
  name: 'Study',
  indoors: true,
}, {
  name: 'StorageWood',
  indoors: false,
}, {
  name: 'StorageStone',
  indoors: false,
}, {
  name: 'StorageSeed',
  indoors: false,
}, {
  name: 'StorageCrop',
  indoors: false,
}, {
  name: 'StorageMoney',
  indoors: true,
}, {
  name: 'Crop',
  indoors: false,
}, {
  name: 'Reroll',
  indoors: true,
}, {
  name: 'Replace',
  indoors: true,
}, {
  name: 'Entertain',
  indoors: true,
}, {
  name: 'CuddleLeft',
  indoors: true,
}, {
  name: 'CuddleRight',
  indoors: true,
}, {
  name: 'UpgradeLeft',
  indoors: true,
}, {
  name: 'UpgradeRight',
  indoors: true,
}, {
  name: 'KitchenLeft',
  indoors: true,
}, {
  name: 'KitchenRight',
  indoors: true,
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
  }
}

const MAX_LEVEL = 8;
function xpForNextLevel(level) {
  return level * level;
}

class Die {
  constructor(pos) {
    this.faces = [Face.Explore, Face.Explore, Face.Explore, Face.Explore, Face.Explore, Face.Explore];
    this.pos = [pos[0],pos[1]];
    this.cur_face = 0;
    this.level = 1;
    this.xp = 0;
    this.xp_next = xpForNextLevel(this.level);
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
    for (let ii = 0; ii < h; ++ii) {
      let row = [];
      for (let jj = 0; jj < w; ++jj) {
        row.push(new Cell());
      }
      this.board.push(row);
    }
    this.dice = [];
    this.dice.push(new Die([5, 5]));
    this.setCell(5, 5, CellType.Bedroom);
    this.setExplored(5, 5);
  }
  setExplored(x, y) {
    this.board[y][x].explored = true;
  }
  setCell(x, y, type) {
    this.board[y][x].type = type;
  }
}


let game_state;
let view_origin;
function init() {
  sprites.sep_vert_empty = createSprite({
    name: 'sep_vert_empty',
    size: [3, CELLDIM+1],
  });
  sprites.sep_vert_closed = createSprite({
    name: 'sep_vert_closed',
    size: [3, CELLDIM+1],
  });
  sprites.cells = createSprite({
    name: 'cells',
    ws: [1,1,1,1,1,1,1,1],
    hs: [1],
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

function drawBoard() {
  let { board, w, h } = game_state;
  let [x0, y0] = view_origin;
  for (let yy = 0; yy < h; ++yy) {
    for (let xx = 0; xx < w; ++xx) {
      let cell = board[yy][xx];
      let type = CELL_TYPES[cell.type];
      if (xx < w - 1) {
        let cellright = board[yy][xx+1];
        let typeright = CELL_TYPES[cellright.type];
        let empty = !type.indoors && !typeright.indoors;
        let spr = empty ? sprites.sep_vert_empty : sprites.sep_vert_closed;
        let z = empty ? Z.SEP_EMPTY : Z.SEP_CLOSED;
        spr.draw({
          x: x0 + (xx+1) * CELLDIM - 1,
          y: y0 + yy * CELLDIM,
          z,
          color: fg_color,
        });
      }
      if (yy < h - 1) {
        let celldown = board[yy+1][xx];
        let typedown = CELL_TYPES[celldown.type];
        let empty = !type.indoors && !typedown.indoors;
        let spr = empty ? sprites.sep_vert_empty : sprites.sep_vert_closed;
        let z = empty ? Z.SEP_EMPTY : Z.SEP_CLOSED;
        spr.draw({
          x: x0 + xx * CELLDIM,
          y: y0 + (yy+1) * CELLDIM + 2,
          rot: -PI/2,
          z,
          color: fg_color,
        });
      }
      let eff_type = cell.explored ? type : CELL_TYPES[CellType.Unexplored];
      let frame = eff_type.type_id;
      let x = x0 + xx * CELLDIM;
      let y = y0 + yy * CELLDIM;
      sprites.cells.draw({
        x, y, z: Z.CELLS,
        frame,
        color: fg_color,
      });
      if (eff_type.label) {
        font.draw({
          x: x + 1, y, z: Z.CELLS+1,
          w: CELLDIM,
          align: font.ALIGN.HCENTER,
          text: eff_type.label.toUpperCase(),
        });
      }
      if (cell.used_idx !== board.turn_idx && eff_type.need_face !== undefined) {
        // no dice in it at the moment
        sprites.faces.draw({
          x, y, z: Z.CELLS + 1,
          frame: 10,
          color: fg_color,
        });
        sprites.faces.draw({
          x, y, z: Z.CELLS + 2,
          frame: eff_type.need_face,
          color: fg_color,
        });
      }
    }
  }
}

function drawDice() {
  let [x0, y0] = view_origin;
  let { dice } = game_state;
  let z = Z.DICE;
  for (let ii = 0; ii < dice.length; ++ii) {
    let die = dice[ii];
    let x = x0 + die.pos[0] * CELLDIM;
    let y = y0 + die.pos[1] * CELLDIM;

    let show_xp = die.level < MAX_LEVEL && (die.xp || die.level > 1);
    sprites.faces.draw({
      x, y, z,
      frame: show_xp ? 9: 8,
      color: fg_color,
    });
    sprites.faces.draw({
      x, y, z: z + 1,
      frame: die.faces[die.cur_face],
      color: bg_color,
    });
    font.draw({
      x: x + 43,
      y: y + 14,
      z: z + 3,
      text: `${die.level}`,
      color: bg_color_font,
    });
    if (show_xp) {
      let w = clamp(round(die.xp / die.xp_next * 33), die.xp ? 1 : 0, 32);
      drawLine(x + 16, y + 49.5, x + 16 + w, y + 49.5, z + 2, 1, 1, bg_color);
    }
  }
}

function statePlay(dt) {
  camera2d.setAspectFixed(game_width, game_height);
  // gl.clearColor(0, 0, 0, 0);

  drawBoard();
  drawDice();
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

  ui.scaleSizes(13 / 32);
  ui.setFontHeight(16);

  init();

  engine.setState(statePlay);
}
