// WebSocket client: live connection to the shared world. Keeps the local
// mirrors of remote players and server-owned enemies up to date, and routes
// combat events to whoever registered for them.
import { getToken } from './api.js';

const LERP_SPEED = 5.5; // tiles/sec — matches player movement speed

export class Net {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.backoff = 1000;
    this.connected = false;
    this.closedByUs = false;
    this.listeners = new Map(); // message type -> Set<fn>
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }

  emit(msg) {
    for (const fn of this.listeners.get(msg.t) || []) fn(msg);
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?token=${encodeURIComponent(getToken())}`;
    this.socket = new WebSocket(url);

    this.socket.addEventListener('open', () => {
      this.backoff = 1000;
      this.connected = true;
      this.emit({ t: '_up' });
    });

    this.socket.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      this.handle(msg);
      this.emit(msg);
    });

    this.socket.addEventListener('close', (event) => {
      this.connected = false;
      this.emit({ t: '_down' });
      if (this.closedByUs || event.code === 4000 || event.code === 4001) return;
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 1.6, 10000);
    });
  }

  close() {
    this.closedByUs = true;
    this.socket?.close();
  }

  send(msg) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(msg));
  }

  // ---------- world state mirroring ----------

  handle(msg) {
    const { remotePlayers, enemies } = this.game;
    switch (msg.t) {
      case 'welcome': {
        remotePlayers.clear();
        enemies.clear();
        for (const p of msg.players) {
          remotePlayers.set(p.id, { ...p, px: p.x, py: p.y, walkPhase: 0, moving: false });
        }
        for (const e of msg.enemies) {
          enemies.set(e.id, { ...e, px: e.x, py: e.y, walkPhase: 0, moving: false });
        }
        // Server respawned us at the spawn point — snap local player to it.
        this.game.player.teleport(msg.you.x, msg.you.y);
        this.game.world.snapCamera(msg.you.x, msg.you.y);
        break;
      }
      case 'player_join':
        remotePlayers.set(msg.player.id, {
          ...msg.player, px: msg.player.x, py: msg.player.y, walkPhase: 0, moving: false
        });
        break;
      case 'player_move': {
        const p = remotePlayers.get(msg.id);
        if (p) { p.x = msg.x; p.y = msg.y; p.facing = msg.facing; }
        break;
      }
      case 'player_update': {
        const p = remotePlayers.get(msg.id);
        if (p) p.level = msg.level;
        break;
      }
      case 'player_leave':
        remotePlayers.delete(msg.id);
        break;
      case 'enemy_spawn':
        enemies.set(msg.enemy.id, {
          ...msg.enemy, px: msg.enemy.x, py: msg.enemy.y, walkPhase: 0, moving: false
        });
        break;
      case 'enemies_move':
        for (const move of msg.moves) {
          const e = enemies.get(move.id);
          if (e) { e.x = move.x; e.y = move.y; }
        }
        break;
      case 'enemy_hp': {
        const e = enemies.get(msg.id);
        if (e) e.hp = msg.hp;
        break;
      }
      case 'enemy_engaged': {
        const e = enemies.get(msg.id);
        if (e) e.engagedBy = msg.by;
        break;
      }
      case 'enemy_freed': {
        const e = enemies.get(msg.id);
        if (e) e.engagedBy = null;
        break;
      }
      case 'enemy_dead':
        enemies.delete(msg.id);
        break;
    }
  }

  // Per-frame interpolation of remote entities toward their server tiles.
  updateInterpolation(dt) {
    for (const collection of [this.game.remotePlayers, this.game.enemies]) {
      for (const entity of collection.values()) {
        const dx = entity.x - entity.px;
        const dy = entity.y - entity.py;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          entity.px = entity.x;
          entity.py = entity.y;
          entity.moving = false;
          continue;
        }
        entity.moving = true;
        entity.walkPhase += dt * 11;
        const step = Math.min(dist, LERP_SPEED * dt * Math.max(1, dist));
        entity.px += (dx / dist) * step;
        entity.py += (dy / dist) * step;
      }
    }
  }
}
