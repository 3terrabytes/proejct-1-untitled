// The battle screen: a separate full-screen scene for fights, with proper
// animations — lunges, slash arcs, damage numbers, screen shake, particles,
// intro slide-in and victory/defeat sequences. Pure presentation; combat.js
// owns the rules and the server conversation.

import { drawAdventurer, MONSTER_PAINTERS, shade } from './sprites.js';

const BACKDROPS = {
  meadow: { top: '#241c38', mid: '#352a4e', floor: '#1c1530', rim: '#6e6580' },
  desert: { top: '#3a2a18', mid: '#5c4426', floor: '#2a1f12', rim: '#a98e62' },
  rainforest: { top: '#0e2416', mid: '#1c3d24', floor: '#0a1a10', rim: '#5a7260' },
  ashlands: { top: '#2a0f0c', mid: '#4a1d14', floor: '#1c0a08', rim: '#ff6a30' }
};

export class BattleScene {
  constructor(canvasEl, viewW, viewH) {
    // logical view size — the DPR transform is applied by the main loop
    this.canvas = { width: viewW, height: viewH };
    this.ctx = canvasEl.getContext('2d');
    this.active = false;
    this.effects = [];
    this.particles = [];
    this.numbers = [];
    this.shake = 0;
    this.time = 0;
  }

  enter(enemy, playerInfo, biomeId) {
    this.active = true;
    this.enemy = enemy;
    this.playerInfo = playerInfo;
    this.backdrop = BACKDROPS[biomeId] || BACKDROPS.meadow;
    this.biomeId = biomeId;
    this.effects = [];
    this.particles = [];
    this.numbers = [];
    this.shake = 0;
    this.banner = null;

    const w = this.canvas.width;
    const h = this.canvas.height;
    this.playerPos = { x: w * 0.3, y: h * 0.72 };
    this.enemyPos = { x: w * 0.7, y: h * 0.7 };
    this.playerOffset = { x: -w * 0.5, y: 0 };
    this.enemyOffset = { x: w * 0.5, y: 0 };
    this.playerAlpha = 1;
    this.enemyAlpha = 1;
    this.enemyAngle = 0;
    this.playerAngle = 0;

    // fighters slide in from the wings
    return Promise.all([
      this.tween(450, (t) => { this.playerOffset.x = -w * 0.5 * (1 - ease(t)); }),
      this.tween(450, (t) => { this.enemyOffset.x = w * 0.5 * (1 - ease(t)); })
    ]).then(() => this.flashText('⚔️', '#ffd76a', 36));
  }

  exit() {
    this.active = false;
    this.enemy = null;
  }

  // ---------- tween / effect machinery ----------

  tween(duration, step) {
    return new Promise((resolve) => {
      this.effects.push({ elapsed: 0, duration, step, resolve });
    });
  }

  wait(ms) { return this.tween(ms, () => {}); }

