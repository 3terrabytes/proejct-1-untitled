// Isometric world renderer: prerendered ground plane, depth-sorted raised
// blocks (trees, houses, rocks) interleaved with entities, and a camera
// that smoothly pans to follow the player.
import { ISO, art, buildSprites, drawBlock, drawWater, noise } from './sprites.js';

export async function loadWorld() {
  const res = await fetch('/assets/maps/town.json');
  if (!res.ok) throw new Error('Could not load map');
  buildSprites();
  return new World(await res.json());
}

// Logical tile (possibly fractional) → world-space pixel centre.
export function isoX(x, y) { return (x - y) * ISO.HW; }
export function isoY(x, y) { return (x + y) * ISO.HH; }

export class World {
  constructor(mapData) {
    this.tileSize = mapData.tileSize;
    this.rows = mapData.rows;
    this.height = mapData.rows.length;
    this.width = mapData.rows[0].length;
    this.legend = mapData.legend;
    this.spawn = mapData.spawn;
    this.zones = mapData.zones;

    this.camera = { x: isoX(this.spawn.x, this.spawn.y), y: isoY(this.spawn.x, this.spawn.y) };

    this.waterTiles = [];
    this.blocks = []; // raised tiles, depth-sorted with entities every frame
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.rows[y][x];
        if (tile === 'w') this.waterTiles.push({ x, y });
        if (tile === 't') this.blocks.push({ x, y, img: () => art.tree });
        if (tile === 'h') this.blocks.push({ x, y, img: () => art.house });
        if (tile === 'd') this.blocks.push({ x, y, img: () => art.houseDoor });
        if (tile === 'k') {
          this.blocks.push({ x, y, img: () => art.rock[noise(x, y) > 0.8 ? 1 : 0] });
        }
      }
    }

    this.#prerenderGround();
  }

  tileAt(tx, ty) {
    if (ty < 0 || ty >= this.height || tx < 0 || tx >= this.width) return null;
    return this.rows[ty][tx];
  }

  isSolid(tx, ty) {
    const tile = this.tileAt(tx, ty);
    if (tile === null) return true;
    return this.legend[tile]?.solid ?? true;
  }

  zoneAt(tx, ty) {
    const zone = this.zones.find(
      (z) => tx >= z.x1 && tx <= z.x2 && ty >= z.y1 && ty <= z.y2
    );
    return zone?.name || '';
  }

  // The whole static ground plane, rendered once into an offscreen canvas.
  #prerenderGround() {
    // World-space bounds of all tile diamonds.
    this.groundOX = (this.height - 1) * ISO.HW + ISO.HW; // distance from left edge to world x=0
    this.groundOY = ISO.HH;
    const width = (this.width + this.height) * ISO.HW;
    const height = (this.width + this.height) * ISO.HH + ISO.H;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.rows[y][x];
        const sx = isoX(x, y) + this.groundOX;
        const sy = isoY(x, y) + this.groundOY;
        let img = null;
        switch (tile) {
          case 'g': img = art.grass[Math.floor(noise(x, y) * art.grass.length)]; break;
          case 'f': img = art.flowers; break;
          case 'p': img = art.path[Math.floor(noise(x, y) * art.path.length)]; break;
          case 't': img = art.grass[Math.floor(noise(x, y) * art.grass.length)]; break;
          case 'h':
          case 'd': img = art.path[0]; break;
          case 'c':
          case 'k': img = art.cave[Math.floor(noise(x, y) * art.cave.length)]; break;
          case 'w': break; // water is animated per frame
        }
        if (img) ctx.drawImage(img, sx - ISO.HW, sy - ISO.HH);
      }
    }
    this.groundCanvas = canvas;
  }

  // Smoothly pan toward the target (tile-unit float coords), same zoom.
  updateCamera(targetTileX, targetTileY, dt) {
    const tx = isoX(targetTileX, targetTileY);
    const ty = isoY(targetTileX, targetTileY);
    const ease = Math.min(1, dt * 6);
    this.camera.x += (tx - this.camera.x) * ease;
    this.camera.y += (ty - this.camera.y) * ease;
  }

  snapCamera(tileX, tileY) {
    this.camera.x = isoX(tileX, tileY);
    this.camera.y = isoY(tileX, tileY);
  }

  /**
   * Draw the world plus entities.
   * Each renderable: { px, py (tile-unit floats), paint(ctx, sx, sy),
   *                    label?: {text, color}, hpRatio? }
   */
  draw(ctx, time, renderables) {
    const { width: cw, height: ch } = ctx.canvas;
    ctx.fillStyle = '#0d0b14';
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.translate(Math.round(cw / 2 - this.camera.x), Math.round(ch / 2 - this.camera.y));

    // 1. static ground
    ctx.drawImage(this.groundCanvas, -this.groundOX, -this.groundOY);

    // 2. animated water
    for (const { x, y } of this.waterTiles) {
      drawWater(ctx, isoX(x, y), isoY(x, y), time, x, y);
    }

    // 3. depth-sorted blocks + entities (painter's algorithm on x+y)
    const queue = [];
    for (const block of this.blocks) {
      queue.push({ depth: block.x + block.y, block });
    }
    for (const r of renderables) {
      queue.push({ depth: r.px + r.py + 0.01, entity: r });
    }
    queue.sort((a, b) => a.depth - b.depth);

    const labels = [];
    for (const item of queue) {
      if (item.block) {
        drawBlock(ctx, item.block.img(), isoX(item.block.x, item.block.y), isoY(item.block.x, item.block.y));
      } else {
        const r = item.entity;
        const sx = isoX(r.px, r.py);
        const sy = isoY(r.px, r.py);
        r.paint(ctx, sx, sy);
        if (r.label || r.hpRatio !== undefined) labels.push({ r, sx, sy });
      }
    }

    // 4. labels + mini HP bars on top so trees never hide who's who
    for (const { r, sx, sy } of labels) {
      if (r.hpRatio !== undefined && r.hpRatio < 1) {
        drawMiniBar(ctx, sx, sy - r.labelHeight - 6, r.hpRatio);
      }
      if (r.label) {
        drawText(ctx, sx, sy - r.labelHeight, r.label.text, r.label.color);
      }
    }

    ctx.restore();
  }
}

function drawText(ctx, x, y, text, color) {
  ctx.font = "bold 11px 'Segoe UI', sans-serif";
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(10,8,16,0.8)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawMiniBar(ctx, x, y, ratio) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 14, y, 28, 4);
  ctx.fillStyle = ratio > 0.4 ? '#5fb86a' : '#d04545';
  ctx.fillRect(x - 13, y + 1, 26 * Math.max(0, ratio), 2);
}
