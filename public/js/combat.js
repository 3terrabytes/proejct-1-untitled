// Turn-based combat against server-owned enemies, played out on the battle
// screen (battle.js does the visuals; this file owns rules + server talk).
// Fights are optional — you only enter one by pressing E on an enemy.

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

const REWARD_TIMEOUT_MS = 6000;

export class CombatManager {
  constructor(game, net, battle) {
    this.game = game;
    this.net = net;
    this.battle = battle;
    this.enemy = null;
    this.busy = false;
    this.over = false;
    this.guarded = false;
    this.debuffTurns = 0;
    this.cooldowns = {};
    this.pendingEngage = null;
    this.rewardTimer = null;
    this.pendingRewards = null;

    this.screen = document.getElementById('battle-screen');
    this.log = document.getElementById('battle-log');
    this.playerName = document.getElementById('battle-player-name');
    this.enemyName = document.getElementById('battle-enemy-name');
    this.playerHpBar = document.getElementById('battle-player-hp');
    this.enemyHpBar = document.getElementById('battle-enemy-hp');
    this.movesBox = document.getElementById('battle-moves');
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

  async onEngageOk(msg) {
    this.pendingEngage = null;
    const mirror = this.game.enemies.get(msg.enemy.id);
    this.enemy = mirror ? Object.assign(mirror, msg.enemy) : { ...msg.enemy };

    this.over = false;
    this.busy = true; // locked until the intro finishes
    this.guarded = false;
    this.debuffTurns = 0;
    this.cooldowns = {};
    this.pendingRewards = null;
    this.log.innerHTML = '';
    this.playerName.textContent = `${this.game.player.username} · Lv ${this.game.stats.level}`;
    this.enemyName.textContent = this.enemy.name;
    this.screen.classList.remove('hidden');
    this.refreshButtons();
    this.updateBars();

    const biome = this.enemy.biome || 'meadow';
    const intro = this.battle.enter(this.enemy, { id: this.game.player.id }, biome);
    this.addLog(`You face the ${this.enemy.name}!`, 'info');
    this.requestTaunt(`The adventurer ${this.game.player.username} draws a weapon and challenges you!`);
    await intro;
    this.busy = false;
    this.refreshButtons();
  }

  onEngageDenied(msg) {
    this.pendingEngage = null;
    this.game.ui.toast(msg.reason, 'bad');
  }

  end(sendDisengage = true) {
    if (sendDisengage && this.enemy && !this.over) {
      this.net.send({ t: 'disengage' });
    }
    clearTimeout(this.rewardTimer);
    this.enemy = null;
    this.pendingEngage = null;
    this.screen.classList.add('hidden');
    this.battle.exit();
    api.setHp(this.game.stats.hp).catch(() => {});
    this.game.ui.updateHud();
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
      line.textContent += '…snarls.';
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
      this.addLog(`🛡️ You raise your guard (+${heal} HP).`);
      await this.battle.guard();
    } else if (move.warcry) {
      this.debuffTurns = move.warcry;
      this.addLog(`📣 Your war cry shakes the ${this.enemy.name} (−30% attack).`);
      await this.battle.warcry();
    } else {
      const hit = Math.random() <= move.acc;
      let damage = 0;
      if (hit) {
        damage = Math.max(
          1,
          Math.floor(this.playerTotals().attack * move.mult) - this.enemy.defence + randBetween(-2, 2)
        );
        this.enemy.hp = Math.max(0, this.enemy.hp - damage); // optimistic; server confirms
        this.addLog(`${move.icon} ${move.name} hits for ${damage}.`);
        this.net.send({ t: 'attack', enemyId: this.enemy.id, damage });
        enemyMayDie = this.enemy.hp <= 0;
      } else {
        this.addLog(`💨 Your ${move.name} misses!`);
      }
      await this.battle.playerAttack(move.icon, hit, damage, move.id === 'heavy');
      this.updateBars();
    }

    if (enemyMayDie) {
      this.over = true;
      this.refreshButtons();
      this.rewardTimer = setTimeout(() => {
        this.game.ui.toast('No reply from the server — rewards may be delayed.', 'bad');
        this.end(false);
      }, REWARD_TIMEOUT_MS);
      // victory plays out in onRewards / onEnemyDead
      return;
    }

    await this.battle.wait(260);
    if (!this.active || this.over) return;
    await this.enemyTurn();
    if (!this.active || this.over) return;

    for (const key of Object.keys(this.cooldowns)) {
      if (this.cooldowns[key] > 0) this.cooldowns[key] -= 1;
    }
    if (move.cd > 0) this.cooldowns[move.id] = move.cd;
    this.busy = false;
    this.refreshButtons();
  }

