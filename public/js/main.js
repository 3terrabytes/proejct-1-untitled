// Entry point: auth flow, then the 60fps game loop.

import { api, getToken, clearToken } from './api.js';
import { initAuth } from './auth.js';
import { loadWorld } from './world.js';
import { Player } from './player.js';
import { NpcManager } from './npc.js';
import { CombatManager } from './combat.js';
import { Ui } from './ui.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = {
  world: null,
  player: null,
  npcs: null,
  combat: null,
  ui: null,
  stats: null,
  items: [],
  async refreshInventory() {
    const { items } = await api.inventory();
    game.items = items;
  }
};

const input = { up: false, down: false, left: false, right: false };
const KEY_MAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right'
};

function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (game.ui.chatNpc) game.ui.closeChat();
      else game.ui.closeModal();
      return;
    }
    // Don't steal keys while typing in chat or other inputs.
    if (e.target.tagName === 'INPUT') return;
    if (game.ui.blocking || game.combat.active) return;

    const dir = KEY_MAP[e.code];
    if (dir) {
      input[dir] = true;
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyE') {
      const npc = game.npcs.npcFacing(game.player);
      if (npc) {
        if (npc.isEnemy) game.combat.start(npc);
        else game.ui.openChat(npc);
      }
    } else if (e.code === 'KeyI') {
      game.ui.openInventory();
    } else if (e.code === 'KeyF') {
      game.ui.openFriends();
    }
  });
  window.addEventListener('keyup', (e) => {
    const dir = KEY_MAP[e.code];
    if (dir) input[dir] = false;
  });
}

// Slow out-of-combat regen, synced to the server in batches.
let regenTimer = 0;
let hpDirty = false;
let syncTimer = 0;

function updateRegen(dt) {
  const { stats } = game;
  if (!stats || game.combat.active) return;
  regenTimer += dt;
  if (regenTimer >= 3 && stats.hp < stats.max_hp && stats.hp > 0) {
    regenTimer = 0;
    stats.hp += 1;
    hpDirty = true;
    game.ui.updateHud();
  }
  syncTimer += dt;
  if (syncTimer >= 10 && hpDirty) {
    syncTimer = 0;
    hpDirty = false;
    api.setHp(stats.hp).catch(() => { hpDirty = true; });
  }
}

let lastTime = 0;

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  game.npcs.update(time);
  const uiBlocked = game.ui.blocking || game.combat.active;
  if (!uiBlocked) {
    game.player.update(dt, input, (x, y) => game.npcs.occupies(x, y));
  }
  updateRegen(dt);

  // Interaction hint + zone label
  const facing = uiBlocked ? null : game.npcs.npcFacing(game.player);
  game.ui.setInteractHint(
    facing
      ? (facing.isEnemy ? `Press E to fight ${facing.def.name}` : `Press E to talk to ${facing.def.name}`)
      : ''
  );
  game.ui.setZone(game.world.zoneAt(game.player.tx, game.player.ty));

  // Render
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  game.world.draw(ctx, time);
  game.npcs.draw(ctx, game.world.tileSize);
  game.player.draw(ctx);

  requestAnimationFrame(loop);
}

async function startGame(playerProfile) {
  document.getElementById('game-screen').classList.remove('hidden');

  const [world, npcs, statsRes] = await Promise.all([
    loadWorld(),
    NpcManager.load(),
    api.stats()
  ]);
  game.world = world;
  game.npcs = npcs;
  game.stats = statsRes.stats;
  game.player = new Player(world, playerProfile.username);
  game.ui = new Ui(game);
  game.combat = new CombatManager(game);
  await game.refreshInventory();

  game.ui.updateHud();
  await game.ui.refreshFriendsBadge();
  if (game.ui.pendingCount > 0) {
    game.ui.toast(`You have ${game.ui.pendingCount} pending friend request(s)`, 'good');
  }

  bindKeys();
  requestAnimationFrame((t) => {
    lastTime = t;
    requestAnimationFrame(loop);
  });
}

async function boot() {
  const auth = initAuth(startGame);
  if (!getToken()) {
    auth.show();
    return;
  }
  try {
    const { player } = await api.me();
    document.getElementById('auth-screen').classList.add('hidden');
    await startGame(player);
  } catch {
    clearToken();
    auth.show();
  }
}

boot();
