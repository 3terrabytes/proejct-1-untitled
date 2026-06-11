// Turn-based combat against server-owned enemies. The player picks one of
// four moves (keys 1-4); damage claims go to the server over the WebSocket,
// which arbitrates hits, deaths and rewards. Taunts come from Groq.

import { api, streamNpcReply } from './api.js';
import { equipmentBonuses } from './items.js';

const randBetween = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

export const MOVES = [
  {
    id: 'slash', name: 'Slash', icon: '🗡️', key: '1',
    desc: 'Reliable strike', mult: 1.0, acc: 1.0, cd: 0
  },
  {
    id: 'heavy', name: 'Heavy Strike', icon: '💥', key: '2',
    desc: '1.9× damage, 70% to hit', mult: 1.9, acc: 0.7, cd: 2
  },
  {
    id: 'guard', name: 'Guard', icon: '🛡️', key: '3',
    desc: 'Halve next hit, +5% HP', cd: 1, guard: true
  },
  {
    id: 'warcry', name: 'War Cry', icon: '📣', key: '4',
    desc: 'Enemy attack −30%, 3 turns', cd: 4, warcry: 3
  }
];

const REWARD_TIMEOUT_MS = 5000;

export class CombatManager {
  constructor(game, net) {
    this.game = game;
    this.net = net;
    this.enemy = null;
    this.busy = false;
    this.over = false;
    this.guarded = false;
    this.debuffTurns = 0;
    this.cooldowns = {};
    this.pendingEngage = null;
    this.rewardTimer = null;

    this.panel = document.getElementById('combat-panel');
    this.log = document.getElementById('combat-log');
    this.playerName = document.getElementById('combat-player-name');
    this.enemyName = document.getElementById('combat-enemy-name');
    this.playerHpBar = document.getElementById('combat-player-hp');
    this.enemyHpBar = document.getElementById('combat-enemy-hp');
    this.movesBox = document.getElementById('combat-moves');
    this.fleeBtn = document.getElementById('btn-flee');

    this.buttons = MOVES.map((move, i) => {
      const btn = document.createElement('button');
      btn.className = 'move-btn';
      btn.innerHTML = `
        <span class="move-key">${move.key}</span>
        <span class="move-icon">${move.icon}</span>
        <span class="move-name">${move.name}</span>
        <span class="move-desc">${move.desc}</span>
        <span class="move-cd hidden"></span>`;
      btn.addEventListener('click', () => this.useMove(i));
      this.movesBox.appendChild(btn);
      return btn;
    });
    this.fleeBtn.addEventListener('click', () => this.flee());

    net.on('engage_ok', (msg) => this.onEngageOk(msg));
    net.on('engage_denied', (msg) => this.onEngageDenied(msg));
    net.on('enemy_hp', (msg) => {
      if (this.active && msg.id === this.enemy.id) {
        this.enemy.hp = msg.hp;
        this.updateBars();
      }
    });
    net.on('enemy_dead', (msg) => this.onEnemyDead(msg));
    net.on('rewards', (msg) => this.onRewards(msg));
    net.on('_down', () => {
      this.pendingEngage = null;
      if (this.active) {
        this.game.ui.toast('Connection lost — the fight is off.', 'bad');
        this.end(false);
      }
    });
  }

  get active() { return this.enemy !== null; }

  // ---------- engagement ----------

  start(enemyMirror) {
    if (this.active || this.pendingEngage) return;
    this.pendingEngage = enemyMirror.id;
    this.net.send({ t: 'engage', enemyId: enemyMirror.id });
  }

  onEngageOk(msg) {
    this.pendingEngage = null;
    // Use the server's authoritative snapshot of the enemy.
    const mirror = this.game.enemies.get(msg.enemy.id);
    this.enemy = mirror ? Object.assign(mirror, msg.enemy) : { ...msg.enemy };

    this.over = false;
    this.busy = false;
    this.guarded = false;
    this.debuffTurns = 0;
    this.cooldowns = {};
    this.log.innerHTML = '';
    this.playerName.textContent = this.game.player.username;
    this.enemyName.textContent = this.enemy.name;
    this.panel.classList.remove('hidden');
    this.refreshButtons();
    this.updateBars();
    this.addLog(`You square up against the ${this.enemy.name}!`, 'info');
    this.requestTaunt(`The adventurer ${this.game.player.username} draws a weapon and attacks you!`);
  }