  async enemyTurn() {
    if (!this.enemy || this.enemy.hp <= 0) return;
    const attackPower = this.debuffTurns > 0
      ? Math.floor(this.enemy.attack * 0.7)
      : this.enemy.attack;
    if (this.debuffTurns > 0) this.debuffTurns -= 1;

    let damage = Math.max(1, attackPower - this.playerTotals().defence + randBetween(-2, 2));
    const wasGuarded = this.guarded;
    if (wasGuarded) {
      damage = Math.max(1, Math.ceil(damage / 2));
      this.guarded = false;
      this.addLog(`🛡️ Your guard absorbs the blow — ${damage} damage.`, 'hit');
    } else {
      this.addLog(`The ${this.enemy.name} hits you for ${damage}.`, 'hit');
    }
    this.game.stats.hp = Math.max(0, this.game.stats.hp - damage);
    await this.battle.enemyAttack(damage, wasGuarded);
    this.updateBars();

    if (this.game.stats.hp <= 0) {
      await this.defeat();
      return;
    }
    if (Math.random() < 0.25) {
      this.requestTaunt('You just landed a hit on the player.');
    }
  }

  // ---------- outcomes ----------

  async onEnemyDead(msg) {
    if (!this.active || msg.id !== this.enemy.id) return;
    this.over = true;
    this.refreshButtons();
    this.addLog(`💀 The ${this.enemy.name} is slain!`, 'info');
    await this.battle.enemyDeath();
    if (this.pendingRewards) this.showVictory(this.pendingRewards);
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
    if (msg.loot) this.game.refreshInventory().catch(() => {});
    this.game.ui.updateHud();

    if (!this.active) return;
    // If the death animation already played, show the banner now;
    // otherwise onEnemyDead will pick these up when it finishes.
    if (this.battle.enemyAlpha <= 0.05) this.showVictory(msg);
    else this.pendingRewards = msg;
  }

  showVictory(msg) {
    this.pendingRewards = null;
    const lines = [`+${msg.xp} XP`, msg.gold > 0 ? `+${msg.gold} gold` : null];
    if (msg.levelsGained > 0) lines.push(`⭐ Level up! Now level ${msg.stats.level}`);
    if (msg.loot) lines.push(`Loot: ${msg.loot}`);
    this.battle.showBanner('VICTORY', lines.filter(Boolean), '#ffd76a');
    if (msg.loot?.includes('Shard')) {
      this.game.ui.toast(`💠 ${msg.loot} acquired!`, 'good');
      this.game.story?.onShard(msg.loot);
    }
    setTimeout(() => this.end(false), 2300);
  }

  async defeat() {
    this.over = true;
    this.refreshButtons();
    this.addLog('☠️ You collapse…', 'hit');
    await this.battle.playerDeath();
    this.battle.showBanner('DEFEATED', ['You wake up back in the village…'], '#ff8a7a');
    const { stats, player, world } = this.game;
    stats.hp = Math.ceil(stats.max_hp / 2);
    player.teleport(world.spawn.x, world.spawn.y);
    world.snapCamera(world.spawn.x, world.spawn.y);
    this.game.ui.updateHud();
    setTimeout(() => this.end(true), 1800);
  }

  async flee() {
    if (!this.active || this.busy || this.over) return;
    this.busy = true;
    this.refreshButtons();
    this.addLog('🏃 You turn and run!', 'info');
    // Fleeing gives the enemy one free swing.
    await this.enemyTurn();
    if (this.active && !this.over) {
      await this.battle.flee();
      this.end(true);
    }
  }
}
