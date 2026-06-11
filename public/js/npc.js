// NPC definitions + instances on the map. Chat goes through the Groq proxy
// (see api.js streamNpcReply); conversation UI lives in ui.js.

const RESPAWN_MS = 30000;

const SPRITE_COLORS = {
  blacksmith: { body: '#7a4a2b', head: '#d9a06b', accent: '#9a9a9a' },
  elder: { body: '#5d3a8c', head: '#e8c39e', accent: '#c9a14d' },
  goblin: { body: '#4a7a2b', head: '#6da33f', accent: '#c44' }
};

export class NpcInstance {
  constructor(def, x, y) {
    this.def = def;
    this.x = x;
    this.y = y;
    this.alive = true;
    this.respawnAt = 0;
    // live combat stats (reset on respawn)
    this.hp = def.stats?.hp ?? 0;
  }

  get isEnemy() { return this.def.role === 'enemy'; }

  kill() {
    this.alive = false;
    this.respawnAt = performance.now() + RESPAWN_MS;
  }

  maybeRespawn(now) {
    if (!this.alive && now >= this.respawnAt) {
      this.alive = true;
      this.hp = this.def.stats?.hp ?? 0;
    }
  }
}

export class NpcManager {
  constructor(npcDefs) {
    this.instances = [];
    for (const def of npcDefs) {
      if (def.spawns) {
        for (const [x, y] of def.spawns) this.instances.push(new NpcInstance(def, x, y));
      } else {
        this.instances.push(new NpcInstance(def, def.x, def.y));
      }
    }
  }

  static async load() {
    const res = await fetch('/js/npcs.json');
    if (!res.ok) throw new Error('Could not load NPCs');
    return new NpcManager(await res.json());
  }

  update(now) {
    for (const npc of this.instances) npc.maybeRespawn(now);
  }

  occupies(tx, ty) {
    return this.instances.some((npc) => npc.alive && npc.x === tx && npc.y === ty);
  }

  // The living NPC on the tile the player faces, if any.
  npcFacing(player) {
    const { x, y } = player.facingTile();
    return this.instances.find((npc) => npc.alive && npc.x === x && npc.y === y) || null;
  }

  draw(ctx, tileSize) {
    for (const npc of this.instances) {
      if (!npc.alive) continue;
      drawNpcSprite(ctx, npc, tileSize);
    }
  }
}

function drawNpcSprite(ctx, npc, ts) {
  const colors = SPRITE_COLORS[npc.def.sprite] || SPRITE_COLORS.blacksmith;
  const x = npc.x * ts;
  const y = npc.y * ts;

  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  ctx.ellipse(x + ts / 2, y + ts - 4, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = colors.body;
  ctx.fillRect(x + 9, y + 12, 14, 14);
  ctx.fillStyle = colors.head;
  ctx.beginPath();
  ctx.arc(x + ts / 2, y + 9, 7, 0, Math.PI * 2);
  ctx.fill();

  if (npc.def.sprite === 'goblin') {
    // pointy ears + angry eyes
    ctx.fillStyle = colors.head;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 8); ctx.lineTo(x + 4, y + 2); ctx.lineTo(x + 11, y + 5);
    ctx.moveTo(x + ts - 8, y + 8); ctx.lineTo(x + ts - 4, y + 2); ctx.lineTo(x + ts - 11, y + 5);
    ctx.fill();
    ctx.fillStyle = colors.accent;
    ctx.fillRect(x + 12, y + 7, 3, 2);
    ctx.fillRect(x + 18, y + 7, 3, 2);
  } else if (npc.def.sprite === 'elder') {
    // hooded robe
    ctx.fillStyle = colors.body;
    ctx.beginPath();
    ctx.arc(x + ts / 2, y + 7, 8, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = colors.accent;
    ctx.fillRect(x + 9, y + 18, 14, 2);
  } else if (npc.def.sprite === 'blacksmith') {
    // apron + hammer
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x + 11, y + 14, 10, 12);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(x + 24, y + 10, 3, 10);
    ctx.fillRect(x + 21, y + 8, 9, 4);
  }

  // name label
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = npc.isEnemy ? '#ff9b9b' : '#ffe9b0';
  ctx.strokeStyle = 'rgba(0,0,0,.7)';
  ctx.lineWidth = 3;
  ctx.strokeText(npc.def.name, x + ts / 2, y - 4);
  ctx.fillText(npc.def.name, x + ts / 2, y - 4);
}
