// Server-authoritative shared world: connected players, enemy spawning,
// wander/chase AI, combat arbitration and kill rewards. Everything here is
// in-memory (single instance) — persistent data still lives in Neon.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../db.js';
import { NPCS, getItem } from '../lib/catalog.js';
import { awardXp, addGold } from '../lib/progression.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(
  readFileSync(path.join(__dirname, '../../public/assets/maps/town.json'), 'utf8')
);

const TICK_MS = 200;
const CHASE_RADIUS = 4;
const SPAWN_MIN_DIST = 4; // don't spawn on top of someone
const RESPAWN_DELAY_MS = [3000, 8000];
const BASE_ENEMY_COUNT = 4;
const MAX_ENEMIES = 9;

const ENEMY_DEFS = NPCS.filter((npc) => npc.role === 'enemy');
const FRIENDLY_TILES = new Set(
  NPCS.filter((npc) => npc.role !== 'enemy').map((npc) => `${npc.x},${npc.y}`)
);

// Loot tables per enemy def: [chance, item name] checked top to bottom.
const LOOT_TABLES = {
  goblin_grunt: [
    [0.28, 'Health Potion'],
    [0.25, 'Goblin Ear'],
    [0.07, 'Rusty Dagger']
  ],
  goblin_brute: [
    [0.3, 'Greater Potion'],
    [0.25, 'Goblin Ear'],
    [0.12, 'Brute Cleaver'],
    [0.08, 'Iron Helm']
  ]
};

const randBetween = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

class GameWorld {
  constructor() {
    this.players = new Map(); // playerId -> {id, username, level, x, y, facing, socket}
    this.enemies = new Map(); // enemyId -> enemy
    this.nextEnemyId = 1;
    this.pendingSpawns = 0;
    this.spawnPoint = map.spawn;

    // All cave-floor tiles ('c') — the only ground enemies may stand on,
    // which automatically leashes them to the caves.
    this.caveTiles = [];
    for (let y = 0; y < map.rows.length; y++) {
      for (let x = 0; x < map.rows[y].length; x++) {
        if (map.rows[y][x] === 'c') this.caveTiles.push({ x, y });
      }
    }

    setInterval(() => this.tick(), TICK_MS).unref();
  }

