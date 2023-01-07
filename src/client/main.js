/*eslint global-require:off*/
// eslint-disable-next-line import/order
const local_storage = require('glov/client/local_storage.js');
local_storage.setStoragePrefix('LD52'); // Before requiring anything else that might load from this

import assert from 'assert';
import { createAnimationSequencer } from 'glov/client/animation';
import * as camera2d from 'glov/client/camera2d.js';
import * as engine from 'glov/client/engine.js';
import { fontStyle, intColorFromVec4Color } from 'glov/client/font';
import {
  KEYS,
  drag,
  eatAllInput,
  keyDown,
  keyDownEdge,
} from 'glov/client/input.js';
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
import { clamp, easeIn, easeInOut, easeOut, identity, lerp, ridx } from 'glov/common/util';
import {
  v2add,
  v2copy,
  v2floor,
  v2lerp,
  v2same,
  v2set,
  v3copy,
  v3lerp,
  vec2,
  vec4,
} from 'glov/common/vmath';

const { floor, max, min, pow, round, PI } = Math;

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
const font_style_disabled = fontStyle(font_style_normal, {
  color: fg_color_font & 0xFFFFFF00 | 0x60,
});

let sprites = {};
let font;

const level_def = {
  seed: 'test1',
  w: 16, h: 14,
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

function templeInit(game_state, cell) {
  cell.progress_max = 8;
}

function temple2Init(game_state, cell) {
  cell.progress_max = 12;
}

function templeActivate(game_state, cell, die) {
  let { advanced } = cell.doProgress(game_state, die, true);
  if (advanced) {
    // TODO: dialog here?
    game_state.addFloater({
      pos: cell.pos,
      text: 'Explored!',
    });
    cell.type += 4;
    cell.init(game_state);
    cell.used_idx = -1;
  }
}

function templeComplete(game_state) {
  let count = 0;
  game_state.board.forEach((row) => {
    row.forEach((cell) => {
      if (cell.temple_completed) {
        ++count;
      }
    });
  });
  return count === 4;
}

function temple2Activate(game_state, cell, die) {
  let { advanced } = cell.doProgress(game_state, die, true);
  if (advanced) {
    // TODO: dialog here?
    game_state.addFloater({
      pos: cell.pos,
      text: 'Die was harvested!',
    });
    // remove die
    let idx = game_state.dice.indexOf(die);
    ridx(game_state.dice, idx);
    cell.completed = true;
    cell.temple_completed = true;
    cell.used_idx = -1;
    if (templeComplete(game_state)) {
      ui.modalDialog({
        title: 'You win!',
        text: 'The temple has been unlocked, unlocking your path to prosperity and victory.\n\nThanks for playing!',
        buttons: {
          Ok: null,
        }
      });
    }
  }
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

const PROMPT_PAD = 8;

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

function tradeDiscount(level) {
  if (level >= 8) {
    return 3;
  } else if (level >= 4) {
    return 2;
  } else if (level >= 2) {
    return 1;
  }
  return 0;
}

let CURRENCY_TO_FRAME;
function drawCurrency(game_state, currency, x, y, z) {
  sprites.cells.draw({
    x, y, z,
    frame: CURRENCY_TO_FRAME[currency],
    color: fg_color,
  });
  let value = game_state[currency];
  let eff_value = round(game_state.lazyInterp(`cur_${currency}`, value, 500, identity));
  font.draw({
    x: x + 1, y: y - 2, z: z+1,
    w: CELLDIM, h: CELLDIM,
    align: font.ALIGN.HCENTERFIT | font.ALIGN.VBOTTOM,
    style: font_style_currency,
    size: ui.font_height * 2,
    text: `${eff_value}`,
  });
}

function marketActivate(game_state, cell, die) {
  let level = die.getFaceState().level;
  let discount = tradeDiscount(level);
  let shop_entries = [{
    type: 'currency',
    currency: 'seeds',
    cost: 5 - discount,
  }, {
    type: 'currency',
    currency: 'wood',
    cost: 4 - discount,
  }, {
    type: 'currency',
    currency: 'stone',
    cost: 6 - discount,
  }];
  const SHOP_H = 48;
  const PROMPT_H = PROMPT_PAD * 5 + ui.font_height + ui.button_height + 16 +
    shop_entries.length * SHOP_H;
  const PROMPT_W = 480;
  let z = Z.PROMPT;
  let bought_anything = false;
  game_state.prompt = function () {
    let w = PROMPT_W;
    let y0 = camera2d.y1() - PROMPT_H;
    let x0 = round(camera2d.x0() + (camera2d.w() - w) / 2);
    let y = y0 + PROMPT_PAD;
    // draw current money in corner
    drawCurrency(game_state, 'money', x0 + w - PROMPT_PAD - CELLDIM, y - PROMPT_PAD, z);
    if (discount) {
      font.draw({
        style: font_style_normal,
        x: x0, y: y + PROMPT_PAD, z, w, align: font.ALIGN.HCENTER | font.ALIGN.HWRAP,
        text: `Buy from Town Market\n(discount of $${discount} from Face level ${level})`,
      });
      y += ui.font_height + PROMPT_PAD + 16;
    } else {
      y += 8;
      font.draw({
        style: font_style_normal,
        x: x0, y: y + PROMPT_PAD, z, w, align: font.ALIGN.HCENTER,
        text: 'Buy from Town Market',
      });
      y += ui.font_height + PROMPT_PAD;
      y += 8;
    }
    const ICON_PAD = CELLDIM - SHOP_H;
    const BUTTON_PAD = round((SHOP_H - ui.button_height)/2);
    for (let ii = 0; ii < shop_entries.length; ++ii) {
      let entry = shop_entries[ii];
      let x = x0 + PROMPT_PAD;
      if (entry.type === 'currency') {
        drawCurrency(game_state, entry.currency, x, y - ICON_PAD, z);
        x += CELLDIM + PROMPT_PAD;
        font.draw({
          style: font_style_normal,
          x, y, z, h: SHOP_H, align: font.ALIGN.VCENTER,
          text: `${entry.currency.toUpperCase()}`
        });
        x += 64;
        let buy = 0;
        if (ui.buttonText({
          text: `Buy ($${entry.cost})`,
          x, y: y + BUTTON_PAD,
          z,
          w: 110,
          disabled: game_state.money < entry.cost,
        })) {
          buy = 1;
        }
        x += 110 + PROMPT_PAD;
        if (ui.buttonText({
          text: `Buy 10 ($${entry.cost * 10})`,
          x, y: y + BUTTON_PAD,
          z,
          disabled: game_state.money < entry.cost * 10,
        })) {
          buy = 10;
        }
        if (buy) {
          bought_anything = true;
          game_state.resourceMod({
            pos: game_state.getResourcePos('money'), // TODO: map screen space to world space to show up above shop
          }, 'money', -buy * entry.cost);
          game_state.resourceMod({
            pos: game_state.getResourcePos(entry.currency), // TODO: map screen space to world space
          }, entry.currency, buy);
        }
        x += ui.button_width + PROMPT_PAD;
      }
      y += SHOP_H;
    }
    y += PROMPT_PAD;
    if (ui.buttonText({
      text: bought_anything ? 'Done' : 'Cancel',
      x: x0 + w - ui.button_width - PROMPT_PAD,
      y, z,
    })) {
      if (!bought_anything) {
        cell.used_idx = -1;
        die.used = false;
        game_state.selected_die = game_state.dice.indexOf(die);
        assert.equal(game_state.dice[game_state.selected_die], die);
        game_state.activateCell(die.bedroom);
      }
      game_state.prompt = null;
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

const FORAGE_MAX_ODDS = 32;
const FORAGE_RESULTS = [{
  odds: 4,
  currency: 'crop',
}, {
  odds: 2,
  currency: 'seeds',
}, {
  odds: 1,
  currency: 'money',
}, {
  odds: 12,
  currency: 'wood',
}, {
  odds: 13,
  currency: 'stone',
}];

function forageRoll(game_state) {
  let roll = game_state.rand.range(FORAGE_MAX_ODDS);
  let idx = 0;
  while (roll >= FORAGE_RESULTS[idx].odds) {
    roll -= FORAGE_RESULTS[idx].odds;
    idx++;
  }
  let { currency } = FORAGE_RESULTS[idx];
  return currency;
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
  label: '', // 'Meadow',
  action: 'Forage',
  indoors: false,
  need_face: Face.Explore,
  hide_face: true,
  activate: function (game_state, cell, die) {
    let num_rolls = tradeDiscount(die.getFaceState().level) + 1;
    let gains = {};
    for (let ii = 0; ii < num_rolls; ++ii) {
      let currency = forageRoll(game_state);
      gains[currency] = (gains[currency] || 0) + 1;
    }
    for (let key in gains) {
      game_state.resourceMod(cell, key, gains[key]);
    }
    cell.progress = 0;
    cell.progress_max = num_rolls;
    cell.doProgress(game_state, die, true);
    cell.progress_max = 0;
  },
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
  label: '',
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
  label: '',
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
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  activate: buildActivate,
}, {
  name: 'TownSell',
  label: 'Port',
  action: 'Sell',
  indoors: true,
  need_face: Face.Trade,
  check: function (game_state, cell) {
    if (!game_state.crop) {
      return 'Needs\ncrops';
    }
    return null;
  },
  tick: function (game_state, cell) {
    cell.progress_max = game_state.crop;
  },
  activate: function (game_state, cell, die) {
    let { prog } = cell.doProgress(game_state, die, true);
    game_state.resourceMod(cell, 'crop', -prog);
    game_state.resourceMod(cell, 'money', prog);
    cell.just_advanced = prog / cell.progress_max;
    cell.last_progress_max = cell.progress_max;
    cell.progress = 0;
  },
}, {
  name: 'TownBuy',
  label: 'Market',
  action: 'Buy',
  indoors: true,
  need_face: Face.Trade,
  activate: marketActivate,
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
  label: function (game_state, cell) {
    if (!cell || cell.crop_stage === 0) {
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
        return 'Needs\nseeds';
      }
    }
    return null;
  },
  activate: function (game_state, cell, die) {
    let dec_seeds = cell.crop_stage === 0 && cell.progress === 0;
    let { advanced, floaters } = cell.doProgress(game_state, die, false);
    if (advanced) {
      cell.crop_stage++;
      cell.just_advanced = 1;
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
  label: 'Temple',
  action: 'Explore',
  indoors: false,
  wide: true,
  tall: true,
  need_face: Face.Explore,
  init: templeInit,
  activate: templeActivate,
}, {
  name: 'TempleUpperRight',
  action: 'Explore',
  indoors: false,
  tall: true,
  need_face: Face.Explore,
  init: templeInit,
  activate: templeActivate,
}, {
  name: 'TempleLowerLeft',
  action: 'Explore',
  indoors: false,
  wide: true,
  need_face: Face.Explore,
  init: templeInit,
  activate: templeActivate,
}, {
  name: 'TempleLowerRight',
  action: 'Explore',
  indoors: false,
  need_face: Face.Explore,
  init: templeInit,
  activate: templeActivate,
}, {
  name: 'TempleStage2UpperLeft',
  label: 'Temple',
  action: 'Harvest',
  indoors: false,
  wide: true,
  tall: true,
  need_face: Face.Farm,
  init: temple2Init,
  activate: temple2Activate,
}, {
  name: 'TempleStage2UpperRight',
  action: 'Harvest',
  indoors: false,
  tall: true,
  need_face: Face.Build,
  init: temple2Init,
  activate: temple2Activate,
}, {
  name: 'TempleStage2LowerLeft',
  action: 'Harvest',
  indoors: false,
  wide: true,
  need_face: Face.Gather,
  init: temple2Init,
  activate: temple2Activate,
}, {
  name: 'TempleStage2LowerRight',
  action: 'Harvest',
  indoors: false,
  need_face: Face.Any,
  init: temple2Init,
  activate: temple2Activate,
}];
const CellType = {};
CELL_TYPES.forEach((a, idx) => {
  CellType[a.name] = idx;
  a.type_id = idx;
});

CURRENCY_TO_FRAME = {
  money: CellType.StorageMoney,
  wood: CellType.StorageWood,
  stone: CellType.StorageStone,
  seeds: CellType.StorageSeed,
  crop: CellType.StorageCrop,
};

function bedroomCost(count) {
  let v = pow(4, (count - 1));
  return [v, 2, 0];
}

function buildPlace(game_state, cell, die, entry) {
  let { cell_type } = entry;
  let type_data = CELL_TYPES[cell_type];
  entry.wide = type_data.wide;
  let label = type_data.label;
  if (typeof label === 'function') {
    label = label(game_state, null);
  }
  const PROMPT_H = PROMPT_PAD * 2 + ui.button_height;
  const PROMPT_W = 480;
  let z = Z.PROMPT;
  game_state.build_mode = {
    cell,
    die,
    entry,
  };
  game_state.prompt = function () {
    let w = PROMPT_W;
    let y0 = camera2d.y1() - PROMPT_H;
    let x0 = round(camera2d.x0() + (camera2d.w() - w) / 2);
    let y = y0 + PROMPT_PAD;
    font.draw({
      style: font_style_normal,
      x: x0 + PROMPT_PAD, y: y + (ui.button_height - ui.font_height)/2,
      z, w: w - ui.button_width - PROMPT_PAD*2, align: font.ALIGN.HCENTER,
      text: `Build ${label} where?`,
    });
    if (ui.buttonText({
      text: 'Back',
      x: x0 + w - ui.button_width - PROMPT_PAD,
      y, z,
    })) {
      game_state.build_mode = null;
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      buildActivate(game_state, cell, die);
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

function buildActivate(game_state, cell, die) {
  let counts = {};
  let { board } = game_state;
  board.forEach((row) => {
    row.forEach((cell2) => {
      counts[cell2.type] = (counts[cell2.type] || 0) + 1;
    });
  });
  let shop_entries = [{
    cell_type: CellType.Bedroom,
    desc: 'Room for one more die',
    cost: bedroomCost(counts[CellType.Bedroom]),
  }, {
    cell_type: CellType.KitchenLeft,
    desc: 'Spend one die to reassign another',
    cost: [4,6,2],
  }, {
    cell_type: CellType.Crop,
    desc: 'Plant seeds to grow crops',
    cost: [5,1,0],
  }];
  const SHOP_H = CELLDIM;
  const PROMPT_H = PROMPT_PAD * 5 + ui.font_height + ui.button_height + 26 +
    shop_entries.length * SHOP_H;
  const PROMPT_W = 480;
  let z = Z.PROMPT;
  game_state.prompt = function () {
    let w = PROMPT_W;
    let y0 = camera2d.y1() - PROMPT_H;
    let x0 = round(camera2d.x0() + (camera2d.w() - w) / 2);
    let y = y0 + PROMPT_PAD;
    // draw current currencies in corner
    let x_money = x0 + w - PROMPT_PAD - CELLDIM;
    let x_stone = x_money - PROMPT_PAD - CELLDIM;
    let x_wood = x_stone - PROMPT_PAD - CELLDIM;
    drawCurrency(game_state, 'wood', x_wood, y - PROMPT_PAD, z);
    drawCurrency(game_state, 'stone', x_stone, y - PROMPT_PAD, z);
    drawCurrency(game_state, 'money', x_money, y - PROMPT_PAD, z);
    font.draw({
      style: font_style_normal,
      x: x0 + PROMPT_PAD, y: y + PROMPT_PAD, z, w, align: font.ALIGN.HWRAP,
      text: 'Start building what?\nRequires empty Meadow(s)',
    });
    y += ui.font_height + PROMPT_PAD + 26;
    let done = false;
    for (let ii = 0; ii < shop_entries.length; ++ii) {
      let entry = shop_entries[ii];
      let { cell_type, cost, desc } = entry;
      let type_data = CELL_TYPES[cell_type];
      let x = x0 + PROMPT_PAD;
      let x_icon = x;

      let disabled = done;
      disabled = disabled || game_state.wood < cost[0];
      font.draw({
        x: x_wood, y, z, w: CELLDIM, h: SHOP_H,
        align: font.ALIGN.HVCENTER,
        size: ui.font_height * 2,
        style: game_state.wood < cost[0] ? font_style_disabled : font_style_normal,
        text: `${cost[0]}`
      });

      disabled = disabled || game_state.stone < cost[1];
      font.draw({
        x: x_stone, y, z, w: CELLDIM, h: SHOP_H,
        align: font.ALIGN.HVCENTER,
        size: ui.font_height * 2,
        style: game_state.stone < cost[1] ? font_style_disabled : font_style_normal,
        text: `${cost[1]}`
      });

      disabled = disabled || game_state.money < cost[2];
      font.draw({
        x: x_money, y, z, w: CELLDIM, h: SHOP_H,
        align: font.ALIGN.HVCENTER,
        size: ui.font_height * 2,
        style: game_state.money < cost[2] ? font_style_disabled : font_style_normal,
        text: `${cost[2]}`
      });

      let text = type_data.label;
      if (typeof text === 'function') {
        text = text(game_state, null);
      }
      font.draw({
        x: x + 1, y, z: z + 1,
        w: CELLDIM*2,
        align: font.ALIGN.HCENTER,
        style: disabled ? font_style_disabled : font_style_normal,
        text: `${text.toUpperCase()} #${counts[cell_type] + 1}`,
      });
      x += CELLDIM*2;

      font.draw({
        x, y, z, w: x_wood - x, h: SHOP_H,
        align: font.ALIGN.HVCENTER|font.ALIGN.HWRAP,
        style: disabled ? font_style_disabled : font_style_normal,
        text: desc || '?',
      });

      let spot_ret = spot({
        x: x0, y, w: PROMPT_W, h: SHOP_H,
        def: disabled ? SPOT_DEFAULT_BUTTON_DISABLED : SPOT_DEFAULT_BUTTON,
      });
      let { focused, ret } = spot_ret;
      if (focused) {
        ui.drawRect(x0 + 4, y, x0 + PROMPT_W - 4, y + SHOP_H - 1, z-0.50, fg_color);
        ui.drawRect(x0 + 5, y+1, x0 + PROMPT_W - 5, y + SHOP_H - 2, z-0.45, bg_color);
      }

      let cell_pos = {
        x: x_icon + (type_data.wide ? 0 : CELLDIM/2), y, z,
        color: fg_color,
      };
      sprites.cells.draw({
        ...cell_pos,
        frame: cell_type,
      });
      if (focused) {
        sprites.faces.draw({
          ...cell_pos,
          z: z + 1,
          frame: 10,
        });
        sprites.faces.draw({
          ...cell_pos,
          z: z + 2,
          frame: type_data.need_face,
        });
      }
      if (type_data.wide) {
        cell_pos.x = x_icon + CELLDIM;
        sprites.cells.draw({
          ...cell_pos,
          frame: cell_type+1,
        });
        if (focused) {
          sprites.faces.draw({
            ...cell_pos,
            z: z + 1,
            frame: 10,
          });
          sprites.faces.draw({
            ...cell_pos,
            z: z + 2,
            frame: type_data.need_face,
          });
        }
      }

      if (ret && !done) {
        done = true;
        buildPlace(game_state, cell, die, entry);
      }

      y += SHOP_H;
    }
    y += PROMPT_PAD;
    if (!done && ui.buttonText({
      text: 'Cancel',
      x: x0 + w - ui.button_width - PROMPT_PAD,
      y, z,
    })) {
      cell.used_idx = -1;
      die.used = false;
      game_state.selected_die = game_state.dice.indexOf(die);
      assert.equal(game_state.dice[game_state.selected_die], die);
      game_state.activateCell(die.bedroom);
      game_state.prompt = null;
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

const DX = [-1,1,0,0];
const DY = [0,0,-1,1];

function genMap(game_state) {
  let { w, h, rand } = game_state;

  // place goal
  let is_horiz = rand.range(w + h) < w;
  let x;
  let y;
  if (is_horiz) {
    x = 1 + rand.range(w - 3);
    y = rand.range(2) ?
      1 + rand.range(2) :
      h - 4 + rand.range(2);
  } else {
    x = rand.range(2) ?
      1 + rand.range(2) :
      w - 3;
    y = 1 + rand.range(h - 3);
  }

  let done = {};
  let queued_tiles = {
    forest: [],
    quarry: [],
  };

  function setTileAndQueue(xx, yy, type, queue) {
    game_state.setCell([xx,yy], type);
    let key = xx + yy * 1000;
    done[key] = true;
    for (let ii = 0; ii < 4; ++ii) {
      let pos = [xx + DX[ii], yy + DY[ii]];
      key = pos[0] + pos[1] * 1000;
      if (!done[key]) {
        queued_tiles[queue].push(pos);
      }
    }
  }

  setTileAndQueue(x,y, CellType.TempleUpperLeft, 'forest');
  setTileAndQueue(x+1,y, CellType.TempleUpperRight, 'forest');
  setTileAndQueue(x,y+1, CellType.TempleLowerLeft, 'forest');
  setTileAndQueue(x+1,y+1, CellType.TempleLowerRight, 'forest');

  // Add some random forest and quarry tiles to grow from
  for (let ii = 0; ii < 6; ++ii) {
    for (let jj = 0; jj < 2; ++jj) {
      let type = jj ? CellType.Forest : CellType.Quarry;
      let queue = jj ? 'forest' : 'quarry';
      while (true) {
        x = rand.range(w);
        y = rand.range(h);
        let key = x + y * 1000;
        if (done[key]) {
          continue;
        }
        let cell = game_state.getCell([x,y]);
        if (cell.type !== CellType.Meadow || cell.is_initial) {
          continue;
        }
        setTileAndQueue(x, y, type, queue);
        break;
      }
    }
  }

  // Alternatively grow from forests and quarries
  let tries = 200;
  let jj = 1;
  while (tries) {
    jj = (jj + 1) % 2;
    --tries;

    let type = jj ? CellType.Forest : CellType.Quarry;
    let queue = jj ? 'forest' : 'quarry';
    let list = queued_tiles[queue];
    if (!list.length) {
      continue;
    }
    let idx = rand.range(list.length);
    x = list[idx][0];
    y = list[idx][1];
    let key = x + y * 1000;
    if (done[key]) {
      continue;
    }
    let cell = game_state.getCell([x,y]);
    if (!cell || cell.type !== CellType.Meadow || cell.is_initial) {
      continue;
    }
    setTileAndQueue(x, y, type, queue);
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
      // this.level = 8;
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
    this.cur_face = 0;
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
      [6,7],
      [7,7],
    ].forEach((pos) => {
      let die = new Die(pos);
      die.cur_face = this.rand.range(6);
      this.dice.push(die);
      this.setInitialCell(pos, CellType.Bedroom);
    });
    [
      [4,6,CellType.StorageSeed],
      [5,6,CellType.StorageCrop],
      [4,7,CellType.StorageWood],
      [5,7,CellType.StorageStone],
      [6,5,CellType.Build],
      [6,6,CellType.KitchenLeft],
      [7,6,CellType.KitchenRight],
      [6,8,CellType.Crop],
      [7,8,CellType.Meadow],
      [8,6,CellType.Forest],
      [9,6,CellType.Quarry],
      [10,6,CellType.TownBuy],
      [11,6,CellType.TownSell],
      [10,7,CellType.TownEntertain],
      [11,7,CellType.StorageMoney],
    ].forEach((pair) => {
      this.setInitialCell(pair, pair[2]);
    });

    genMap(this);

    this.build_mode = null;
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
      // this.activateCell([6,6]);
      // setTimeout(() => {
      //   this.selectDie(1);
      //   this.activateCell([7,6]);
      // }, 500);

      // Sell test
      // this.crop = 11;
      // this.dice[0].cur_face = 5;
      // this.selectDie(0);
      // this.activateCell([11,6]);

      // Buy test
      // this.money = 25;
      // this.dice[0].cur_face = 5;
      // this.selectDie(0);
      // this.activateCell([10,6]);

      // Build test
      // this.wood = 4;
      // this.stone = 10;
      // this.money = 10;
      // this.dice[0].cur_face = 4;
      // this.selectDie(0);
      // this.activateCell([6,5]);
      // this.setExplored([8,8]);

      // Forage test
      // this.selectDie(0);
      // this.activateCell([7,8]);
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
    if (CELL_TYPES[cell.type].init === templeInit) {
      // explore all temples
      // TODO: Dialog
      this.board.forEach((row) => {
        row.forEach((cell2) => {
          if (CELL_TYPES[cell2.type].init === templeInit) {
            cell2.explored = true;
            cell2.init(this);
          }
        });
      });
    }
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
    this.board[pos[1]][pos[0]].is_initial = true;
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

  dieAt(pos) {
    let { dice } = this;
    for (let ii = 0; ii < dice.length; ++ii) {
      let die = dice[ii];
      if (v2same(die.pos, pos)) {
        return ii;
      }
    }
    return -1;
  }

  freeDieAt(pos) {
    let die_idx = this.dieAt(pos);
    if (die_idx !== -1 && !this.dice[die_idx].used) {
      return die_idx;
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

  finishBuild(pos) {
    let cell = this.getCell(pos);
    let { entry } = this.build_mode;
    let { cost, wide, cell_type } = entry;
    if (cost[0]) {
      this.resourceMod(cell, 'wood', -cost[0]);
    }
    if (cost[1]) {
      this.resourceMod(cell, 'stone', -cost[1]);
    }
    if (cost[2]) {
      this.resourceMod(cell, 'money', -cost[2]);
    }

    this.setCell(pos, cell_type);
    if (wide) {
      this.setCell([pos[0]+1, pos[1]], cell_type + 1);
    }

    this.prompt = null;
    this.build_mode = null;
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
      if (!this.build_mode) {
        eatAllInput();
      }
    }

    let { board } = this;
    for (let ii = 0; ii < board.length; ++ii) {
      let row = board[ii];
      for (let jj = 0; jj < row.length; ++jj) {
        let cell = row[jj];
        let eff_type = cell.getEffType();
        eff_type.tick?.(this, cell);
      }
    }
  }
}


let game_state;
let view_origin = vec2();
let view_origin_float = vec2();
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
    hs: [1,1,1,1,1,1,1,1],
    size: [CELLDIM, CELLDIM],
  });
  sprites.faces = createSprite({
    name: 'faces',
    ws: [1,1,1,1,1,1,1,1],
    hs: [1,1],
    size: [CELLDIM, CELLDIM],
  });
  game_state = new GameState(level_def);
  v2set(view_origin_float,
    -(game_state.w * CELLDIM - game_width) / 2,
    -(game_state.h * CELLDIM - game_height) / 2
  );
  ({ font } = ui);
}

function neighborVisible(x, y) {
  let { board } = game_state;
  if (!game_state.getCell([x,y])) {
    return false;
  }
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
  let desired_progress = cell.just_advanced ? cell.just_advanced : cell.progress / cell.progress_max;
  let interp_progress = game_state.lazyInterp(`dp_${x}_${y}`,
    desired_progress, 300, easeInOut);
  if (cell.just_advanced && interp_progress === cell.just_advanced) {
    cell.just_advanced = false;
    game_state.lazyInterpReset(`dp_${x}_${y}`, 0);
  }
  let p = round(interp_progress * w);
  p = clamp(p, interp_progress ? 1 : 0, interp_progress < 1 ? w - 1 : w);
  if (p !== w) {
    drawRect(x0 + p, y0, x1, y1, z, bg_color);
    if (pmax < w/2) {
      for (let ii = 1; ii < pmax; ++ii) {
        let xx = x0 + round(ii / pmax * w);
        drawLine(xx + 0.5, y0, xx + 0.5, y1, z+0.1, 1, 1, color);
      }
    }
  }
}

function drawBoard() {
  let { board, w, h, selected_die, dice, turn_idx, build_mode } = game_state;
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
      if (neighborVisible(xx, yy+1) && !eff_type.tall) {
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
      let free_die_at = game_state.freeDieAt([xx, yy]);
      let die_at = game_state.dieAt([xx, yy]);
      let err;
      let used = cell.used_idx === turn_idx;
      let cell_selectable = any_selected && faceMatch(eff_type.need_face, dice[selected_die].getFace()) &&
        (!eff_type.check || !(err = eff_type.check(game_state, cell))) && die_at === -1 && !used;
      let die_selectable = free_die_at !== -1; // && (!any_selected || selected_die === free_die_at);
      if (build_mode) {
        cell_selectable = false;
        die_selectable = false;
        if (cell.explored && cell.type === CellType.Meadow) {
          if (build_mode.entry.wide) {
            let cell_right = game_state.getCell([xx+1, yy]);
            if (cell_right?.explored && cell_right.type === CellType.Meadow) {
              cell_selectable = true;
            }
          } else {
            cell_selectable = true;
          }
        }
      }
      let frame = eff_type.type_id;
      let x = x0 + xx * CELLDIM;
      let y = y0 + yy * CELLDIM;
      let spot_ret = spot({
        key: `cell${xx}_${yy}`,
        x: x + 1, y: y + 1, w: CELLDIM - 1, h: CELLDIM - 1,
        def: (cell_selectable || die_selectable) ? SPOT_DEFAULT_BUTTON : SPOT_DEFAULT_BUTTON_DISABLED,
        disabled_focusable: false,
      });
      let { ret, focused } = spot_ret;
      if (ret) {
        if (cell_selectable) {
          if (build_mode) {
            game_state.finishBuild([xx, yy]);
          } else {
            game_state.activateCell([xx, yy]);
          }
        } else {
          assert(die_selectable);
          game_state.selectDie(free_die_at);
        }
      }
      if (die_selectable) {
        dice[free_die_at].focused = focused;
        focused = false;
      }
      // draw cell graphics
      sprites.cells.draw({
        x, y, z: Z.CELLS,
        frame,
        color: err || (build_mode && !cell_selectable) ? fg_color_disabled : fg_color,
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
      if (build_mode) {
        if (!cell_selectable) {
          title_color_font = fg_color_font_used;
          title_color = fg_color_used;
        } else {
          text = 'BUILD';
        }
      }
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
          alpha: build_mode ? 0.5 : 1,
          size: ui.font_height,
          text: `${value}`,
        });
      }
      // Draw currency amount
      if (eff_type.currency) {
        let value = game_state[eff_type.currency];
        let eff_value = round(game_state.lazyInterp(`cur_${eff_type.currency}`, value, 500, identity));
        font.draw({
          x: x + 1, y: y - 2, z: Z.CELLS+1,
          w: CELLDIM, h: CELLDIM,
          align: font.ALIGN.HCENTERFIT | font.ALIGN.VBOTTOM,
          style: font_style_currency,
          alpha: build_mode ? 0.5 : 1,
          size: ui.font_height * 2,
          text: `${eff_value}`,
        });
      }
      // Draw available die face
      let draw_need_face = eff_type.need_face;
      let draw_dice_face = !cell.completed && !used && draw_need_face !== undefined &&
        (!eff_type.hide_face || cell_selectable);
      if (build_mode) {
        draw_dice_face = cell_selectable || !cell.explored;
        if (cell_selectable) {
          draw_need_face = Face.Build;
        }
      }
      if (draw_dice_face) {
        let color = any_selected && !cell_selectable ? fg_color_disabled : fg_color;
        if (build_mode) {
          color = cell_selectable ? fg_color : fg_color_disabled;
        }
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
          frame: draw_need_face,
          color,
        });
      }
      // Draw progress
      if (!cell.completed && cell.explored && cell.progress_max) {
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
  let { dice, selected_die, build_mode } = game_state;
  for (let ii = 0; ii < dice.length; ++ii) {
    let z = Z.DICE;
    let die = dice[ii];
    if (build_mode && build_mode.die !== die) {
      continue;
    }
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

function getVisRange() {
  let { board } = game_state;
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  for (let yy = 0; yy < board.length; ++yy) {
    let row = board[yy];
    for (let xx = 0; xx < row.length; ++xx) {
      let cell = row[xx];
      if (cell.explored) {
        minx = min(minx, xx);
        maxx = max(maxx, xx);
        miny = min(miny, yy);
        maxy = max(maxy, yy);
      }
    }
  }
  return [[minx-4, miny-4], [maxx+5, maxy+5]];
}

function doScroll() {
  let scroll_x = keyDown(KEYS.A) - keyDown(KEYS.D) + keyDown(KEYS.LEFT) - keyDown(KEYS.RIGHT);
  view_origin_float[0] += scroll_x * 0.5;
  let scroll_y = keyDown(KEYS.W) - keyDown(KEYS.S) + keyDown(KEYS.UP) - keyDown(KEYS.DOWN);
  view_origin_float[1] += scroll_y * 0.5;
  let drag_ret = drag({
    min_dist: 10,
  });
  if (drag_ret) {
    v2add(view_origin_float, view_origin_float, drag_ret.delta);
  }
  let vis_range = getVisRange();
  view_origin_float[0] = min(view_origin_float[0], -vis_range[0][0] * CELLDIM);
  view_origin_float[0] = max(view_origin_float[0], -vis_range[1][0] * CELLDIM + game_height);
  view_origin_float[1] = min(view_origin_float[1], -vis_range[0][1] * CELLDIM);
  view_origin_float[1] = max(view_origin_float[1], -vis_range[1][1] * CELLDIM + game_height);
  v2floor(view_origin, view_origin_float);
}

function statePlay(dt) {
  camera2d.setAspectFixed(game_width, game_height);
  gl.clearColor(bg_color[0], bg_color[1], bg_color[2], 0);

  doScroll();

  if (engine.DEBUG && keyDownEdge(KEYS.R)) {
    level_def.seed = `${Math.random()}`;
    game_state = new GameState(level_def);
  }

  game_state.tick(dt);

  let button_w = 200;
  let disabled = Boolean(game_state.prompt || game_state.animation);
  if (ui.button({
    x: camera2d.x1() - button_w - 4,
    y: camera2d.y1() - ui.button_height - 4,
    w: button_w,
    text: game_state.allDiceUsed() ? '[N]EXT TURN' : '[N]ext Turn (Pass)',
    disabled,
  }) || !disabled && (keyDownEdge(KEYS.N) || keyDownEdge(KEYS.RETURN))) {
    if (game_state.kitchenAvailable() && !engine.DEBUG) {
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

  drawBoard();
  drawFloaters();
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

  ui_sprites.button.ws = [24,16,24];
  ui_sprites.button.hs = [24];
  ui_sprites.button_down = { name: 'pixely/button_down', ws: [24,16,24], hs: [24] };
  ui_sprites.button_rollover = { name: 'pixely/button_over', ws: [24,16,24], hs: [24] };
  ui_sprites.panel = { name: 'panel_wood', ws: [12, 8, 12], hs: [11,2,11] };
  ui_sprites.color_set_shades = [1, 1, 0.5];

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

  ui.setFontStyles(font_style_normal, null, null, font_style_disabled);
  ui.scaleSizes(24 / 32);
  ui.setFontHeight(16);

  init();

  engine.setState(statePlay);
}
