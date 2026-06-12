// Weather: per-biome particle systems + ambient tinting. The active weather
// is derived from the clock in 2-minute windows, so every player sees the
// same sky without any server traffic.

const WINDOW_MS = 120000;

// chance tables per biome
const TABLES = {
  meadow: [['clear', 0.5], ['rain', 0.3], ['overcast', 0.2]],
  desert: [['clear', 0.4], ['sandstorm', 0.35], ['heat', 0.25]],
  rainforest: [['rain', 0.4], ['storm', 0.3], ['mist', 0.3]],
  ashlands: [['embers', 0.6], ['ashfall', 0.4]]
};

const TINTS = {
  rain: 'rgba(40,60,110,0.13)',
  storm: 'rgba(25,35,80,0.2)',
  overcast: 'rgba(60,65,90,0.12)',
  sandstorm: 'rgba(200,150,70,0.14)',
  heat: 'rgba(255,170,60,0.06)',
  mist: 'rgba(160,190,190,0.10)',
  embers: 'rgba(180,60,20,0.07)',
  ashfall: 'rgba(90,80,90,0.10)'
};

function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function weatherFor(biomeId) {
  const win = Math.floor(Date.now() / WINDOW_MS);
  const ids = ['meadow', 'desert', 'rainforest', 'ashlands'];
  const roll = hash(win * 7 + ids.indexOf(biomeId) * 131);
  let cumulative = 0;
  for (const [kind, chance] of TABLES[biomeId] || TABLES.meadow) {
    cumulative += chance;
    if (roll < cumulative) return kind;
  }
  return 'clear';
}

export class Weather {
  constructor(viewW, viewH) {
    this.w = viewW;
    this.h = viewH;
    this.kind = 'clear';
    this.particles = [];
    this.lightning = 0;
    this.nextBolt = 0;
  }

  setBiome(biomeId) {
    const kind = weatherFor(biomeId);
    if (kind === this.kind) return;
    this.kind = kind;
    this.particles = [];
    this.#seed();
  }

  #seed() {
    const make = (count, factory) => {
      for (let i = 0; i < count; i++) this.particles.push(factory());
    };
    const rnd = (a, b) => a + Math.random() * (b - a);
    switch (this.kind) {
      case 'rain':
      case 'storm':
        make(this.kind === 'storm' ? 160 : 110, () => ({
          x: rnd(-40, this.w), y: rnd(-this.h, this.h),
          vx: 90, vy: rnd(560, 760), len: rnd(9, 16)
        }));
        break;
      case 'sandstorm':
        make(90, () => ({
          x: rnd(-60, this.w), y: rnd(0, this.h),
          vx: rnd(260, 420), vy: rnd(-25, 25), len: rnd(8, 20), a: rnd(0.12, 0.3)
        }));
        break;
      case 'mist':
        make(9, () => ({
          x: rnd(0, this.w), y: rnd(0, this.h),
          vx: rnd(6, 18), r: rnd(70, 150), a: rnd(0.05, 0.1)
        }));
        break;
      case 'embers':
        make(46, () => ({
          x: rnd(0, this.w), y: rnd(0, this.h),
          vy: rnd(-45, -16), wob: rnd(0, Math.PI * 2), r: rnd(1, 2.4), a: rnd(0.4, 0.9)
        }));
        break;
      case 'ashfall':
        make(60, () => ({
          x: rnd(0, this.w), y: rnd(-this.h, this.h),
          vy: rnd(25, 55), wob: rnd(0, Math.PI * 2), r: rnd(1, 2.2), a: rnd(0.25, 0.5)
        }));
        break;
    }
  }

  update(dt, time) {
    for (const p of this.particles) {
      switch (this.kind) {
        case 'rain':
        case 'storm':
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y > this.h) { p.y = -20; p.x = Math.random() * this.w - 20; }
          if (p.x > this.w) p.x = -20;
          break;
        case 'sandstorm':
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.x > this.w + 30) { p.x = -40; p.y = Math.random() * this.h; }
          break;
        case 'mist':
          p.x += p.vx * dt;
          if (p.x - p.r > this.w) p.x = -p.r;
          break;
        case 'embers':
          p.y += p.vy * dt;
          p.x += Math.sin(time / 400 + p.wob) * 18 * dt;
          if (p.y < -8) { p.y = this.h + 8; p.x = Math.random() * this.w; }
          break;
        case 'ashfall':
          p.y += p.vy * dt;
          p.x += Math.sin(time / 900 + p.wob) * 12 * dt;
          if (p.y > this.h + 8) { p.y = -8; p.x = Math.random() * this.w; }
          break;
      }
    }
    // storms flash
    if (this.kind === 'storm') {
      if (time > this.nextBolt) {
        this.lightning = 1;
        this.nextBolt = time + 4000 + Math.random() * 7000;
      }
      this.lightning = Math.max(0, this.lightning - dt * 6);
    } else {
      this.lightning = 0;
    }
  }

  draw(ctx, time) {
    const tint = TINTS[this.kind];
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    switch (this.kind) {
      case 'rain':
      case 'storm':
        ctx.strokeStyle = 'rgba(180,205,255,0.4)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (const p of this.particles) {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - 2.4, p.y + p.len);
        }
        ctx.stroke();
        break;
      case 'sandstorm':
        for (const p of this.particles) {
          ctx.strokeStyle = `rgba(225,190,120,${p.a})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.len, p.y + 1.5);
          ctx.stroke();
        }
        break;
      case 'mist':
        for (const p of this.particles) {
          const g = ctx.createRadialGradient(p.x, p.y, p.r / 4, p.x, p.y, p.r);
          g.addColorStop(0, `rgba(190,210,210,${p.a})`);
          g.addColorStop(1, 'rgba(190,210,210,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'embers':
        for (const p of this.particles) {
          const flick = 0.7 + Math.sin(time / 90 + p.wob) * 0.3;
          ctx.fillStyle = `rgba(255,${130 + flick * 60},40,${p.a * flick})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'ashfall':
        ctx.fillStyle = 'rgba(190,185,195,0.4)';
        for (const p of this.particles) {
          ctx.globalAlpha = p.a;
          ctx.fillRect(p.x, p.y, p.r, p.r);
        }
        ctx.globalAlpha = 1;
        break;
      case 'heat': {
        // shimmering heat bands
        const shimmer = Math.sin(time / 300) * 4;
        ctx.fillStyle = 'rgba(255,210,130,0.05)';
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(0, this.h * 0.25 * (i + 1) + shimmer * (i % 2 ? 1 : -1), this.w, 14);
        }
        break;
      }
    }
    if (this.lightning > 0.05) {
      ctx.fillStyle = `rgba(235,240,255,${this.lightning * 0.5})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  label() {
    return {
      clear: '', heat: '☀️ scorching', overcast: '☁️ overcast', rain: '🌧️ rain',
      storm: '⛈️ storm', sandstorm: '🌪️ sandstorm', mist: '🌫️ mist',
      embers: '🔥 ember drift', ashfall: '🌋 ashfall'
    }[this.kind] || '';
  }
}
