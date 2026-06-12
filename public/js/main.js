// Entry point: auth flow, networking, weather, battle screen and the
// viewport-culled isometric game loop.

import { api, getToken, clearToken } from './api.js';
import { initAuth } from './auth.js';
import { loadWorld } from './world.js';
import { Player } from './player.js';
import { loadNpcs, entityBlocked, findInteractable } from './npc.js';
import { loadItems } from './items.js';
import { Net } from './net.js';
import { CombatManager } from './combat.js';
import { BattleScene } from './battle.js';
import { Story } from './story.js';
import { Weather } from './weather.js';
import { Ui } from './ui.js';
import {
  drawAdventurer, drawBlacksmith, drawElder, drawMerchant, drawAltar,
  MONSTER_PAINTERS
} from './sprites.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const battleCanvas = document.getElementById('battle-canvas');

const VIEW_W = 960;
const VIEW_H = 640;
// crisper rendering on high-DPI screens without exploding the pixel count
const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
for (const c of [canvas, battleCanvas]) {
  c.width = VIEW_W * DPR;
  c.height = VIEW_H * DPR;
  c.style.width = `${VIEW_W}px`;
  c.style.height = `${VIEW_H}px`;
}

const game = {
  world: null,
  player: null,
  friendlyNpcs: [],
  npcDefs: null,
  remotePlayers: new Map(),
  enemies: new Map(),
  merchants: new Map(),
  net: null,
  combat: null,
  battle: null,
  story: null,
  weather: null,
  ui: null,
  stats: null,
  items: [],
  async refreshInventory() {
    const { items } = await api.inventory();
    game.items = items;
    game.ui?.updateHud();
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

// Movement blocker: entities + biome gates (with a helpful toast).
function moveBlocked(x, y) {
  if (entityBlocked(game, x, y)) return true;
  const targetBiome = game.world.biomeAt(x);
  const currentBiome = game.world.biomeAt(game.player.tx);
  if (targetBiome && targetBiome !== currentBiome && targetBiome.gate
      && x > game.player.tx && game.stats.level < targetBiome.gate.minLevel) {
    game.ui.gateBlocked(targetBiome.name, targetBiome.gate.minLevel);
    return true;
  }
  return false;
}

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
    if (e.target.tagName === 'INPUT') return;
    if (game.ui.blocking || game.combat.active || game.story.introOpen) return;

    const dir = KEY_MAP[e.code];
    if (dir) {
      input[dir] = true;
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyE') {
      const found = findInteractable(game);
      if (!found) return;
      if (found.kind === 'npc' || found.kind === 'merchant') {
        game.ui.openChat(found.target);
      } else if (found.kind === 'altar') {
        game.story.useAltar();
      } else if (!found.target.engagedBy) {
        game.combat.start(found.target); // fighting is optional — your call
      } else {
        game.ui.toast('Someone is already fighting that one.', 'bad');
      }
    } else if (e.code === 'KeyI') {
      game.ui.openInventory();
    } else if (e.code === 'KeyF') {
      game.ui.openFriends();
    } else if (e.code === 'KeyQ') {
      game.story.openJournal();
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
  blacksmith: (c, sx, sy, t) => drawBlacksmith(c, sx, sy, { time: t }),
  elder: (c, sx, sy, t) => drawElder(c, sx, sy, { time: t })
};

function buildRenderables(time) {
  const list = [];

  for (const npc of game.friendlyNpcs) {
    list.push({
      px: npc.x,
      py: npc.y,
      paint: (c, sx, sy) => (NPC_PAINTERS[npc.sprite] || NPC_PAINTERS.blacksmith)(c, sx, sy, time),
      label: { text: npc.name, color: '#ffe9b0' },
      labelHeight: 44
    });
  }

  for (const merchant of game.merchants.values()) {
    list.push({
      px: merchant.px,
      py: merchant.py,
      paint: (c, sx, sy) => drawMerchant(c, sx, sy, {
        walkPhase: merchant.walkPhase, moving: merchant.moving, time
      }),
      label: { text: `🛒 ${merchant.name}`, color: '#ffe9b0' },
      labelHeight: 48
    });
  }

  for (const enemy of game.enemies.values()) {
    const painter = MONSTER_PAINTERS[enemy.sprite] || MONSTER_PAINTERS.goblin;
    list.push({
      px: enemy.px,
      py: enemy.py,
      paint: (c, sx, sy) => painter(c, sx, sy, {
        walkPhase: enemy.walkPhase, moving: enemy.moving, time
      }),
      label: { text: enemy.name, color: '#ff9b9b' },
      labelHeight: enemy.sprite === 'tyrant' ? 78 : enemy.sprite === 'goblin_brute' ? 52 : 42,
      hpRatio: enemy.hp / enemy.maxHp
    });
  }

  for (const remote of game.remotePlayers.values()) {
    list.push({
      px: remote.px,
      py: remote.py,
      paint: (c, sx, sy) => drawAdventurer(c, sx, sy, remote.id, {
        walkPhase: remote.walkPhase, moving: remote.moving, time
      }),
      label: { text: `${remote.username} · Lv${remote.level}`, color: '#cfe3ff' },
      labelHeight: 44
    });
  }

  // the Rift Altar
  list.push({
    px: game.world.altar.x,
    py: game.world.altar.y,
    paint: (c, sx, sy) => drawAltar(c, sx, sy, time, game.story.shardCount()),
    label: { text: 'Rift Altar', color: '#cdb6ff' },
    labelHeight: 56
  });

  const me = game.player;
  list.push({
    px: me.px,
    py: me.py,
    paint: (c, sx, sy) => drawAdventurer(c, sx, sy, me.id, {
      walkPhase: me.walkPhase, moving: me.moving, time
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

  const uiBlocked = game.ui.blocking || game.combat.active || game.story.introOpen;
  if (!uiBlocked) {
    game.player.update(dt, input, moveBlocked);
  }
  game.net.updateInterpolation(dt);
  updateRegen(dt);

  if (game.combat.active) {
    // battle screen owns the display; world keeps syncing underneath
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const bctx = battleCanvas.getContext('2d');
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    game.battle.update(dt, time);
    game.battle.render();
    requestAnimationFrame(loop);
    return;
  }

  // Interaction hint + zone label
  const found = uiBlocked ? null : findInteractable(game);
  const hints = {
    enemy: (t) => (t.engagedBy ? `${t.name} is busy fighting` : `Press E to fight ${t.name} (optional!)`),
    npc: (t) => `Press E to talk to ${t.name}`,
    merchant: (t) => `Press E to trade with ${t.name}`,
    altar: () => (game.story.shardCount() >= 4
      ? 'Press E to seal the Rift!'
      : `Press E — the altar hums (${game.story.shardCount()}/4 shards)`)
  };
  game.ui.setInteractHint(found ? hints[found.kind](found.target) : '');

  const biome = game.world.biomeAt(game.player.tx);
  game.ui.setZone(game.world.zoneAt(game.player.tx, game.player.ty));
  if (biome) {
    game.weather.setBiome(biome.id);
    game.weather.update(dt, time);
    game.ui.setWeather(game.weather.label());
  }

  // Camera + render
  game.world.updateCamera(game.player.px, game.player.py, dt);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  game.world.draw(ctx, time, buildRenderables(time));
  if (!game.world.inCave(game.player.tx, game.player.ty)) {
    game.weather.draw(ctx, time);
  }

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
  game.world.viewW = VIEW_W;
  game.world.viewH = VIEW_H;
  game.friendlyNpcs = npcData.friendly;
  game.npcDefs = npcData;
  game.stats = statsRes.stats;
  game.player = new Player(world, playerProfile.username, playerProfile.id);
  game.ui = new Ui(game);
  game.story = new Story(game);
  game.weather = new Weather(VIEW_W, VIEW_H);
  game.net = new Net(game);
  game.battle = new BattleScene(battleCanvas, VIEW_W, VIEW_H);
  game.combat = new CombatManager(game, game.net, game.battle);
  game.player.onMove = (x, y, facing) => game.net.send({ t: 'move', x, y, facing });
  await game.refreshInventory();

  for (const event of ['_up', '_down', 'welcome', 'player_join', 'player_leave']) {
    game.net.on(event, () => game.ui.updateOnline(game.net.connected));
  }
  game.net.connect();
  world.snapCamera(game.player.px, game.player.py);

  game.ui.updateHud();
  game.ui.updateOnline(false);
  game.story.maybeShowIntro();
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
