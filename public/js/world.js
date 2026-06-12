// Isometric world renderer with viewport culling: only the tiles on screen
// are drawn each frame, so the map can be huge for free. Adds per-biome
// ambient tints, animated water/lava/embers/gates and a smooth follow camera.
import {
  ISO, art, buildSprites, drawBlock, drawWater, drawLava,
  drawEmberVent, drawGateTile, noise
} from './sprites.js';

export async function loadWorld() {
  const res = await fetch('/assets/maps/world.json');
  if (!res.ok) throw new Error('Could not load map');
  buildSprites();
  return new World(await res.json());
}

export function isoX(x, y) { return (x - y) * ISO.HW; }
export function isoY(x, y) { return (x + y) * ISO.HH; }

const BIOME_TINTS = {
  meadow: null,
  desert: 'rgba(255,190,110,0.07)',
  rainforest: 'rgba(30,90,70,0.12)',
  ashlands: 'rgba(190,60,30,0.10)'
};
const CAVE_TINT = 'rgba(10,5,30,0.18)';

export class World {
  constructor(mapData) {
    this.tileSize = mapData.tileSize;
    this.rows = mapData.rows;
    this.height = mapData.height;
    this.width = mapData.width;
    this.legend = mapData.legend;
    this.spawn = mapData.spawn;
    this.altar = mapData.altar;
    this.biomes = mapData.biomes;

    this.camera = { x: isoX(this.spawn.x, this.spawn.y), y: isoY(this.spawn.x, this.spawn.y) };
    this.viewW = 960;
    this.viewH = 640;
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

  biomeAt(tx) {
    return this.biomes.find((b) => tx >= b.x1 && tx <= b.x2) || null;
  }

  inCave(tx, ty) {
    const biome = this.biomeAt(tx);
    if (!biome) return false;
    const { x1, y1, x2, y2 } = biome.cave;
    return tx >= x1 - 1 && tx <= x2 + 1 && ty >= y1 - 1 && ty <= y2 + 1;
  }

  zoneAt(tx, ty) {
    const biome = this.biomeAt(tx);
    if (!biome) return '';
    return this.inCave(tx, ty) ? biome.cave.name : biome.name;
  }

  // The gate you'd hit moving right into tile x, or null.
  gateInto(tx) {
    const biome = this.biomeAt(tx);
    return biome?.gate || null;
  }

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

  groundSprite(tile, x, y) {
    const v4 = Math.floor(noise(x, y) * 4);
    const v3 = Math.floor(noise(x, y) * 3);
    const biome = this.biomeAt(x)?.id || 'meadow';
    switch (tile) {
      case 'g': return art.grass[v4];
      case 'f': return art.flowers;
      case 'p': return art.path[v3];
      case 's': return art.sand[v4];
      case 'n': return art.dune;
      case 'j': return art.jungle[v4];
      case 'v': return art.fern;
      case 'a': return art.ash[v4];
      case 'c': return art.cave[biome][v3];
      // ground under raised blocks
      case 't': return art.grass[v4];
      case 'J': return art.jungle[v4];
      case 'x': return art.sand[v4];
      case 'h':
      case 'd': return art.path[0];
      case 'k': return art.cave[biome][v3];
      default: return null;
    }
  }

  blockSprite(tile, x, y) {
    const biome = this.biomeAt(x)?.id || 'meadow';
    switch (tile) {
      case 't': return art.tree;
      case 'J': return art.jungleTree[noise(x, y) > 0.7 ? 1 : 0];
      case 'x': return art.cactus;
      case 'k': return art.rock[biome][noise(x, y) > 0.82 ? 1 : 0];
      case 'h': return art.house;
      case 'd': return art.houseDoor;
      default: return null;
    }
  }

  /**
   * Draw the visible slice of the world plus entities.
   * Renderables: { px, py, paint(ctx, sx, sy), label?, labelHeight?, hpRatio? }
   */
  draw(ctx, time, renderables) {
    const w = this.viewW;
    const h = this.viewH;

    // sky/void backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#171326');
    bg.addColorStop(1, '#0b0912');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(Math.round(w / 2 - this.camera.x), Math.round(h / 2 - this.camera.y));

    // visible tile range: invert iso projection at the view corners
    const left = this.camera.x - w / 2;
    const right = this.camera.x + w / 2;
    const top = this.camera.y - h / 2;
    const bottom = this.camera.y + h / 2;
    const tileX = (wx, wy) => wx / ISO.HW / 2 + wy / ISO.HH / 2;
    const tileY = (wx, wy) => wy / ISO.HH / 2 - wx / ISO.HW / 2;
    const corners = [
      [tileX(left, top), tileY(left, top)],
      [tileX(right, top), tileY(right, top)],
      [tileX(left, bottom), tileY(left, bottom)],
      [tileX(right, bottom), tileY(right, bottom)]
    ];
    const minX = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0]))) - 2);
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))) + 2);
    const minY = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))) - 2);
    // extra rows at the bottom so tall blocks just below the view still show
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))) + 6);

    // 1. ground pass (flat tiles, including animated ones)
    const blocks = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = this.rows[y][x];
        const sx = isoX(x, y);
        const sy = isoY(x, y);
        switch (tile) {
          case 'w': drawWater(ctx, sx, sy, time, x, y); break;
          case 'l': drawLava(ctx, sx, sy, time, x, y); break;
          case 'e': drawEmberVent(ctx, sx, sy, time, x, y, art.ash[Math.floor(noise(x, y) * 4)]); break;
          case 'G': drawGateTile(ctx, sx, sy, time, art.path[0]); break;
          default: {
            const img = this.groundSprite(tile, x, y);
            if (img) ctx.drawImage(img, sx - ISO.HW, sy - ISO.HH);
          }
        }
        const block = this.blockSprite(tile, x, y);
        if (block) blocks.push({ depth: x + y, img: block, sx, sy });
      }
    }

    // 2. depth-sorted blocks + entities
    const queue = blocks.map((b) => ({ depth: b.depth, block: b }));
    for (const r of renderables) {
      // cull entities far outside the view
      if (r.px < minX - 2 || r.px > maxX + 2 || r.py < minY - 2 || r.py > maxY + 2) continue;
      queue.push({ depth: r.px + r.py + 0.01, entity: r });
    }
    queue.sort((a, b) => a.depth - b.depth);

    const labels = [];
    for (const item of queue) {
      if (item.block) {
        drawBlock(ctx, item.block.img, item.block.sx, item.block.sy);
      } else {
        const r = item.entity;
        const sx = isoX(r.px, r.py);
        const sy = isoY(r.px, r.py);
        r.paint(ctx, sx, sy);
        if (r.label || r.hpRatio !== undefined) labels.push({ r, sx, sy });
      }
    }

    // 3. labels + mini HP bars on top
    for (const { r, sx, sy } of labels) {
      if (r.hpRatio !== undefined && r.hpRatio < 1) {
        drawMiniBar(ctx, sx, sy - (r.labelHeight ?? 44) - 6, r.hpRatio);
      }
      if (r.label) {
        drawText(ctx, sx, sy - (r.labelHeight ?? 44), r.label.text, r.label.color);
      }
    }

    ctx.restore();

    // 4. ambience: biome tint + vignette
    const playerTileX = tileX(this.camera.x, this.camera.y);
    const playerTileY = tileY(this.camera.x, this.camera.y);
    const biome = this.biomeAt(Math.round(playerTileX));
    const tint = this.inCave(Math.round(playerTileX), Math.round(playerTileY))
      ? CAVE_TINT
      : BIOME_TINTS[biome?.id];
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);
    }
    if (!this.vignette || this.vignette.width !== w) this.#makeVignette(w, h);
    ctx.drawImage(this.vignette, 0, 0);
  }

  #makeVignette(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const vctx = canvas.getContext('2d');
    const grad = vctx.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 0.95);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(5,3,12,0.42)');
    vctx.fillStyle = grad;
    vctx.fillRect(0, 0, w, h);
    this.vignette = canvas;
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
