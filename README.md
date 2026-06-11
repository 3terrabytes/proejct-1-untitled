# 🗡️ Rift — Multiplayer Browser RPG with Groq-Powered NPCs

An isometric browser RPG where every NPC — merchants, enemies, quest-givers —
is powered by Groq's free LLM API, and the world is shared: every player on the
server sees the same goblins, watches each other fight, and explores together
in real time over WebSocket.

**Stack:** Vanilla JS + HTML5 Canvas (isometric) · Node.js/Express + ws ·
Neon (PostgreSQL) · Groq API. Entirely free to run on Render + Neon + Groq free tiers.

## Features

- **Isometric world** with a camera that pans to follow you — procedurally
  drawn tiles, depth-sorted trees/houses/rocks you can walk behind, animated water
- **Shared multiplayer world** — see other players move and fight live;
  one combat lock per enemy so nobody steals your kill
- **Endless, level-scaled enemies** — a server-side spawner keeps the Goblin
  Caves stocked forever; goblins wander, and chase you on sight. Goblin Brutes
  (~20%) hit harder and drop better loot
- **Four combat moves** (keys 1-4): Slash, Heavy Strike (1.9×, 70% to hit),
  Guard (halve next hit + heal), War Cry (−30% enemy attack) — with cooldowns
- **Shop panel** — fixed prices enforced server-side, buy & sell tabs;
  you can still haggle with Edric in chat for LLM-quoted offers
- **Groq NPCs** — in-character streamed dialogue, mid-fight enemy taunts,
  per-NPC conversation memory
- **Server-authoritative progression** — XP, level-ups, gold, loot and prices
  all resolve in Express against Neon; the client can't spoof anything

## Quick start (local)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
#   DATABASE_URL  — from neon.tech dashboard (free)
#   JWT_SECRET    — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   GROQ_API_KEY  — from console.groq.com (free, no card needed)
#   GROQ_MODEL    — llama-3.1-8b-instant

# 3. Create the database tables
npm run migrate

# 4. Run it
npm run dev    # http://localhost:3000
```

No build step — the frontend is served straight from `/public`.

## How to play

| Key | Action |
|-----|--------|
| WASD / arrows | Move (camera follows) |
| **E** | Talk to NPC / fight the enemy you're facing |
| **1-4** | Combat moves: Slash · Heavy Strike · Guard · War Cry |
| **I** | Inventory (equip gear, drink potions) |
| **F** | Friends (search, request, accept; 🟢 shows who's online) |
| Esc | Close panels |

- **Edric the blacksmith**: press E → 🛒 Shop button for fixed prices, or chat
  to haggle (his JSON offers become Buy buttons)
- **Elder Mara** speaks in riddles and hands out quests
- **Goblins** wander the caves east of the village and chase anyone who gets
  close — combat starts automatically when one catches you. They scale with
  your level, respawn forever, and taunt you mid-fight via Groq

## Architecture

```
/public                  ← static frontend, no build step
  /js
    main.js              ← entry point, 60fps loop, camera target, auto-engage
    world.js             ← isometric renderer + camera (prerendered ground)
    sprites.js           ← all procedural art (tiles, blocks, characters)
    net.js               ← WebSocket client, remote players + enemy mirror
    player.js            ← grid movement + collision
    npc.js               ← friendly NPCs, interaction lookup
    combat.js            ← 4-move turn combat, server-arbitrated damage
    ui.js                ← HUD, chat, shop, inventory, friends
    api.js               ← REST calls + SSE streaming
    items.json           ← item catalogue (shared with the server)
    npcs.json            ← NPC definitions (shared with the server)
/server
  index.js               ← Express app + WebSocket upgrade
  /game
    state.js             ← shared world: spawner, wander/chase AI, combat, rewards
    ws.js                ← JWT-authenticated socket hub, heartbeats
  /routes                ← auth, player, friends, shop, ai (Groq proxy)
  /lib                   ← progression (level-ups), catalogue
/db/migrate.js           ← creates all tables
```

### Key design points

- **The server owns the world.** Enemy positions, spawning, engagement locks,
  damage caps and kill rewards all live in `server/game/state.js`. Clients
  mirror that state over WebSocket and only render/predict.
- **One Groq proxy endpoint** (`POST /api/ai/npc`): API key stays server-side,
  replies stream as SSE, model swaps via `GROQ_MODEL`.
- **Shared data files**: `items.json` / `npcs.json` are fetched by the browser
  and `fs.readFileSync`'d by the server — one source of truth for stats and prices.
- **Free-tier friendly**: in-memory world state on a single instance, Neon HTTP
  driver for stateless DB calls, WebSocket reconnect with backoff for Render
  cold starts.

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` · `/login` | Account + JWT |
| GET | `/api/auth/me` | Current player profile |
| GET | `/api/player/stats` · `/inventory` | Stats / items |
| POST | `/api/player/xp` · `/hp` · `/gold` | Progression (validated/clamped) |
| POST | `/api/player/inventory` | Add item (LLM-negotiated price allowed) |
| POST | `/api/player/equip/:itemId` | Equip/unequip toggle |
| DELETE | `/api/player/inventory/:itemId` | Consume/discard |
| POST | `/api/shop/buy` · `/sell` | Fixed-price shop (server-side prices) |
| GET/POST/DELETE | `/api/friends/...` | Friends system |
| POST | `/api/ai/npc` | NPC chat → Groq → streamed SSE reply |
| GET/POST | `/api/ai/memory/:npcId` | Per-NPC conversation memory |
| WS | `/ws?token=JWT` | Shared world: presence, enemies, combat |

## Deploy to Render

1. Push this repo to GitHub
2. Create a **Web Service** on Render → connect the repo
3. Build command: `npm install` · Start command: `node server/index.js`
4. Add env vars: `DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY`, `GROQ_MODEL`
5. Run `npm run migrate` once (locally, pointed at the Neon URL) → Deploy

Render's free tier supports WebSockets. Note the instance sleeps after ~15 min
idle — the first visit wakes it (~30s) and the game auto-reconnects.

Total cost: **£0/month.**