  onEngageDenied(msg) {
    this.pendingEngage = null;
    this.game.ui.toast(msg.reason, 'bad');
    this.game.reengageAt = Date.now() + 2500;
  }

  end(sendDisengage = true) {
    if (sendDisengage && this.enemy && !this.over) {
      this.net.send({ t: 'disengage' });
    }
    clearTimeout(this.rewardTimer);
    this.enemy = null;
    this.pendingEngage = null;
    this.panel.classList.add('hidden');
    this.game.reengageAt = Date.now() + 2500;
    api.setHp(this.game.stats.hp).catch(() => {});
  }

  // ---------- UI plumbing ----------

  addLog(text, kind = '') {
    const line = document.createElement('div');
    if (kind) line.className = kind;
    line.textContent = text;
    this.log.appendChild(line);
    this.log.scrollTop = this.log.scrollHeight;
    return line;
  }

  updateBars() {
    const { stats } = this.game;
    this.playerHpBar.style.width = `${Math.max(0, (stats.hp / stats.max_hp) * 100)}%`;
    this.enemyHpBar.style.width =
      `${Math.max(0, ((this.enemy?.hp || 0) / (this.enemy?.maxHp || 1)) * 100)}%`;
    this.game.ui.updateHud();
  }

  refreshButtons() {
    MOVES.forEach((move, i) => {
      const cd = this.cooldowns[move.id] || 0;
      const btn = this.buttons[i];
      btn.disabled = this.busy || this.over || cd > 0;
      const badge = btn.querySelector('.move-cd');
      badge.classList.toggle('hidden', cd === 0);
      badge.textContent = cd > 0 ? `${cd}` : '';
    });
    this.fleeBtn.disabled = this.busy || this.over;
  }

  requestTaunt(situation) {
    if (!this.enemy) return;
    const { stats } = this.game;
    const line = this.addLog(`${this.enemy.name}: `, 'taunt');
    streamNpcReply(
      {
        npcId: this.enemy.defId,
        playerMessage: `${situation} Shout a single short taunt (one sentence, stay in character).`,
        playerStats: { level: stats.level, gold: stats.gold }
      },
      (text) => {
        line.textContent += text;
        this.log.scrollTop = this.log.scrollHeight;
      }
    ).catch(() => {
      line.textContent += '…growls menacingly.';
    });
  }

  playerTotals() {
    const bonus = equipmentBonuses(this.game.items);
    return {
      attack: this.game.stats.attack + bonus.attack,
      defence: this.game.stats.defence + bonus.defence
    };
  }

  // ---------- turns ----------

  async useMove(index) {
    const move = MOVES[index];
    if (!this.active || this.busy || this.over || (this.cooldowns[move.id] || 0) > 0) return;
    this.busy = true;
    this.refreshButtons();

    let enemyMayDie = false;
    if (move.guard) {
      this.guarded = true;
      const heal = Math.max(1, Math.round(this.game.stats.max_hp * 0.05));
      this.game.stats.hp = Math.min(this.game.stats.max_hp, this.game.stats.hp + heal);
      this.addLog(`🛡️ You raise your guard (+${heal} HP). The next hit is halved.`);
    } else if (move.warcry) {
      this.debuffTurns = move.warcry;
      this.addLog(`📣 You let out a war cry! The ${this.enemy.name} falters (−30% attack).`);
    } else if (Math.random() > move.acc) {
      this.addLog(`💨 Your ${move.name} misses!`);
    } else {
      const damage = Math.max(
        1,
        Math.floor(this.playerTotals().attack * move.mult) - this.enemy.defence + randBetween(-2, 2)
      );
      this.enemy.hp = Math.max(0, this.enemy.hp - damage); // optimistic; server confirms
      this.addLog(`${move.icon} Your ${move.name} hits for ${damage} damage.`);
      this.net.send({ t: 'attack', enemyId: this.enemy.id, damage });
      enemyMayDie = this.enemy.hp <= 0;
    }
    this.updateBars();

    if (enemyMayDie) {
      // Wait for the server's enemy_dead + rewards.
      this.addLog(`💀 The ${this.enemy.name} collapses!`, 'info');
      this.over = true;
      this.refreshButtons();
      this.rewardTimer = setTimeout(() => {
        this.game.ui.toast('No reply from the server — rewards may be delayed.', 'bad');
        this.end(false);
      }, REWARD_TIMEOUT_MS);
      return;
    }

    await new Promise((r) => setTimeout(r, 550));
    if (!this.active || this.over) return;
    this.enemyTurn();
    if (!this.active || this.over) return;

    // tick cooldowns at the end of the round
    for (const key of Object.keys(this.cooldowns)) {
      if (this.cooldowns[key] > 0) this.cooldowns[key] -= 1;
    }
    if (move.cd > 0) this.cooldowns[move.id] = move.cd;
    this.busy = false;
    this.refreshButtons();
  }

