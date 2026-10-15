'use strict';
// The game's version and release notes. For every release:
//   1. bump GAME_VERSION (major.minor.patch)
//   2. add an entry at the top of RELEASE_NOTES
// Running games poll this file and offer a reload when GAME_VERSION changes.

const GAME_VERSION = '1.3.0';

const RELEASE_NOTES = [
  {
    version: '1.3.0',
    date: '2026-10-14',
    notes: [
      'The game now checks for new versions and asks you to reload when one is out. Your progress is saved first.',
      'New ❓ Help menu with a how-to-play guide, the version number and these release notes.',
      'A short tutorial for new heroes, and you can replay it any time from Help.',
      'A "What\'s new" pop-up after each update.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-14',
    notes: [
      'Tapping an item opens a pop-up with Equip, Salvage and Sell right at the top, so no more scrolling on phones.',
      'The Forge uses the same pop-up, with Upgrade as the first button.',
      'The HUD and menus now stay clear of the iPhone notch, the Dynamic Island and the home bar.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-14',
    notes: [
      'Detailed heroes and monsters with walking animations, and enemies leave corpses when they die.',
      'Equipped gear shows on your hero: helms, armor, shields, weapons and more.',
      '8 gear slots, with new weapons (axes, maces, daggers, staffs) plus shields, orbs and tomes.',
      'Loot pops out of enemies, and every floor has treasure chests. Bosses leave a golden chest.',
      'Crafting materials and the ⚒️ Forge: upgrade gear to +10, reroll bonuses and salvage items.',
      'Permanent ⭐ Upgrades bought with gold.',
      'A green/red stat comparison before you equip an item.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-14',
    notes: [
      'First release: endless random dungeons, with a boss every 5th floor.',
      'Five skills that level up as you use them: Slash, Fireball, Frost Nova, Chain Lightning and Whirlwind.',
      'Character levels, attribute points, loot, potions and auto-save.',
      'Touch controls for phones, plus keyboard controls.',
    ],
  },
];

// Compares "1.2.10" style versions: > 0 if a is newer than b.
function versionCmp(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}
