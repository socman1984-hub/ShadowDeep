# Shadowdeep

A dark-fantasy hack-and-slash action RPG for phones, built with plain HTML5 canvas and JavaScript. There are no dependencies and no build step.

## Features
- Endless, randomly generated dungeon floors, with a boss every 5th floor and a new theme every 3 floors
- Five skills that level up as you use them: Slash, Fireball, Frost Nova, Chain Lightning and Whirlwind
- Character levels with attribute points (Strength, Intellect, Vitality)
- Loot in 4 rarities (Common, Magic, Rare, Legendary) across 8 gear slots, and equipped gear shows on your hero
- Treasure chests and crafting materials
- Forge: upgrade items from +1 to +10, reroll bonuses, and salvage unwanted gear
- Permanent upgrades bought with gold
- Touch controls (joystick on the left, skill buttons on the right) plus keyboard controls
- Saves automatically in the browser

## Play locally
Serve the folder with any static web server, then open it in a browser:

```bash
python -m http.server 8000
```

To play on your phone, connect it to the same Wi-Fi and open `http://<your-computer-ip>:8000`. Add it to your Home Screen to play fullscreen.

**Keyboard:** WASD to move · Space to slash · 1–4 for spells · Q for a potion · C / K / I / F / U to open the menus

## Project layout
| File | Purpose |
|---|---|
| `js/data.js` | Skills, enemies, items, forge costs, upgrades. All balance numbers live here. |
| `js/game.js` | Game state, combat, progression, loot, saving |
| `js/map.js` | Dungeon generation, collision, pathfinding |
| `js/characters.js` | Procedural character art and gear visuals |
| `js/render.js` | World rendering, effects, lighting |
| `js/ui.js` | HUD and menus (Hero, Skills, Gear, Forge, Upgrades) |
| `js/input.js` | Touch joystick, buttons, keyboard |
