// Server-authoritative shared world: connected players, per-biome enemy
// spawning (caves only), wander/chase AI, wandering merchants, biome gates,
// combat arbitration and kill rewards (including story shard drops).
// Everything here is in-memory (single instance) — persistent data lives in Neon.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../db.js';
import { NPCS, getItem } from '../lib/catalog.js';
import { awardXp, addGold } from '../lib/progression.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(
  readFileSync(path.join(__dirname, '../../public/assets/maps/world.json'), 'utf8')
);

const TICK_MS = 200;
const CHASE_RADIUS = 4;
const SPAWN_MIN_DIST = 4;
const RESPAWN_DELAY_MS = [3000, 8000];
const ENEMIES_PER_CAVE = 5;

const ENEMY_DEFS = NPCS.filter((npc) => npc.role === 'enemy');
const MERCHANT_DEFS = NPCS.filter((npc) => npc.role === 'merchant');
const FRIENDLY_TILES = new Set(
  NPCS.filter((npc) => npc.x !== undefined).map((npc) => `${npc.x},${npc.y}`)
);

// Loot tables per enemy def: [chance, item name], checked top to bottom.
// Shard drops are handled separately (guaranteed until owned).
const LOOT_TABLES = {
  goblin_grunt: [[0.28, 'Health Potion'], [0.25, 'Goblin Ear'], [0.07, 'Rusty Dagger']],
  goblin_brute: [[0.3, 'Greater Potion'], [0.25, 'Goblin Ear'], [0.12, 'Brute Cleaver'], [0.08, 'Iron Helm']],
  sand_scorpion: [[0.35, 'Scorpion Stinger'], [0.2, 'Health Potion'], [0.1, 'Greater Potion']],
  bandit_raider: [[0.3, 'Greater Potion'], [0.2, 'Scorpion Stinger'], [0.06, 'Scimitar']],
  jungle_viper: [[0.35, 'Viper Fang'], [0.25, 'Greater Potion']],
  shadow_panther: [[0.25, 'Viper Fang'], [0.2, 'Elixir of Dawn'], [0.06, 'Panther Cloak']],
  ember_imp: [[0.35, 'Ember Core'], [0.15, 'Elixir of Dawn']],
  flame_tyrant: [[0.4, 'Elixir of Dawn'], [0.3, 'Ember Core'], [0.08, 'Obsidian Edge']]
};

const randBetween = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

