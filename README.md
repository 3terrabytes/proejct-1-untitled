# 🗡️ Ashveil — Browser RPG with Groq-Powered NPCs

A browser-based top-down RPG where every NPC — merchants, enemies, quest-givers —
is powered by Groq's free LLM API. Explore a tile-based world, chat with NPCs that
respond in character, fight goblins, collect gear, level up, and add friends.

**Stack:** Vanilla JS + HTML5 Canvas · Node.js/Express · Neon (PostgreSQL) · Groq API.
Entirely free to run on Render + Neon + Groq free tiers.

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
| WASD / arrows | Move |
| **E** | Talk to NPC / fight enemy you're facing |
| **I** | Inventory (equip gear, drink potions) |
| **F** | Friends (search, request, accept) |
| Esc | Close panels |

- **Edric the blacksmith** sells weapons and armour — ask him what he has and he'll
  quote a price (the offer appears as a Buy button).
- **Elder Mara** speaks in riddles and hands out quests.
- **Goblins** in the caves to the east taunt you mid-fight (Groq-generated),
  drop gold, potions and the occasional dagger, and respawn after 30 seconds.
- NPCs remember your last conversation (`npc_memory` table) and bring it up next time.

## Architecture

```
/public            ← static frontend, no build step
  /js
    main.js        ← entry point, 60fps game loop
    world.js       ← tile map rendering (Canvas 2D)
    player.js      ← grid movement + collision
    npc.js         ← NPC definitions + instances
    combat.js      ← turn-based combat, Groq taunts
    ui.js          ← HUD, chat, inventory, friends
    api.js         ← all fetch() calls + SSE streaming
    auth.js        ← login/register screens
    npcs.json      ← NPC definitions (shared with the server)
  /assets/maps/town.json   ← tile map
/server
  index.js         ← Express app
  db.js            ← Neon HTTP driver
  /routes          ← auth, player, friends, ai (Groq proxy)
  /middleware      ← JWT auth
/db/migrate.js     ← creates all tables
```

### Key design points

- **One Groq proxy endpoint** (`POST /api/ai/npc`): the API key stays server-side,
  responses stream back to the browser as SSE, and swapping models is a one-line
  env change (`GROQ_MODEL`).
- **Server-authoritative progression**: XP awards, level-ups, gold and purchases
  are all resolved in Express against Neon — the client can't spoof a level.
- **Merchant offers as JSON**: NPCs embed `{"action":"offer","item":"Iron Shield","price":80}`
  in their reply; the client parses it into a Buy button.
- **Stateless backend**: every request stands alone (JWT + Neon HTTP driver),
  which suits Render's free tier.

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account, returns JWT |
| POST | `/api/auth/login` | Validate credentials, returns JWT |
| GET | `/api/auth/me` | Current player profile |
| GET | `/api/player/stats` | XP, level, gold, HP, attack, defence |
| POST | `/api/player/xp` | Award XP (server resolves level-ups) |
| POST | `/api/player/hp` | Sync HP after combat (clamped) |
| POST | `/api/player/gold` | Add loot gold (capped) |
| GET | `/api/player/inventory` | All items with equipped flag |
| POST | `/api/player/inventory` | Add item (optional `price` deducts gold) |
| POST | `/api/player/equip/:itemId` | Equip/unequip toggle |
| DELETE | `/api/player/inventory/:itemId` | Consume/discard item |
| GET | `/api/friends` | Accepted friends + pending requests |
| POST | `/api/friends/request` | Send request by username |
| POST | `/api/friends/accept/:id` | Accept pending request |
| DELETE | `/api/friends/:id` | Remove friend / decline request |
| POST | `/api/ai/npc` | NPC chat → Groq → streamed SSE reply |
| GET/POST | `/api/ai/memory/:npcId` | Per-NPC conversation memory |

## Deploy to Render

1. Push this repo to GitHub
2. Create a **Web Service** on Render → connect the repo
3. Build command: `npm install` · Start command: `node server/index.js`
4. Add env vars: `DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY`, `GROQ_MODEL`
5. Run `npm run migrate` once (locally, pointed at the Neon URL) → Deploy

Total cost: **£0/month.**
