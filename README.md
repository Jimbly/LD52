LD52 - Harvest
============================

Ludum Dare 52 Entry by Jimbly - "Dice Settlers"

* Play here: [dashingstrike.com/LudumDare/LD52/](http://www.dashingstrike.com/LudumDare/LD52/)
* Using [Javascript libGlov/GLOV.js framework](https://github.com/Jimbly/glovjs)

Start with: `npm start` (after running `npm i` once)

* Polish / Next:
  * building needs progress
  * building gives base progress/XP to start
  * SFX
    * gain resource
    * gain XP
    * level up (always follows gain XP)
  * story pop-ups
  * tooltips
    * showing dice faces
    * describing room function/etc - only show required die face during mouseover
  * unity chamber animation of merging, same for cuddle room
  * Active dice pulse glowing
  * shift click or double-tap a slot if auto-assignable die
  * vignette
  * colors shift
    * during cuddle / combine / entertain


Design notes
===

* Map (hexes? squares?)
  * Rooms
    * [ ] Bedroom (space for a die) (start with 2, or a bunkbed room)
    * [STUDY] Study (train current face) (increasing cost, or just gives XP and increasing XP per level?)
    * [COOK] / [ASSIGN] Kitchen (2x1) (power with one die, other die sets face)
    * [REROLL] Exercise Room (reroll a die)
    * [UPGRADE] Upgrade Chamber (2x1) (combine 2 dice to power up faces)
    * [CUDDLE] Cuddle Room (2x1) (takes 2 dice, get one die back each turn for 3 turns)
    * [REPLACE] Library (2x1) (replace a face with the specified book (not necessarily level 1))
    * [POETRY] Parlor (Entertain causes +XP to all non-entertainer dice)
    * only one of:
      * storage for stone/wood/seeds/crops
      * [BUILD] room to start a new construction (builder provides initial progress)
  * [SOW] / [TEND] / [HARVEST] Crop plot (start with 1)
  * [BUILD] Field (start with 1), can build room or crop plot
  * [FORAGE] Meadow (just forage, ready to be built upon)
  * [CHOP] Forest (gather wood, cleared when out of resources)
  * [MINE] Quarry (gather stone, cleared when out of resources)
  * [EXPLORE] Ruin (explore for chance of money or tools)
  * [EXPLORE] Unexplored
  * Town slots
    * [BUY]
    * [SING]
    * [SELL]
    * [BANK]
* Dice faces:
  * Farm
    * Sow (x2), water (x6), harvest (xN?)
  * Gather
    * Wood, stone
  * Explore
    * Forage in meadow/forest/quarry
    * Make progress towards revealing unexplored tiles
  * Trade
    * General Store: Buy seeds, fertilizer (Power purchases, also discount of Power?)
    * Bookstore: buy books (discount of Power, Power of books also influenced)
    * Port: Sell crops (max Power sold, also bonus of Power?)
    * NO: Tavern: Recruit new Settler (must do this first) (see Power+1 options)
  * Build
    * Clear space (removes wood/stone at double rate, but doesn't get resources back, or just 1)
    * Build a room/crop plot (make progress)
    * ? Destroy a room
    * Fence a meadow
    * Fertilize?
    * Upgrade a room?
    * Cook?
  * Entertain
    * Town: Earn a little money
    * Parlor
* Forage results
  * small wood, stone,
  * seeds
  * crops
  * rarely, money

* Goal / End condition?
  * Find and complete a giant ruin?
    * Find clues along the way as to where it might be
    * Requires approximately 3 fully upgraded dice (maybe: sacrificing one in a turn to see the next stage)
    * Find clues along the way as to what jobs it will require
  * Money amount
    * in fixed turn limit, with high score list?  Not very satisfying...
    * Goal of a particular amount of money (something to buy in the shop to win the game)

* Balance
  * Crops: 3+ actions, 14+ levels => 8 crops
  * Entertain:  L1: 3 actions / 3 levels => 1.5 money;  L8: 3 actions/24 levels => 12 money
  * Seeds: cost 5 crops
  * Gather: 1 action, level === wood/stone
  * Forage: 32 level 1 forages (diminishing returns at higher levels) =
    4 crops
    2 seeds (value=5)
    1 money
    12 stone
    13 wood