  enemyTurn() {
    if (!this.enemy || this.enemy.hp <= 0) return;
    const attackPower = this.debuffTurns > 0
      ? Math.floor(this.enemy.attack * 0.7)
      : this.enemy.attack;
    if (this.debuffTurns > 0) this.debuffTurns -= 1;

    let damage = Math.max(1, attackPower - this.playerTotals().defence + randBetween(-2, 2));
    if (this.guarded) {
      damage = Math.max(1, Math.ceil(damage / 2));
      this.guarded = false;
      this.addLog(`🛡️ Your guard absorbs the blow — only ${damage} damage.`, 'hit');
    } else {
      this.addLog(`The ${this.enemy.name} hits you for ${damage} damage.`, 'hit');
    }
    this.game.stats.hp = Math.max(0, this.game.stats.hp - damage);
    this.updateBars();

    if (this.game.stats.hp <= 0) {
      this.defeat();
      return;
    }
    if (Math.random() < 0.25) {
      this.requestTaunt('You just landed a hit on the player.');
    }
  }

  // ---------- outcomes ----------

  onEnemyDead(msg) {
    if (!this.active || msg.id !== this.enemy.id) return;
    this.over = true;
    this.refreshButtons();
  }

  onRewards(msg) {
    clearTimeout(this.rewardTimer);
    // The server's stats carry a pre-fight HP value — keep the local one,
    // except on level up (which heals to full by design).
    const localHp = this.game.stats.hp;
    this.game.stats = msg.stats;
    if (msg.levelsGained === 0) {
      this.game.stats.hp = Math.min(localHp, msg.stats.max_hp);
    }
    this.game.ui.toast(`+${msg.xp} XP`, 'good');
    if (msg.gold > 0) this.game.ui.toast(`+${msg.gold} gold`, 'good');
    if (msg.levelsGained > 0) {
      this.game.ui.toast(`⭐ Level up! You are now level ${msg.stats.level}`, 'good');
    }
    if (msg.loot) {
      this.game.ui.toast(`Loot: ${msg.loot}`, 'good');
      this.game.refreshInventory().catch(() => {});
    }
    this.game.ui.updateHud();
    if (this.active) {
      this.over = true;
      setTimeout(() => this.end(false), 900);
    }
  }

  defeat() {
    this.over = true;
    this.refreshButtons();
    this.addLog('☠️ You collapse…', 'hit');
    const { stats, player, world } = this.game;
    stats.hp = Math.ceil(stats.max_hp / 2);
    player.teleport(world.spawn.x, world.spawn.y);
    this.game.ui.toast('You were defeated and wake up back in the village.', 'bad');
    this.game.ui.updateHud();
    setTimeout(() => this.end(true), 900);
  }

  async flee() {
    if (!this.active || this.busy || this.over) return;
    this.busy = true;
    this.refreshButtons();
    this.addLog('🏃 You turn and run!', 'info');
    // Fleeing gives the enemy one free swing.
    this.enemyTurn();
    if (this.active && !this.over) {
      setTimeout(() => this.end(true), 400);
    }
  }
}
