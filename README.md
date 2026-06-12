# 🗡️ Rift — Multiplayer Browser RPG with AI-Powered NPCs

The Rift tore the sky and four shards fell across the land. Cross four biomes,
take the shards back from the dens' strongest beasts, and seal the Rift at the
altar beyond the ashlands. Every NPC — merchants, enemies, quest-givers — is
powered by a free AI model, and the world is shared with everyone online.

**Stack:** Vanilla JS + HTML5 Canvas (isometric) · Node.js/Express + ws ·
Neon (PostgreSQL) · free AI API. Entirely free to run on free hosting tiers.

## Features

- **A huge 200×70 world, no lag** — the renderer culls to the viewport, so only
  the ~1,500 visible tiles are drawn each frame regardless of map size
- **Four biomes with level gates** — Verdant Meadows → Sunscorch Desert (Lv 3)
  → Mistveil Rainforest (Lv 6) → Ember Ashlands (Lv 10), each with its own
  tiles, flora, cave den and monsters
- **A story with an ending** — collect the four Rift Shards (each guarded by a
  den's strongest beast, guaranteed drop) and seal the Rift at the altar.
  Journal on **Q** tracks shards and your current objective
- **Optional fights on a dedicated battle screen** — enemies never force combat;
  press E to challenge one and the view switches to a battle scene with slide-in
  intros, lunges, slash arcs, damage numbers, screen shake, particles, guard
  shimmers, war-cry shockwaves and victory/defeat banners
- **Enemies only live in caves** — they wander and chase inside their den but
  are leashed to it; the roads are safe
- **Endless spawns** — the server keeps every den stocked forever; respawns roll
  fresh levels from each monster's range (Goblin Grunt Lv 1-3 … Flame Tyrant Lv 12-14)
- **Wandering merchants** — four travelling traders amble around the roads of
  each biome selling region-appropriate gear
- **Weather** — rain, storms with lightning, sandstorms, heat shimmer, mist,
  ember drift and ashfall, per biome, deterministic so all players see the same sky
- **Shared multiplayer world over WebSocket** — live players, shared enemies,
  one combat lock per enemy, reconnect with backoff
- **AI NPCs** — in-character streamed dialogue, mid-fight taunts, per-NPC memory
- **Server-authoritative everything** — XP/level-ups, gold, loot, shard drops,
  shop prices, biome gates and damage caps all enforced server-side

## Quick start (local)

```bash
npm install
cp .env.example .env
#   DATABASE_URL  — from neon.tech dashboard (free)
#   JWT_SECRET    — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   AI_API_KEY    — free key from console.groq.com (no card needed)
#   AI_MODEL      — llama-3.1-8b-instant
npm run migrate
npm run dev        # http://localhost:3000
```

No build step. The map is committed (`public/assets/maps/world.json`);
regenerate it with `node tools/genmap.js` after editing the generator.

## How to play

| Key | Action |
|-----|--------|
| WASD / arrows | Move (camera follows) |
| **E** | Talk / trade / fight (optional!) / use the altar |
| **1-4** | Battle moves: Slash · Heavy Strike · Guard · War Cry |
| **Q** | Journal — story, shards, current objective |
| **I** | Inventory · **F** Friends · Esc closes panels |

The road runs west→east through every biome. Dens are north of the road —
that's where the shards (and the XP) are. Buy gear from Edric in the village
or from the wandering merchants in later biomes; you'll need it.

## Architecture

```
/public
  /js
    main.js        ← game loop, input, DPR scaling, screen switching
    world.js       ← viewport-culled isometric renderer + camera + ambience
    sprites.js     ← all procedural art (tiles, blocks, 8 monsters, NPCs, altar)
    battle.js      ← battle screen: tweens, particles, damage numbers, banners
    combat.js      ← combat rules + server conversation
    weather.js     ← per-biome particle weather, clock-deterministic
    story.js       ← intro, journal, shard tracking, ending
    net.js         ← WebSocket client (players/enemies/merchants mirrors)
    npc.js / ui.js / api.js / items.js / auth.js / player.js
    items.json / npcs.json   ← shared with the server
  /assets/maps/world.json    ← generated 200×70 four-biome map
/server
  /game/state.js   ← world sim: per-den spawners, wander/chase AI, merchants,
                     gates, combat arbitration, rewards + shard drops
  /game/ws.js      ← JWT-authenticated socket hub
  /routes          ← auth, player, friends, shop, ai (LLM proxy)
  /lib             ← progression, shared catalogue
/tools/genmap.js   ← deterministic map generator
/db/migrate.js
```

### Performance notes

- Tile/block art is prerendered once into offscreen canvases at startup;
  per frame it's ~1,500 `drawImage` calls for the visible slice plus entities
- Entities outside the view are skipped; weather is screen-space particles
- The server ticks the whole world (20 enemies + 4 merchants) at 5 Hz —
  negligible CPU, fits Render's free tier

## Deploy to Render

1. Push to GitHub → create a **Web Service** → connect the repo
2. Build: `npm install` · Start: `node server/index.js`
3. Env vars: `DATABASE_URL`, `JWT_SECRET`, `AI_API_KEY`, `AI_MODEL`
4. `npm run migrate` once locally against the Neon URL → Deploy

Total cost: **£0/month.**