class GameWorld {
  constructor() {
    this.players = new Map();
    this.enemies = new Map();
    this.merchants = new Map();
    this.nextEnemyId = 1;
    this.spawnPoint = map.spawn;

    // Per-biome cave floor tiles — the only ground enemies may stand on.
    this.caves = map.biomes.map((biome) => {
      const tiles = [];
      const { x1, y1, x2, y2 } = biome.cave;
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          if (map.rows[y][x] === 'c') tiles.push({ x, y });
        }
      }
      const pool = ENEMY_DEFS.filter((def) => def.biome === biome.id);
      return { biome: biome.id, rect: biome.cave, tiles, pool, pending: 0 };
    });

    for (const def of MERCHANT_DEFS) {
      this.merchants.set(def.id, {
        id: def.id,
        name: def.name,
        sprite: def.sprite,
        x: def.wander.x,
        y: def.wander.y,
        anchor: def.wander,
        nextMoveAt: Date.now() + randBetween(1000, 3000)
      });
    }

    setInterval(() => this.tick(), TICK_MS).unref();
  }

  tileAt(x, y) {
    const row = map.rows[y];
    return row && x >= 0 && x < row.length ? row[x] : null;
  }

  walkable(x, y) {
    const tile = this.tileAt(x, y);
    if (tile === null || map.legend[tile]?.solid) return false;
    return !FRIENDLY_TILES.has(`${x},${y}`);
  }

  biomeAt(x) {
    return map.biomes.find((b) => x >= b.x1 && x <= b.x2) || null;
  }

  // ---------- messaging ----------

  broadcast(msg, exceptId = null) {
    const data = JSON.stringify(msg);
    for (const player of this.players.values()) {
      if (player.id === exceptId) continue;
      if (player.socket.readyState === 1) player.socket.send(data);
    }
  }

  sendTo(playerId, msg) {
    const player = this.players.get(playerId);
    if (player && player.socket.readyState === 1) player.socket.send(JSON.stringify(msg));
  }

  enemyView(enemy) {
    return {
      id: enemy.id,
      defId: enemy.def.id,
      name: `${enemy.def.name} Lv ${enemy.level}`,
      sprite: enemy.def.sprite,
      biome: enemy.def.biome,
      level: enemy.level,
      x: enemy.x,
      y: enemy.y,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      attack: enemy.attack,
      defence: enemy.defence,
      engagedBy: enemy.engagedBy
    };
  }

  merchantView(m) {
    return { id: m.id, name: m.name, sprite: m.sprite, x: m.x, y: m.y };
  }

  playerView(player) {
    return {
      id: player.id,
      username: player.username,
      level: player.level,
      x: player.x,
      y: player.y,
      facing: player.facing
    };
  }

  // ---------- player lifecycle ----------

  addPlayer(id, username, level, socket) {
    const existing = this.players.get(id);
    if (existing) {
      try { existing.socket.close(4000, 'Logged in elsewhere'); } catch { /* gone */ }
      this.removePlayer(id, true);
    }
    const player = {
      id, username, level, socket,
      x: this.spawnPoint.x, y: this.spawnPoint.y, facing: 'down'
    };
    this.players.set(id, player);
    this.broadcast({ t: 'player_join', player: this.playerView(player) }, id);
    this.sendTo(id, {
      t: 'welcome',
      you: this.playerView(player),
      players: [...this.players.values()].filter((p) => p.id !== id).map((p) => this.playerView(p)),
      enemies: [...this.enemies.values()].map((e) => this.enemyView(e)),
      merchants: [...this.merchants.values()].map((m) => this.merchantView(m))
    });
  }

  removePlayer(id, silent = false) {
    if (!this.players.has(id)) return;
    this.freeEngagedEnemies(id);
    this.players.delete(id);
    if (!silent) this.broadcast({ t: 'player_leave', id });
  }

  movePlayer(id, x, y, facing) {
    const player = this.players.get(id);
    if (!player) return;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !this.walkable(x, y)) return;

    // Biome gates: you must be strong enough for the lands beyond.
    const targetBiome = this.biomeAt(x);
    const currentBiome = this.biomeAt(player.x);
    if (targetBiome && targetBiome !== currentBiome && targetBiome.gate
        && player.level < targetBiome.gate.minLevel && x > player.x) {
      this.sendTo(id, {
        t: 'gate_blocked',
        biome: targetBiome.name,
        minLevel: targetBiome.gate.minLevel
      });
      return;
    }

    player.x = x;
    player.y = y;
    if (['up', 'down', 'left', 'right'].includes(facing)) player.facing = facing;
    this.broadcast({ t: 'player_move', id, x, y, facing: player.facing }, id);
  }

  // ---------- enemies ----------

  spawnEnemy(cave) {
    const players = [...this.players.values()];
    const candidates = cave.tiles.filter((tile) => {
      if (this.enemyAt(tile.x, tile.y)) return false;
      return players.every((p) => chebyshev(p, tile) >= SPAWN_MIN_DIST);
    });
    if (candidates.length === 0 || cave.pool.length === 0) return;
    const tile = candidates[Math.floor(Math.random() * candidates.length)];

    const roll = Math.random();
    let cumulative = 0;
    let def = cave.pool[0];
    for (const candidate of cave.pool) {
      cumulative += candidate.spawnWeight ?? 1 / cave.pool.length;
      if (roll < cumulative) { def = candidate; break; }
    }

    const base = def.stats;
    const level = randBetween(def.levelRange[0], def.levelRange[1]);
    const over = level - def.levelRange[0];
    const enemy = {
      id: this.nextEnemyId++,
      def,
      cave,
      level,
      x: tile.x,
      y: tile.y,
      hp: base.hp + 14 * over,
      maxHp: base.hp + 14 * over,
      attack: base.attack + 2 * over,
      defence: base.defence + over,
      xpReward: Math.min(400, base.xpReward + 14 * over),
      goldMin: Math.min(200, base.goldDrop[0] + 3 * over),
      goldMax: Math.min(200, base.goldDrop[1] + 6 * over),
      engagedBy: null,
      nextMoveAt: Date.now() + randBetween(500, 1500)
    };
    this.enemies.set(enemy.id, enemy);
    this.broadcast({ t: 'enemy_spawn', enemy: this.enemyView(enemy) });
  }

  enemyAt(x, y) {
    for (const enemy of this.enemies.values()) {
      if (enemy.x === x && enemy.y === y) return enemy;
    }
    return null;
  }

  tick() {
    const now = Date.now();

    // Keep every cave stocked — endless enemies, but only in caves.
    for (const cave of this.caves) {
      const alive = [...this.enemies.values()].filter((e) => e.cave === cave).length;
      const deficit = ENEMIES_PER_CAVE - alive - cave.pending;
      for (let i = 0; i < deficit; i++) {
        cave.pending++;
        setTimeout(() => {
          cave.pending--;
          this.spawnEnemy(cave);
        }, randBetween(...RESPAWN_DELAY_MS)).unref();
      }
    }

    // Enemy wander / chase (leashed to their cave floor).
    const moves = [];
    for (const enemy of this.enemies.values()) {
      if (enemy.engagedBy || now < enemy.nextMoveAt) continue;

      let target = null;
      let bestDist = CHASE_RADIUS + 1;
      for (const player of this.players.values()) {
        const dist = chebyshev(player, enemy);
        if (dist < bestDist) { bestDist = dist; target = player; }
      }

      let step = null;
      if (target && bestDist > 1) {
        step = this.stepToward(enemy, target);
      } else if (!target && Math.random() < 0.6) {
        step = this.randomStep(enemy);
      }
      if (step) {
        enemy.x = step.x;
        enemy.y = step.y;
        moves.push({ id: enemy.id, x: step.x, y: step.y });
      }
      enemy.nextMoveAt = now + (target ? 350 : 650) + randBetween(0, 400);
    }
    if (moves.length) this.broadcast({ t: 'enemies_move', moves });

    // Wandering merchants amble around their patch of road.
    const merchantMoves = [];
    for (const merchant of this.merchants.values()) {
      if (now < merchant.nextMoveAt) continue;
      merchant.nextMoveAt = now + randBetween(1200, 2800);
      if (Math.random() < 0.45) continue; // they like to linger
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5);
      for (const [dx, dy] of dirs) {
        const x = merchant.x + dx;
        const y = merchant.y + dy;
        if (!this.merchantCanStep(merchant, x, y)) continue;
        merchant.x = x;
        merchant.y = y;
        merchantMoves.push({ id: merchant.id, x, y });
        break;
      }
    }
    if (merchantMoves.length) this.broadcast({ t: 'merchants_move', moves: merchantMoves });
  }

  merchantCanStep(merchant, x, y) {
    const tile = this.tileAt(x, y);
    if (tile === null || map.legend[tile]?.solid) return false;
    if (tile === 'c' || tile === 'G') return false; // stay out of caves and gates
    if (Math.max(Math.abs(x - merchant.anchor.x), Math.abs(y - merchant.anchor.y)) > merchant.anchor.radius) return false;
    if (FRIENDLY_TILES.has(`${x},${y}`)) return false;
    for (const other of this.merchants.values()) {
      if (other !== merchant && other.x === x && other.y === y) return false;
    }
    for (const player of this.players.values()) {
      if (player.x === x && player.y === y) return false;
    }
    return true;
  }

  enemyCanStep(enemy, x, y) {
    if (this.tileAt(x, y) !== 'c') return false;
    const { x1, y1, x2, y2 } = enemy.cave.rect;
    if (x < x1 || x > x2 || y < y1 || y > y2) return false; // leashed to its cave
    if (this.enemyAt(x, y)) return false;
    for (const player of this.players.values()) {
      if (player.x === x && player.y === y) return false;
    }
    return true;
  }

  stepToward(enemy, target) {
    const dx = Math.sign(target.x - enemy.x);
    const dy = Math.sign(target.y - enemy.y);
    const tries = Math.abs(target.x - enemy.x) >= Math.abs(target.y - enemy.y)
      ? [[dx, 0], [0, dy]]
      : [[0, dy], [dx, 0]];
    for (const [sx, sy] of tries) {
      if ((sx || sy) && this.enemyCanStep(enemy, enemy.x + sx, enemy.y + sy)) {
        return { x: enemy.x + sx, y: enemy.y + sy };
      }
    }
    return null;
  }

  randomStep(enemy) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5);
    for (const [sx, sy] of dirs) {
      if (this.enemyCanStep(enemy, enemy.x + sx, enemy.y + sy)) {
        return { x: enemy.x + sx, y: enemy.y + sy };
      }
    }
    return null;
  }

  // ---------- combat ----------

  engage(playerId, enemyId) {
    const player = this.players.get(playerId);
    const enemy = this.enemies.get(Number(enemyId));
    if (!player) return;
    if (!enemy) {
      return this.sendTo(playerId, { t: 'engage_denied', enemyId, reason: 'It is already gone' });
    }
    if (enemy.engagedBy && enemy.engagedBy !== playerId) {
      const other = this.players.get(enemy.engagedBy);
      return this.sendTo(playerId, {
        t: 'engage_denied', enemyId,
        reason: `${other?.username || 'Someone'} is already fighting it`
      });
    }
    // Allow 2 tiles so an enemy mid-wander can't dodge your button press.
    if (chebyshev(player, enemy) > 2) {
      return this.sendTo(playerId, { t: 'engage_denied', enemyId, reason: 'Too far away' });
    }
    enemy.engagedBy = playerId;
    this.sendTo(playerId, { t: 'engage_ok', enemy: this.enemyView(enemy) });
    this.broadcast({ t: 'enemy_engaged', id: enemy.id, by: playerId }, playerId);
  }

  freeEngagedEnemies(playerId) {
    for (const enemy of this.enemies.values()) {
      if (enemy.engagedBy === playerId) {
        enemy.engagedBy = null;
        enemy.nextMoveAt = Date.now() + 1200;
        this.broadcast({ t: 'enemy_freed', id: enemy.id });
      }
    }
  }

  async attack(playerId, enemyId, damage) {
    const player = this.players.get(playerId);
    const enemy = this.enemies.get(Number(enemyId));
    if (!player || !enemy || enemy.engagedBy !== playerId) return;

    // Sanity-cap claimed damage: generous, but no one-shotting from a hacked client.
    const cap = 80 + player.level * 12;
    const dealt = Math.min(Math.max(1, Math.floor(Number(damage) || 1)), cap);
    enemy.hp = Math.max(0, enemy.hp - dealt);

    if (enemy.hp > 0) {
      this.broadcast({ t: 'enemy_hp', id: enemy.id, hp: enemy.hp });
      return;
    }

    this.enemies.delete(enemy.id);
    this.broadcast({ t: 'enemy_dead', id: enemy.id, by: playerId });

    try {
      const { stats, levelsGained } = await awardXp(sql, playerId, enemy.xpReward);
      const gold = randBetween(enemy.goldMin, enemy.goldMax);
      const finalStats = gold > 0 ? await addGold(sql, playerId, gold) : stats;
      const loot = await this.rollLoot(playerId, enemy.def);

      if (player.level !== finalStats.level) {
        player.level = finalStats.level;
        this.broadcast({ t: 'player_update', id: playerId, level: player.level }, playerId);
      }
      this.sendTo(playerId, {
        t: 'rewards',
        xp: enemy.xpReward,
        gold,
        loot,
        levelsGained,
        stats: finalStats
      });
    } catch (err) {
      console.error('kill rewards failed:', err);
      this.sendTo(playerId, { t: 'error', message: 'Could not save your rewards' });
    }
  }

  async rollLoot(playerId, def) {
    // Story shards: the den's strongest beast always yields its shard
    // until the player owns it.
    if (def.shardDrop) {
      const [owned] = await sql`
        SELECT id FROM inventory
        WHERE player_id = ${playerId} AND item_name = ${def.shardDrop}
      `;
      if (!owned) {
        await this.giveItem(playerId, def.shardDrop);
        return def.shardDrop;
      }
    }
    const table = LOOT_TABLES[def.id] || [];
    const roll = Math.random();
    let cumulative = 0;
    for (const [chance, itemName] of table) {
      cumulative += chance;
      if (roll < cumulative) {
        await this.giveItem(playerId, itemName);
        return itemName;
      }
    }
    return null;
  }

  async giveItem(playerId, itemName) {
    const item = getItem(itemName);
    if (!item) return;
    await sql`
      INSERT INTO inventory (player_id, item_name, item_type, slot, stats)
      VALUES (${playerId}, ${item.name}, ${item.type}, ${item.slot},
              ${item.stats ? JSON.stringify(item.stats) : null})
    `;
  }
}

export const world = new GameWorld();
