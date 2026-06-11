// Tile map rendering (Canvas 2D) + collision queries.

export async function loadWorld() {
  const res = await fetch('/assets/maps/town.json');
  if (!res.ok) throw new Error('Could not load map');
  return new World(await res.json());
}

const TILE_COLORS = {
  g: '#3e7a3a',
  f: '#3e7a3a',
  p: '#b59a6a',
  t: '#3e7a3a', // grass under the tree
  w: '#2b5f9e',
  h: '#6b5138',
  d: '#6b5138',
  c: '#4a4350',
  k: '#2a2530'
};

export class World {
  constructor(mapData) {
    this.tileSize = mapData.tileSize;
    this.rows = mapData.rows;
    this.height = mapData.rows.length;
    this.width = mapData.rows[0].length;
    this.legend = mapData.legend;
    this.spawn = mapData.spawn;
    this.zones = mapData.zones;
  }

  tileAt(tx, ty) {
    if (ty < 0 || ty >= this.height || tx < 0 || tx >= this.width) return null;
    return this.rows[ty][tx];
  }

  isSolid(tx, ty) {
    const tile = this.tileAt(tx, ty);
    if (tile === null) return true; // out of bounds
    return this.legend[tile]?.solid ?? true;
  }

  zoneAt(tx, ty) {
    const zone = this.zones.find(
      (z) => tx >= z.x1 && tx <= z.x2 && ty >= z.y1 && ty <= z.y2
    );
    return zone?.name || '';
  }

  draw(ctx, time) {
    const ts = this.tileSize;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.rows[y][x];
        const px = x * ts;
        const py = y * ts;
        ctx.fillStyle = TILE_COLORS[tile] || '#000';
        ctx.fillRect(px, py, ts, ts);

        switch (tile) {
          case 'g': this.#grassDetail(ctx, px, py, x, y); break;
          case 'f': this.#flowers(ctx, px, py, x, y); break;
          case 'p': this.#pathDetail(ctx, px, py, x, y); break;
          case 't': this.#tree(ctx, px, py); break;
          case 'w': this.#water(ctx, px, py, x, y, time); break;
          case 'h': this.#houseWall(ctx, px, py); break;
          case 'd': this.#door(ctx, px, py); break;
          case 'c': this.#caveFloor(ctx, px, py, x, y); break;
          case 'k': this.#caveWall(ctx, px, py); break;
        }
      }
    }
  }

  // Deterministic pseudo-random per tile so details don't flicker between frames.
  #noise(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  #grassDetail(ctx, px, py, x, y) {
    if (this.#noise(x, y) > 0.6) {
      ctx.fillStyle = '#356b32';
      ctx.fillRect(px + 8 + this.#noise(y, x) * 14, py + 8 + this.#noise(x + 1, y) * 14, 3, 3);
    }
  }

  #flowers(ctx, px, py, x, y) {
    this.#grassDetail(ctx, px, py, x, y);
    const colors = ['#e06a8a', '#e8d35a', '#d9e6f2'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = colors[i];
      const fx = px + 5 + this.#noise(x + i, y) * 20;
      const fy = py + 5 + this.#noise(x, y + i) * 20;
      ctx.fillRect(fx, fy, 4, 4);
    }
  }

  #pathDetail(ctx, px, py, x, y) {
    if (this.#noise(x, y) > 0.55) {
      ctx.fillStyle = '#a3895c';
      ctx.fillRect(px + this.#noise(y, x) * 24, py + this.#noise(x + 2, y) * 24, 5, 4);
    }
  }

  #tree(ctx, px, py) {
    const ts = this.tileSize;
    ctx.fillStyle = '#5a4226';
    ctx.fillRect(px + ts / 2 - 3, py + ts - 12, 6, 10);
    ctx.fillStyle = '#2c5c2a';
    ctx.beginPath();
    ctx.arc(px + ts / 2, py + 13, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#387538';
    ctx.beginPath();
    ctx.arc(px + ts / 2 - 4, py + 10, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  #water(ctx, px, py, x, y, time) {
    const ts = this.tileSize;
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    const phase = Math.sin(time / 600 + x * 1.7 + y * 2.3);
    ctx.fillRect(px + 6 + phase * 4, py + 10, 9, 2);
    ctx.fillRect(px + 16 - phase * 4, py + 22, 9, 2);
  }

  #houseWall(ctx, px, py) {
    const ts = this.tileSize;
    ctx.fillStyle = '#7d614a';
    ctx.fillRect(px, py, ts, ts / 2);
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);
  }

  #door(ctx, px, py) {
    const ts = this.tileSize;
    this.#houseWall(ctx, px, py);
    ctx.fillStyle = '#42301d';
    ctx.fillRect(px + 8, py + 8, ts - 16, ts - 8);
    ctx.fillStyle = '#c9a14d';
    ctx.fillRect(px + ts - 13, py + 18, 3, 3);
  }

  #caveFloor(ctx, px, py, x, y) {
    if (this.#noise(x, y) > 0.65) {
      ctx.fillStyle = '#403a46';
      ctx.fillRect(px + this.#noise(y, x) * 22, py + this.#noise(x + 3, y) * 22, 6, 5);
    }
  }

  #caveWall(ctx, px, py) {
    const ts = this.tileSize;
    ctx.fillStyle = '#3a3342';
    ctx.fillRect(px + 4, py + 4, 10, 8);
    ctx.fillRect(px + 18, py + 16, 9, 9);
  }
}