  update(dt, time) {
    this.time = time;
    for (const fx of this.effects) {
      fx.elapsed += dt * 1000;
      const t = Math.min(1, fx.elapsed / fx.duration);
      fx.step(t);
      if (t >= 1 && !fx.done) { fx.done = true; fx.resolve(); }
    }
    this.effects = this.effects.filter((fx) => !fx.done);

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.gravity ?? 300) * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const n of this.numbers) {
      n.y -= 55 * dt;
      n.life -= dt;
      n.scale = Math.min(1, n.scale + dt * 6);
    }
    this.numbers = this.numbers.filter((n) => n.life > 0);

    this.shake = Math.max(0, this.shake - dt * 26);
  }

  // ---------- animations (each returns a promise) ----------

  burst(x, y, color, count = 16, speed = 230) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
        life: 0.4 + Math.random() * 0.4, color, size: 2 + Math.random() * 3
      });
    }
  }

  damageNumber(x, y, text, color = '#fff') {
    this.numbers.push({ x: x + (Math.random() - 0.5) * 30, y, text, color, life: 1.1, scale: 0.3 });
  }

  flashText(text, color, size = 30) {
    const x = this.canvas.width / 2;
    const y = this.canvas.height * 0.34;
    this.numbers.push({ x, y, text, color, life: 0.9, scale: 0.5, size });
    return this.wait(250);
  }

  async playerAttack(moveIcon, hit, damage, heavy) {
    const dist = this.enemyPos.x - this.playerPos.x - 110;
    // wind up + lunge
    await this.tween(120, (t) => { this.playerOffset.x = -26 * ease(t); });
    await this.tween(140, (t) => { this.playerOffset.x = -26 + (dist + 26) * ease(t); });
    if (hit) {
      this.slashArc(this.enemyPos.x - 20, this.enemyPos.y - 60, heavy);
      this.burst(this.enemyPos.x, this.enemyPos.y - 55, heavy ? '#ffb056' : '#ffe9b0', heavy ? 26 : 14);
      this.damageNumber(this.enemyPos.x, this.enemyPos.y - 110, `-${damage}`, heavy ? '#ffb056' : '#fff');
      this.shake = heavy ? 13 : 7;
      // enemy knockback wobble
      this.tween(260, (t) => {
        this.enemyOffset.x = Math.sin(t * Math.PI) * (heavy ? 34 : 18);
      });
    } else {
      this.damageNumber(this.enemyPos.x, this.enemyPos.y - 110, 'MISS', '#9b91b8');
      // enemy sidesteps
      this.tween(240, (t) => { this.enemyOffset.x = Math.sin(t * Math.PI) * 26; });
    }
    // recover
    await this.tween(220, (t) => { this.playerOffset.x = dist * (1 - ease(t)); });
    this.playerOffset.x = 0;
  }

  async enemyAttack(damage, guarded) {
    const dist = this.playerPos.x - this.enemyPos.x + 110;
    await this.tween(140, (t) => { this.enemyOffset.x = 26 * ease(t); });
    await this.tween(140, (t) => { this.enemyOffset.x = 26 + (dist - 26) * ease(t); });
    if (guarded) {
      this.guardFlash();
      this.damageNumber(this.playerPos.x, this.playerPos.y - 120, `-${damage} 🛡️`, '#8fd0ff');
      this.shake = 4;
    } else {
      this.burst(this.playerPos.x, this.playerPos.y - 60, '#ff8a7a', 16);
      this.damageNumber(this.playerPos.x, this.playerPos.y - 120, `-${damage}`, '#ff8a7a');
      this.shake = 9;
      this.tween(260, (t) => { this.playerOffset.x = -Math.sin(t * Math.PI) * 22; });
    }
    await this.tween(220, (t) => { this.enemyOffset.x = dist * (1 - ease(t)); });
    this.enemyOffset.x = 0;
  }

  slashArc(x, y, heavy) {
    const arc = { progress: 0 };
    this.tween(200, (t) => { arc.progress = t; });
    this.particles.push({
      x, y, vx: 0, vy: 0, gravity: 0, life: 0.22,
      draw: (ctx) => {
        const t = 1 - Math.max(0, arc.progress);
        ctx.strokeStyle = `rgba(255,240,200,${0.9 * t + 0.1})`;
        ctx.lineWidth = heavy ? 7 : 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x, y, heavy ? 64 : 48, -0.9 + arc.progress * 1.2, 0.5 + arc.progress * 1.2);
        ctx.stroke();
      }
    });
  }

  guardFlash() {
    const x = this.playerPos.x + 40;
    const y = this.playerPos.y - 60;
    this.particles.push({
      x, y, vx: 0, vy: 0, gravity: 0, life: 0.5, start: 0.5,
      draw: (ctx, p) => {
        const a = p.life / p.start;
        const g = ctx.createRadialGradient(x, y, 6, x, y, 52);
        g.addColorStop(0, `rgba(120,190,255,${0.5 * a})`);
        g.addColorStop(1, 'rgba(120,190,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 52, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(170,220,255,${0.8 * a})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x - 40, y, 46, -1.1, 1.1);
        ctx.stroke();
      }
    });
  }

  async guard() {
    this.guardFlash();
    this.flashText('🛡️', '#8fd0ff', 26);
    await this.wait(420);
  }

  async warcry() {
    const x = this.playerPos.x;
    const y = this.playerPos.y - 60;
    const ring = { r: 0 };
    this.particles.push({
      x, y, vx: 0, vy: 0, gravity: 0, life: 0.6,
      draw: (ctx) => {
        ctx.strokeStyle = `rgba(255,120,90,${Math.max(0, 1 - ring.r / 220)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, ring.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    this.tween(550, (t) => { ring.r = 220 * ease(t); });
    // enemy trembles
    this.tween(550, (t) => { this.enemyOffset.x = Math.sin(t * 26) * 5 * (1 - t); });
    this.shake = 5;
    await this.wait(560);
  }

  async enemyDeath() {
    this.burst(this.enemyPos.x, this.enemyPos.y - 50, '#ffd76a', 34, 300);
    this.burst(this.enemyPos.x, this.enemyPos.y - 50, '#ff8a50', 20, 180);
    this.shake = 12;
    await this.tween(700, (t) => {
      this.enemyAngle = t * 1.4;
      this.enemyAlpha = 1 - t;
      this.enemyOffset.y = t * 26;
    });
  }

  async playerDeath() {
    this.shake = 10;
    await this.tween(800, (t) => {
      this.playerAngle = -t * 1.5;
      this.playerAlpha = 1 - t * 0.7;
      this.playerOffset.y = t * 22;
    });
  }

  async flee() {
    await this.tween(450, (t) => {
      this.playerOffset.x = -this.canvas.width * 0.5 * ease(t);
      this.playerAlpha = 1 - t * 0.6;
    });
  }

  showBanner(title, lines, color) {
    this.banner = { title, lines, color, born: this.time };
  }

  // ---------- rendering ----------

  render() {
    if (!this.active) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bd = this.backdrop;

    // cavern backdrop
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, bd.top);
    sky.addColorStop(0.55, bd.mid);
    sky.addColorStop(1, bd.floor);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // stalactite / canopy silhouettes
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 9; i++) {
      const sx = (i / 9) * w + ((i * 37) % 23);
      const depth = 40 + ((i * 53) % 70);
      ctx.beginPath();
      ctx.moveTo(sx - 26, 0);
      ctx.quadraticCurveTo(sx, depth, sx + 26, 0);
      ctx.fill();
    }
    // ground
    const floor = ctx.createLinearGradient(0, h * 0.62, 0, h);
    floor.addColorStop(0, shade(bd.floor, 1.7));
    floor.addColorStop(1, bd.floor);
    ctx.fillStyle = floor;
    ctx.fillRect(0, h * 0.66, w, h);
    ctx.strokeStyle = `rgba(255,255,255,0.06)`;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.66);
    ctx.lineTo(w, h * 0.66);
    ctx.stroke();
    // ashlands gets a lava seam
    if (this.biomeId === 'ashlands') {
      const pulse = 0.6 + Math.sin(this.time / 400) * 0.4;
      ctx.fillStyle = `rgba(255,110,30,${0.25 * pulse})`;
      ctx.fillRect(0, h * 0.66 - 2, w, 4);
    }
    // rim light dots (cave crystals)
    for (let i = 0; i < 14; i++) {
      const cx = ((i * 211) % w);
      const cy = 30 + ((i * 97) % Math.floor(h * 0.4));
      const tw = 0.4 + Math.sin(this.time / 700 + i) * 0.3;
      ctx.fillStyle = `rgba(${hexA(bd.rim)},${0.25 * tw})`;
      ctx.fillRect(cx, cy, 2, 2);
    }

    // screen shake
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    // fighters (player faces right; enemy mirrored to face left)
    const time = this.time;
    ctx.save();
    ctx.globalAlpha = this.playerAlpha;
    ctx.translate(this.playerPos.x + this.playerOffset.x, this.playerPos.y + this.playerOffset.y);
    ctx.rotate(this.playerAngle);
    drawAdventurer(ctx, 0, 0, this.playerInfo.id, { scale: 3.2, time });
    ctx.restore();

    if (this.enemy) {
      const painter = MONSTER_PAINTERS[this.enemy.sprite] || MONSTER_PAINTERS.goblin;
      ctx.save();
      ctx.globalAlpha = this.enemyAlpha;
      ctx.translate(this.enemyPos.x + this.enemyOffset.x, this.enemyPos.y + this.enemyOffset.y);
      ctx.rotate(this.enemyAngle);
      painter(ctx, 0, 0, { scale: 3.1, flip: true, time });
      ctx.restore();
    }

    // particles
    for (const p of this.particles) {
      if (p.draw) { p.draw(ctx, p); continue; }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.4));
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // damage numbers
    for (const n of this.numbers) {
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.scale(n.scale, n.scale);
      ctx.font = `bold ${n.size || 26}px 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.max(0, Math.min(1, n.life * 1.6));
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(10,8,16,0.85)';
      ctx.strokeText(n.text, 0, 0);
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, 0, 0);
      ctx.restore();
    }
    ctx.restore(); // shake

    // banner (victory / defeat)
    if (this.banner) {
      const age = (this.time - this.banner.born) / 1000;
      const slide = Math.min(1, age * 3);
      ctx.fillStyle = 'rgba(10,8,18,0.72)';
      ctx.fillRect(0, h * 0.3 - 20, w, 130 + this.banner.lines.length * 22);
      ctx.font = "bold 44px 'Segoe UI', sans-serif";
      ctx.textAlign = 'center';
      ctx.globalAlpha = slide;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(10,8,16,0.9)';
      ctx.strokeText(this.banner.title, w / 2, h * 0.3 + 36);
      ctx.fillStyle = this.banner.color;
      ctx.fillText(this.banner.title, w / 2, h * 0.3 + 36);
      ctx.font = "16px 'Segoe UI', sans-serif";
      ctx.fillStyle = '#e8e2f4';
      this.banner.lines.forEach((line, i) => {
        ctx.fillText(line, w / 2, h * 0.3 + 74 + i * 24);
      });
      ctx.globalAlpha = 1;
    }
  }
}

function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function hexA(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