  walkable(x, y) {
    const row = map.rows[y];
    if (!row || x < 0 || x >= row.length) return false;
    if (map.legend[row[x]]?.solid) return false;
    return !FRIENDLY_TILES.has(`${x},${y}`);
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
    // One live connection per account: replace any previous socket.
    const existing = this.players.get(id);
    if (existing) {
      try { existing.socket.close(4000, 'Logged in elsewhere'); } catch { /* already gone */ }
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
      enemies: [...this.enemies.values()].map((e) => this.enemyView(e))
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
    if (chebyshev(player, { x, y }) > 3) {
      // Too big a jump for one step — accept it anyway (teleport on respawn)
      // but only if it lands somewhere legal, which we just checked.
    }
    player.x = x;
    player.y = y;
    if (['up', 'down', 'left', 'right'].includes(facing)) player.facing = facing;
    this.broadcast({ t: 'player_move', id, x, y, facing: player.facing }, id);
  }

  // ---------- enemies ----------

  averagePlayerLevel() {
    if (this.players.size === 0) return 1;
    let total = 0;
    for (const p of this.players.values()) total += p.level;
    return Math.max(1, Math.round(total / this.players.size));
  }

  targetEnemyCount() {
    return Math.min(MAX_ENEMIES, BASE_ENEMY_COUNT + this.players.size);
  }

  pickEnemyDef() {
    const roll = Math.random();
    let cumulative = 0;
    for (const def of ENEMY_DEFS) {
      cumulative += def.spawnWeight ?? 1 / ENEMY_DEFS.length;
      if (roll < cumulative) return def;
    }
    return ENEMY_DEFS[0];
  }

  spawnTile() {
    const players = [...this.players.values()];
    const candidates = this.caveTiles.filter((tile) => {
      if (this.enemyAt(tile.x, tile.y)) return false;
      return players.every((p) => chebyshev(p, tile) >= SPAWN_MIN_DIST);
    });
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  enemyAt(x, y) {
    for (const enemy of this.enemies.values()) {
      if (enemy.x === x && enemy.y === y) return enemy;
    }
    return null;
  }

  spawnEnemy() {
    const tile = this.spawnTile();
    if (!tile) return;
    const def = this.pickEnemyDef();
    const base = def.stats;
    const level = Math.max(1, this.averagePlayerLevel() + randBetween(-1, 1));
    const enemy = {
      id: this.nextEnemyId++,
      def,
      level,
      x: tile.x,
      y: tile.y,
      hp: base.hp + 12 * (level - 1),
      maxHp: base.hp + 12 * (level - 1),
      attack: base.attack + 2 * (level - 1),
      defence: base.defence + (level - 1),
      xpReward: Math.min(400, base.xpReward + 12 * (level - 1)),
      goldMin: Math.min(200, base.goldDrop[0] + 2 * (level - 1)),
      goldMax: Math.min(200, base.goldDrop[1] + 5 * (level - 1)),
      engagedBy: null,
      nextMoveAt: Date.now() + randBetween(500, 1500)
    };
    this.enemies.set(enemy.id, enemy);
    this.broadcast({ t: 'enemy_spawn', enemy: this.enemyView(enemy) });
  }

  tick() {
    const now = Date.now();

    // Keep the cave stocked — endless goblins.
    const deficit = this.targetEnemyCount() - this.enemies.size - this.pendingSpawns;
    for (let i = 0; i < deficit; i++) {
      this.pendingSpawns++;
      setTimeout(() => {
        this.pendingSpawns--;
        this.spawnEnemy();
      }, randBetween(...RESPAWN_DELAY_MS)).unref();
    }

    // Wander / chase.
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
  }

  enemyCanStep(x, y) {
    const row = map.rows[y];
    if (!row || row[x] !== 'c') return false; // cave floor only — natural leash
    if (this.enemyAt(x, y)) return false;
    for (const player of this.players.values()) {
      if (player.x === x && player.y === y) return false;
    }
    return true;
  }

  stepToward(enemy, target) {
    const dx = Math.sign(target.x - enemy.x);
    const dy = Math.sign(target.y - enemy.y);
    // Try the dominant axis first, then the other.
    const tries = Math.abs(target.x - enemy.x) >= Math.abs(target.y - enemy.y)
      ? [[dx, 0], [0, dy]]
      : [[0, dy], [dx, 0]];
    for (const [sx, sy] of tries) {
      if ((sx || sy) && this.enemyCanStep(enemy.x + sx, enemy.y + sy)) {
        return { x: enemy.x + sx, y: enemy.y + sy };
      }
    }
    return null;
  }

  randomStep(enemy) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5);
    for (const [sx, sy] of dirs) {
      if (this.enemyCanStep(enemy.x + sx, enemy.y + sy)) {
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
    const cap = 80 + player.level * 10;
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
      const loot = await this.rollLoot(playerId, enemy.def.id);

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

  async rollLoot(playerId, defId) {
    const table = LOOT_TABLES[defId] || [];
    const roll = Math.random();
    let cumulative = 0;
    for (const [chance, itemName] of table) {
      cumulative += chance;
      if (roll < cumulative) {
        const item = getItem(itemName);
        if (!item) return null;
        await sql`
          INSERT INTO inventory (player_id, item_name, item_type, slot, stats)
          VALUES (${playerId}, ${item.name}, ${item.type}, ${item.slot},
                  ${item.stats ? JSON.stringify(item.stats) : null})
        `;
        return item.name;
      }
    }
    return null;
  }
}

export const world = new GameWorld();
