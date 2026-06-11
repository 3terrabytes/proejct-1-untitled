// Entry point: auth flow, networking, and the 60fps isometric game loop.

import { api, getToken, clearToken } from './api.js';
import { initAuth } from './auth.js';
import { loadWorld } from './world.js';
import { Player } from './player.js';
import { loadNpcs, entityBlocked, findInteractable, adjacentEnemy } from './npc.js';
import { loadItems } from './items.js';
import { Net } from './net.js';
import { CombatManager } from './combat.js';
import { Ui } from './ui.js';
import {
  drawAdventurer, drawBlacksmith, drawElder, drawGoblin
} from './sprites.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = {
  world: null,
  player: null,
  friendlyNpcs: [],
  remotePlayers: new Map(),
  enemies: new Map(),
  net: null,
  combat: null,
  ui: null,
  stats: null,
  items: [],
  reengageAt: 0,
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
const MOVE_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };

function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (game.ui.chatNpc) game.ui.closeChat();
      else game.ui.closeModal();
      return;
    }
    if (game.combat.active && MOVE_KEYS[e.code] !== undefined) {
      game.combat.useMove(MOVE_KEYS[e.code]);
      e.preventDefault();
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
      const found = findInteractable(game);
      if (!found) return;
      if (found.kind === 'npc') {
        game.ui.openChat(found.target);
      } else if (!found.target.engagedBy) {
        game.combat.start(found.target);
      } else {
        game.ui.toast('Someone is already fighting that one.', 'bad');
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

const NPC_PAINTERS = {
  blacksmith: (c, sx, sy) => drawBlacksmith(c, sx, sy),
  elder: (c, sx, sy) => drawElder(c, sx, sy)
};

function buildRenderables() {
  const list = [];

  for (const npc of game.friendlyNpcs) {
    list.push({
      px: npc.x,
      py: npc.y,
      paint: NPC_PAINTERS[npc.sprite] || NPC_PAINTERS.blacksmith,
      label: { text: npc.name, color: '#ffe9b0' },
      labelHeight: 44
    });
  }

  for (const enemy of game.enemies.values()) {
    const brute = enemy.sprite === 'goblin_brute';
    list.push({
      px: enemy.px,
      py: enemy.py,
      paint: (c, sx, sy) => drawGoblin(c, sx, sy, {
        walkPhase: enemy.walkPhase, moving: enemy.moving, brute
      }),
      label: { text: enemy.name, color: '#ff9b9b' },
      labelHeight: brute ? 52 : 40,
      hpRatio: enemy.hp / enemy.maxHp
    });
  }

  for (const remote of game.remotePlayers.values()) {
    list.push({
      px: remote.px,
      py: remote.py,
      paint: (c, sx, sy) => drawAdventurer(c, sx, sy, remote.id, {
        walkPhase: remote.walkPhase, moving: remote.moving
      }),
      label: { text: `${remote.username} · Lv${remote.level}`, color: '#cfe3ff' },
      labelHeight: 44
    });
  }

  const me = game.player;
  list.push({
    px: me.px,
    py: me.py,
    paint: (c, sx, sy) => drawAdventurer(c, sx, sy, me.id, {
      walkPhase: me.walkPhase, moving: me.moving
    }),
    label: { text: `${me.username} · Lv${game.stats.level}`, color: '#ffd76a' },
    labelHeight: 44
  });

  return list;
}

let lastTime = 0;

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  const uiBlocked = game.ui.blocking || game.combat.active;
  if (!uiBlocked) {
    game.player.update(dt, input, (x, y) => entityBlocked(game, x, y));
  }
  game.net.updateInterpolation(dt);
  updateRegen(dt);

  // A goblin that catches you starts a fight.
  if (!uiBlocked && !game.combat.pendingEngage && game.net.connected
      && Date.now() > game.reengageAt) {
    const threat = adjacentEnemy(game);
    if (threat && !threat.engagedBy) game.combat.start(threat);
  }

  // Interaction hint + zone label
  const found = uiBlocked ? null : findInteractable(game);
  game.ui.setInteractHint(
    found
      ? (found.kind === 'enemy'
        ? `Press E to fight ${found.target.name}`
        : `Press E to talk to ${found.target.name}`)
      : ''
  );
  game.ui.setZone(game.world.zoneAt(game.player.tx, game.player.ty));

  // Camera + render
  game.world.updateCamera(game.player.px, game.player.py, dt);
  game.world.draw(ctx, time, buildRenderables());

  requestAnimationFrame(loop);
}

async function startGame(playerProfile) {
  document.getElementById('game-screen').classList.remove('hidden');

  const [world, npcData, statsRes] = await Promise.all([
    loadWorld(),
    loadNpcs(),
    api.stats(),
    loadItems()
  ]);
  game.world = world;
  game.friendlyNpcs = npcData.friendly;
  game.stats = statsRes.stats;
  game.player = new Player(world, playerProfile.username, playerProfile.id);
  game.ui = new Ui(game);
  game.net = new Net(game);
  game.combat = new CombatManager(game, game.net);
  game.player.onMove = (x, y, facing) => game.net.send({ t: 'move', x, y, facing });
  await game.refreshInventory();

  for (const event of ['_up', '_down', 'welcome', 'player_join', 'player_leave']) {
    game.net.on(event, () => game.ui.updateOnline(game.net.connected));
  }
  game.net.connect();
  world.snapCamera(game.player.px, game.player.py);

  game.ui.updateHud();
  game.ui.updateOnline(false);
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
