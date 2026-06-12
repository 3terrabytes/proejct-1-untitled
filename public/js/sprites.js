// Procedural isometric art for all four biomes: tile sprites, raised blocks,
// animated ground (water/lava/embers/gates) and characters. Static sprites are
// rendered once into offscreen canvases; characters and glow tiles animate.

export const ISO = { W: 64, H: 32, HW: 32, HH: 16 };

// ---------- colour helpers ----------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(hex, factor) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function diamondPath(ctx, cx, cy, hw = ISO.HW, hh = ISO.HH) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
}

function makeCanvas(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'));
  return canvas;
}

export function noise(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.rect(x, y, w, h);
}

// ---------- flat ground tiles (64×32, centre at 32,16) ----------

function groundTile(base, detail, variant = 0) {
  return makeCanvas(ISO.W, ISO.H, (ctx) => {
    // sunlight from the north-west: top edge brighter, bottom edge darker
    const grad = ctx.createLinearGradient(8, 0, 56, ISO.H);
    grad.addColorStop(0, shade(base, 1.14));
    grad.addColorStop(0.55, base);
    grad.addColorStop(1, shade(base, 0.84));
    diamondPath(ctx, 32, 16);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.save();
    diamondPath(ctx, 32, 16);
    ctx.clip();
    // fine texture grain
    for (let i = 0; i < 14; i++) {
      const gx = 4 + noise(variant * 3 + i, i) * 56;
      const gy = 2 + noise(i, variant * 5 + i) * 28;
      ctx.fillStyle = noise(i, variant) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(gx, gy, 2.5, 1.6);
    }
    if (detail) detail(ctx, variant);
    ctx.restore();
    // soft seam so tiles read as ground, not a grid
    diamondPath(ctx, 32, 16, 31.5, 15.7);
    ctx.strokeStyle = 'rgba(0,0,0,0.045)';
    ctx.stroke();
  });
}

const grassDetail = (ctx, v) => {
  ctx.strokeStyle = 'rgba(22,84,30,0.55)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    const bx = 10 + noise(v, i + 20) * 44;
    const by = 8 + noise(i + 20, v) * 18;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + 1, by - 3, bx + 2.5, by - 4.5);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(214,232,160,0.25)';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(8 + noise(v + 9, i) * 48, 6 + noise(i, v + 9) * 20, 2, 1.4);
  }
};

const sandDetail = (ctx, v) => {
  // wind ripples
  ctx.strokeStyle = 'rgba(140,100,55,0.3)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 3; i++) {
    const ry = 8 + i * 7 + noise(v, i) * 3;
    ctx.beginPath();
    ctx.moveTo(8, ry);
    ctx.quadraticCurveTo(32, ry - 3.5, 56, ry);
    ctx.stroke();
  }
};

const jungleDetail = (ctx, v) => {
  // leaf litter
  const colors = ['rgba(38,92,40,0.7)', 'rgba(95,140,52,0.55)', 'rgba(24,60,30,0.6)'];
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = colors[i % 3];
    const lx = 8 + noise(v + 2, i) * 48;
    const ly = 6 + noise(i, v + 2) * 20;
    ctx.beginPath();
    ctx.ellipse(lx, ly, 3, 1.6, noise(i, v) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
};

const ashDetail = (ctx, v) => {
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  const sx = 12 + noise(v, 60) * 34;
  const sy = 8 + noise(60, v) * 14;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + 7, sy + 3);
  ctx.lineTo(sx + 10, sy + 1);
  ctx.stroke();
  // faint embers in the ash
  ctx.fillStyle = 'rgba(255,120,50,0.35)';
  for (let i = 0; i < 2; i++) {
    ctx.fillRect(10 + noise(v + 5, i) * 44, 8 + noise(i, v + 5) * 16, 1.6, 1.6);
  }
};

const pathDetail = (ctx, v) => {
  ctx.fillStyle = 'rgba(116,88,52,0.5)';
  for (let i = 0; i < 5; i++) {
    const px = 10 + noise(v + 30, i) * 44;
    const py = 7 + noise(i, v + 30) * 18;
    ctx.beginPath();
    ctx.ellipse(px, py, 2.8, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,0.12)';
    ctx.fillRect(px - 2, py - 2.4, 3, 1);
    ctx.fillStyle = 'rgba(116,88,52,0.5)';
  }
};

function caveDetail(ctx, v) {
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = 1;
  const sx = 12 + noise(v, 41) * 34;
  const sy = 7 + noise(41, v) * 16;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + 8, sy + 3);
  ctx.lineTo(sx + 12, sy + 1);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(8 + noise(v + 4, i) * 48, 6 + noise(i, v + 4) * 20, 2.5, 1.6);
  }
}

const flowersTile = () =>
  groundTile('#4f9440', (ctx, v) => {
    grassDetail(ctx, v);
    const colors = ['#e06a8a', '#e8d35a', '#eef2f7', '#c77ddb'];
    for (let i = 0; i < 4; i++) {
      const fx = 12 + noise(3, i) * 40;
      const fy = 8 + noise(i, 3) * 16;
      ctx.strokeStyle = '#2c6b2c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx, fy + 4);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.fillStyle = colors[i];
      for (let p = 0; p < 4; p++) {
        const a = (p / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a) * 1.8, fy + Math.sin(a) * 1.8, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f6e27a';
      ctx.beginPath();
      ctx.arc(fx, fy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  });

const duneTile = () =>
  groundTile('#dabf85', (ctx, v) => {
    sandDetail(ctx, v);
    // a ridged dune crest with highlight + shadow
    ctx.strokeStyle = 'rgba(255,245,215,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, 18);
    ctx.quadraticCurveTo(32, 8, 52, 18);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,85,45,0.4)';
    ctx.beginPath();
    ctx.moveTo(12, 20);
    ctx.quadraticCurveTo(32, 10, 52, 20);
    ctx.stroke();
  });

const fernTile = () =>
  groundTile('#33502f', (ctx, v) => {
    jungleDetail(ctx, v);
    // a leafy tuft
    ctx.strokeStyle = '#5fae4a';
    ctx.lineWidth = 1.8;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(32, 22);
      ctx.quadraticCurveTo(32 + i * 5, 12, 32 + i * 8, 8 + Math.abs(i) * 2);
      ctx.stroke();
    }
  });

// ---------- raised blocks (base diamond centre at (32, height-16)) ----------

function blockFaces(ctx, cx, baseY, height, leftColor, rightColor) {
  ctx.beginPath();
  ctx.moveTo(cx - ISO.HW, baseY - height);
  ctx.lineTo(cx, baseY - height + ISO.HH);
  ctx.lineTo(cx, baseY + ISO.HH);
  ctx.lineTo(cx - ISO.HW, baseY);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + ISO.HW, baseY - height);
  ctx.lineTo(cx, baseY - height + ISO.HH);
  ctx.lineTo(cx, baseY + ISO.HH);
  ctx.lineTo(cx + ISO.HW, baseY);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
}

function baseShadow(ctx, cx, baseY, w = 24, h = 9) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

function treeBlock() {
  const H = 100;
  return makeCanvas(ISO.W, H, (ctx) => {
    const baseY = H - ISO.HH;
    baseShadow(ctx, 32, baseY, 18, 8);
    const trunk = ctx.createLinearGradient(27, 0, 38, 0);
    trunk.addColorStop(0, '#43301d');
    trunk.addColorStop(0.5, '#6b4d2e');
    trunk.addColorStop(1, '#4a3420');
    ctx.fillStyle = trunk;
    ctx.beginPath();
    ctx.moveTo(28, baseY);
    ctx.quadraticCurveTo(30, baseY - 18, 29, baseY - 30);
    ctx.lineTo(35, baseY - 30);
    ctx.quadraticCurveTo(34, baseY - 18, 36, baseY);
    ctx.closePath();
    ctx.fill();
    const blobs = [
      [32, baseY - 52, 22, '#1f4a1d'],
      [20, baseY - 44, 13, '#27591f'],
      [45, baseY - 46, 13, '#27591f'],
      [32, baseY - 64, 15, '#2f6a26'],
      [24, baseY - 57, 9, '#3a7d2e'],
      [40, baseY - 55, 9, '#3a7d2e']
    ];
    for (const [bx, by, r, color] of blobs) {
      const g = ctx.createRadialGradient(bx - r / 3, by - r / 2.5, r / 5, bx, by, r);
      g.addColorStop(0, shade(color, 1.35));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,220,0.16)';
    ctx.beginPath();
    ctx.arc(25, baseY - 66, 8, 0, Math.PI * 2);
    ctx.fill();
  });
}

function jungleTreeBlock(variant) {
  const H = 118;
  return makeCanvas(ISO.W, H, (ctx) => {
    const baseY = H - ISO.HH;
    baseShadow(ctx, 32, baseY, 19, 8);
    ctx.fillStyle = '#3a2c1c';
    ctx.beginPath();
    ctx.moveTo(29, baseY);
    ctx.lineTo(30, baseY - 48);
    ctx.lineTo(34, baseY - 48);
    ctx.lineTo(35, baseY);
    ctx.closePath();
    ctx.fill();
    // canopy: broad layered fronds
    const layers = [
      [baseY - 56, 26, '#143d20'],
      [baseY - 66, 21, '#1c5128'],
      [baseY - 75, 15, '#2a6b33']
    ];
    for (const [cy, r, color] of layers) {
      const g = ctx.createRadialGradient(28, cy - 6, r / 4, 32, cy, r);
      g.addColorStop(0, shade(color, 1.4));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(32, cy, r, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // hanging vine
    if (variant === 1) {
      ctx.strokeStyle = '#3f7a35';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(48, baseY - 58);
      ctx.quadraticCurveTo(50, baseY - 38, 47, baseY - 24);
      ctx.stroke();
    }
  });
}

function cactusBlock() {
  const H = 78;
  return makeCanvas(ISO.W, H, (ctx) => {
    const baseY = H - ISO.HH;
    baseShadow(ctx, 32, baseY, 13, 6);
    const body = ctx.createLinearGradient(24, 0, 42, 0);
    body.addColorStop(0, '#5c9444');
    body.addColorStop(0.5, '#3f7330');
    body.addColorStop(1, '#2f5c25');
    ctx.fillStyle = body;
    roundRect(ctx, 27, baseY - 42, 11, 42, 5);
    ctx.fill();
    roundRect(ctx, 16, baseY - 32, 9, 14, 4);
    ctx.fill();
    ctx.fillRect(20, baseY - 22, 8, 4);
    roundRect(ctx, 40, baseY - 26, 9, 12, 4);
    ctx.fill();
    ctx.fillRect(37, baseY - 18, 6, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (const lx of [30, 33.5]) {
      ctx.beginPath();
      ctx.moveTo(lx, baseY - 40);
      ctx.lineTo(lx, baseY - 4);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(26 + noise(i, 7) * 12, baseY - 40 + noise(7, i) * 36, 1.2, 1.2);
    }
    // flower on top
    ctx.fillStyle = '#e87aa0';
    ctx.beginPath();
    ctx.arc(32.5, baseY - 44, 2.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function rockBlock(tint, variant) {
  const WALL = 22;
  const H = ISO.H + WALL;
  return makeCanvas(ISO.W, H, (ctx) => {
    const baseY = H - ISO.HH;
    blockFaces(ctx, 32, baseY, WALL, tint.left, tint.right);
    const top = ctx.createLinearGradient(0, baseY - WALL - ISO.HH, 24, baseY - WALL + ISO.HH);
    top.addColorStop(0, tint.topLight);
    top.addColorStop(1, tint.topDark);
    diamondPath(ctx, 32, baseY - WALL);
    ctx.fillStyle = top;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    const cx1 = 8 + noise(variant, 1) * 16;
    ctx.beginPath();
    ctx.moveTo(cx1, baseY - 10);
    ctx.lineTo(cx1 + 5, baseY - 4);
    ctx.moveTo(40 + noise(1, variant) * 14, baseY - 14);
    ctx.lineTo(44 + noise(1, variant) * 14, baseY - 6);
    ctx.stroke();
    // top edge highlight (sunlit rim)
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(0, baseY - WALL);
    ctx.lineTo(32, baseY - WALL - ISO.HH);
    ctx.stroke();
    if (variant === 1 && tint.glow) {
      ctx.fillStyle = tint.glow;
      ctx.beginPath();
      ctx.arc(32 + (noise(variant, 9) - 0.5) * 28, baseY - WALL, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function houseBlock(withDoor) {
  const WALL = 32;
  const H = ISO.H + WALL;
  return makeCanvas(ISO.W, H, (ctx) => {
    const baseY = H - ISO.HH;
    blockFaces(ctx, 32, baseY, WALL, '#8f7c5e', '#c9b693');
    // timber framing
    ctx.strokeStyle = 'rgba(66,46,28,0.6)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, baseY - WALL + 2);
    ctx.lineTo(32, baseY - WALL + ISO.HH + 2);
    ctx.lineTo(64, baseY - WALL + 2);
    ctx.moveTo(0, baseY - 2);
    ctx.lineTo(0, baseY - WALL + 2);
    ctx.moveTo(64, baseY - 2);
    ctx.lineTo(64, baseY - WALL + 2);
    ctx.stroke();
    if (withDoor) {
      ctx.fillStyle = '#37250f';
      ctx.beginPath();
      ctx.moveTo(38, baseY - 1);
      ctx.lineTo(38, baseY - 17);
      ctx.quadraticCurveTo(45, baseY - 24, 52, baseY - 13);
      ctx.lineTo(52, baseY + 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(201,161,77,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#e9bd62';
      ctx.beginPath();
      ctx.arc(49, baseY - 8, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#4a3b22';
      roundRect(ctx, 41, baseY - 22, 11, 10, 2);
      ctx.fill();
      const glow = ctx.createRadialGradient(46.5, baseY - 17, 1, 46.5, baseY - 17, 7);
      glow.addColorStop(0, 'rgba(255,225,140,0.95)');
      glow.addColorStop(1, 'rgba(255,225,140,0.2)');
      ctx.fillStyle = glow;
      ctx.fillRect(42, baseY - 21, 9, 8);
      ctx.strokeStyle = '#4a3b22';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(46.5, baseY - 21);
      ctx.lineTo(46.5, baseY - 13);
      ctx.moveTo(42, baseY - 17);
      ctx.lineTo(51, baseY - 17);
      ctx.stroke();
    }
    // shingled roof with ridge highlight
    const roof = ctx.createLinearGradient(0, baseY - WALL - ISO.HH, 20, baseY - WALL + ISO.HH);
    roof.addColorStop(0, '#c96a40');
    roof.addColorStop(1, '#7e3a20');
    diamondPath(ctx, 32, baseY - WALL);
    ctx.fillStyle = roof;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(32 - i * 7.5, baseY - WALL - ISO.HH + i * 3.8);
      ctx.lineTo(32 + i * 7.5, baseY - WALL - ISO.HH + i * 3.8);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,235,200,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, baseY - WALL);
    ctx.lineTo(32, baseY - WALL - ISO.HH);
    ctx.stroke();
  });
}

// ---------- sprite registry ----------

export const art = {};

const CAVE_TINTS = {
  meadow: {
    floor: '#4c4454',
    rock: { left: '#352e3d', right: '#443c4d', topLight: '#6e6580', topDark: '#574e66', glow: 'rgba(120,220,180,0.6)' }
  },
  desert: {
    floor: '#7d6647',
    rock: { left: '#5c452c', right: '#75593a', topLight: '#a98e62', topDark: '#8a7048', glow: 'rgba(255,200,90,0.55)' }
  },
  rainforest: {
    floor: '#3a4a3c',
    rock: { left: '#27352b', right: '#324438', topLight: '#5a7260', topDark: '#46594c', glow: 'rgba(140,255,170,0.5)' }
  },
  ashlands: {
    floor: '#43333a',
    rock: { left: '#2d2026', right: '#3c2b32', topLight: '#5f4750', topDark: '#4c3840', glow: 'rgba(255,120,60,0.7)' }
  }
};

export function buildSprites() {
  art.grass = [0, 1, 2, 3].map((v) => groundTile(['#4f9440', '#4a8c3c', '#549a45', '#478a3d'][v], grassDetail, v));
  art.flowers = flowersTile();
  art.path = [0, 1, 2].map((v) => groundTile('#c4a571', pathDetail, v));
  art.sand = [0, 1, 2, 3].map((v) => groundTile(['#e0c48c', '#d9bd83', '#e5ca94', '#d4b87d'][v], sandDetail, v));
  art.dune = duneTile();
  art.jungle = [0, 1, 2, 3].map((v) => groundTile(['#33502f', '#2e4a2c', '#385633', '#2b452a'][v], jungleDetail, v));
  art.fern = fernTile();
  art.ash = [0, 1, 2, 3].map((v) => groundTile(['#55474c', '#4e4146', '#5b4c51', '#483c41'][v], ashDetail, v));

  art.cave = {};
  art.rock = {};
  for (const [biome, tint] of Object.entries(CAVE_TINTS)) {
    art.cave[biome] = [0, 1, 2].map((v) => groundTile(tint.floor, caveDetail, v));
    art.rock[biome] = [rockBlock(tint.rock, 0), rockBlock(tint.rock, 1)];
  }

  art.tree = treeBlock();
  art.jungleTree = [jungleTreeBlock(0), jungleTreeBlock(1)];
  art.cactus = cactusBlock();
  art.house = houseBlock(false);
  art.houseDoor = houseBlock(true);
}

// Blit a block so its base diamond centre lands on (sx, sy).
export function drawBlock(ctx, img, sx, sy) {
  ctx.drawImage(img, sx - ISO.HW, sy + ISO.HH - img.height);
}

// ---------- animated ground tiles ----------

export function drawWater(ctx, sx, sy, time, tx, ty) {
  const grad = ctx.createLinearGradient(sx, sy - ISO.HH, sx, sy + ISO.HH);
  grad.addColorStop(0, '#4286c9');
  grad.addColorStop(1, '#1f4a82');
  diamondPath(ctx, sx, sy);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  diamondPath(ctx, sx, sy);
  ctx.clip();
  const phase = time / 700 + tx * 1.3 + ty * 2.1;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) {
    const wy = sy - 6 + i * 9 + Math.sin(phase + i * 2) * 2;
    const wx = sx - 12 + Math.cos(phase + i) * 6;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.quadraticCurveTo(wx + 6, wy - 2.5, wx + 12, wy);
    ctx.stroke();
  }
  // sun glint
  ctx.fillStyle = `rgba(255,255,255,${0.12 + Math.sin(phase * 1.7) * 0.08})`;
  ctx.beginPath();
  ctx.ellipse(sx - 6, sy - 3, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawLava(ctx, sx, sy, time, tx, ty) {
  const phase = time / 900 + tx * 2.7 + ty * 1.9;
  const heat = 0.5 + Math.sin(phase) * 0.5;
  const grad = ctx.createLinearGradient(sx, sy - ISO.HH, sx, sy + ISO.HH);
  grad.addColorStop(0, '#ff8a30');
  grad.addColorStop(1, '#b3300e');
  diamondPath(ctx, sx, sy);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  diamondPath(ctx, sx, sy);
  ctx.clip();
  ctx.strokeStyle = `rgba(255,235,140,${0.35 + heat * 0.3})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(sx - 16, sy + Math.sin(phase) * 4);
  ctx.quadraticCurveTo(sx, sy - 5 + Math.cos(phase) * 3, sx + 16, sy + Math.sin(phase + 1) * 4);
  ctx.stroke();
  ctx.fillStyle = `rgba(60,10,0,0.55)`;
  for (let i = 0; i < 3; i++) {
    const cx = sx - 14 + noise(tx + i, ty) * 28;
    const cy = sy - 6 + noise(ty, tx + i) * 12;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // glow halo
  const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 36);
  glow.addColorStop(0, `rgba(255,120,40,${0.18 + heat * 0.1})`);
  glow.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 36, sy - 22, 72, 44);
}

export function drawEmberVent(ctx, sx, sy, time, tx, ty, baseTile) {
  ctx.drawImage(baseTile, sx - ISO.HW, sy - ISO.HH);
  const phase = time / 500 + tx * 3.1 + ty * 1.3;
  const pulse = 0.5 + Math.sin(phase) * 0.5;
  ctx.fillStyle = `rgba(255,110,40,${0.25 + pulse * 0.4})`;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 7 + pulse * 3, 3.5 + pulse * 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,210,120,${0.5 + pulse * 0.4})`;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 3, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawGateTile(ctx, sx, sy, time, baseTile) {
  ctx.drawImage(baseTile, sx - ISO.HW, sy - ISO.HH);
  const pulse = 0.5 + Math.sin(time / 600) * 0.5;
  ctx.strokeStyle = `rgba(150,120,255,${0.4 + pulse * 0.4})`;
  ctx.lineWidth = 1.6;
  diamondPath(ctx, sx, sy, 22, 11);
  ctx.stroke();
  ctx.fillStyle = `rgba(150,120,255,${0.1 + pulse * 0.12})`;
  diamondPath(ctx, sx, sy, 22, 11);
  ctx.fill();
}

// ---------- characters ----------

const PLAYER_PALETTES = ['#3d6fd0', '#2fa39a', '#b14fc9', '#cf7c2f', '#5a9e3d', '#c9486b'];
const HAIR_COLORS = ['#2e2018', '#5b3a1e', '#1c1c22', '#7a5230', '#3f3f46'];

export function playerPalette(playerId) {
  return PLAYER_PALETTES[Math.abs(playerId) % PLAYER_PALETTES.length];
}

function drawShadow(ctx, x, y, w = 15, h = 6) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

function outline(ctx, drawFn) {
  drawFn();
  ctx.strokeStyle = 'rgba(8,6,14,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// A small animated humanoid with feet at (x, y). flip mirrors left/right.
export function drawHumanoid(ctx, x, y, opts = {}) {
  const {
    shirt = '#3d6fd0', pants = '#33415c', skin = '#e8c39e',
    hair = '#2e2018', walkPhase = 0, moving = false, scale = 1,
    flip = false, accessory = null, time = 0
  } = opts;
  const swing = moving ? Math.sin(walkPhase) : 0;
  const bob = moving ? Math.abs(Math.sin(walkPhase)) * 1.7 : Math.sin(time / 600) * 0.5;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -scale : scale, scale);
  drawShadow(ctx, 0, 0);
  ctx.translate(0, -bob);

  ctx.fillStyle = pants;
  ctx.fillRect(-5, -9 + swing * 2, 4, 9 - swing * 2);
  ctx.fillRect(1, -9 - swing * 2, 4, 9 + swing * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-5, -1 + swing * 1.2, 4, 1.6);
  ctx.fillRect(1, -1 - swing * 1.2, 4, 1.6);

  const torso = ctx.createLinearGradient(-8, -24, 8, -8);
  torso.addColorStop(0, shade(shirt, 1.3));
  torso.addColorStop(1, shade(shirt, 0.75));
  outline(ctx, () => {
    roundRect(ctx, -8, -23, 16, 15, 4.5);
    ctx.fillStyle = torso;
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(40,28,16,0.85)';
  ctx.fillRect(-8, -11, 16, 2.5);
  ctx.fillStyle = '#d8c27a';
  ctx.fillRect(-1.5, -11, 3, 2.5);

  ctx.fillStyle = shade(shirt, 0.68);
  roundRect(ctx, -11, -22 + swing * 2.5, 3.6, 11, 2);
  ctx.fill();
  roundRect(ctx, 7.4, -22 - swing * 2.5, 3.6, 11, 2);
  ctx.fill();

  const headGrad = ctx.createRadialGradient(-2, -31, 2, 0, -29, 8);
  headGrad.addColorStop(0, shade(skin, 1.14));
  headGrad.addColorStop(1, shade(skin, 0.86));
  outline(ctx, () => {
    ctx.beginPath();
    ctx.arc(0, -29, 7, 0, Math.PI * 2);
    ctx.fillStyle = headGrad;
    ctx.fill();
  });
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(0, -30.5, 7, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(3, -35, 6.8, -32);
  ctx.fill();
  ctx.fillStyle = '#26222b';
  ctx.fillRect(-3.5, -29.5, 1.8, 2.2);
  ctx.fillRect(1.7, -29.5, 1.8, 2.2);

  if (accessory) accessory(ctx);
  ctx.restore();
}

export function drawAdventurer(ctx, x, y, playerId, opts = {}) {
  drawHumanoid(ctx, x, y, {
    ...opts,
    shirt: playerPalette(playerId),
    hair: HAIR_COLORS[Math.abs(playerId * 7 + 3) % HAIR_COLORS.length],
    accessory: (a) => {
      a.fillStyle = '#b8bec6';
      a.save();
      a.translate(10, -10);
      a.rotate(0.6);
      a.fillRect(-1, 0, 2, 9.5);
      a.fillStyle = '#6b4d2e';
      a.fillRect(-2.6, -2, 5.2, 2.4);
      a.restore();
    }
  });
}

export function drawBlacksmith(ctx, x, y, opts = {}) {
  drawHumanoid(ctx, x, y, {
    ...opts, shirt: '#7a4a2b', pants: '#3b3b42', skin: '#d9a06b', hair: '#3f3f46',
    accessory: (a) => {
      a.fillStyle = '#4c4c54';
      a.beginPath();
      a.arc(0, -25.5, 4.6, 0.15 * Math.PI, 0.85 * Math.PI);
      a.fill();
      a.fillStyle = '#46311f';
      roundRect(a, -5.5, -20, 11, 11, 2);
      a.fill();
      a.strokeStyle = 'rgba(0,0,0,0.3)';
      a.stroke();
      a.fillStyle = '#8a6a40';
      a.fillRect(11, -16, 2.4, 10);
      a.fillStyle = '#aeb4bc';
      roundRect(a, 8.6, -18.5, 7.2, 4, 1);
      a.fill();
    }
  });
}

export function drawElder(ctx, x, y, opts = {}) {
  drawHumanoid(ctx, x, y, {
    ...opts, shirt: '#5d3a8c', pants: '#46306b', skin: '#e8c39e', hair: '#cfcfd6',
    accessory: (a) => {
      a.fillStyle = '#4d2f78';
      a.beginPath();
      a.moveTo(-8, -10);
      a.lineTo(8, -10);
      a.lineTo(10.5, 0);
      a.lineTo(-10.5, 0);
      a.closePath();
      a.fill();
      a.fillStyle = '#5d3a8c';
      a.beginPath();
      a.arc(0, -30, 7.8, Math.PI * 0.95, Math.PI * 2.05);
      a.fill();
      a.strokeStyle = '#6b4d2e';
      a.lineWidth = 2.4;
      a.beginPath();
      a.moveTo(-12, 0);
      a.lineTo(-12, -34);
      a.stroke();
      const glow = a.createRadialGradient(-12, -36, 0.5, -12, -36, 6);
      glow.addColorStop(0, 'rgba(160,220,255,0.95)');
      glow.addColorStop(1, 'rgba(160,220,255,0)');
      a.fillStyle = glow;
      a.beginPath();
      a.arc(-12, -36, 6, 0, Math.PI * 2);
      a.fill();
    }
  });
}

export function drawMerchant(ctx, x, y, opts = {}) {
  drawHumanoid(ctx, x, y, {
    ...opts, shirt: '#9c6b2f', pants: '#4a3a28', skin: '#e0b48c', hair: '#5b3a1e',
    accessory: (a) => {
      // a huge backpack stacked with goods
      a.fillStyle = '#6b4a2a';
      roundRect(a, -16, -28, 9, 18, 3);
      a.fill();
      a.strokeStyle = 'rgba(0,0,0,0.35)';
      a.stroke();
      a.fillStyle = '#8a6a40';
      roundRect(a, -15, -33, 7, 6, 2);
      a.fill();
      a.fillStyle = '#b3452f';
      a.beginPath();
      a.arc(-11.5, -36, 3, 0, Math.PI * 2);
      a.fill();
      // straw hat
      a.fillStyle = '#d9b96a';
      a.beginPath();
      a.ellipse(0, -33, 9.5, 3.2, 0, 0, Math.PI * 2);
      a.fill();
      a.beginPath();
      a.arc(0, -34.5, 5, Math.PI, 0);
      a.fill();
      // walking stick
      a.strokeStyle = '#6b4d2e';
      a.lineWidth = 2;
      a.beginPath();
      a.moveTo(11, 0);
      a.lineTo(11, -26);
      a.stroke();
    }
  });
}

export function drawGoblin(ctx, x, y, opts = {}) {
  const { walkPhase = 0, moving = false, brute = false, flip = false, time = 0 } = opts;
  const scale = (opts.scale || 1) * (brute ? 1.35 : 1);
  const skin = brute ? '#5b8d33' : '#6da33f';
  const swing = moving ? Math.sin(walkPhase) : 0;
  const bob = moving ? Math.abs(Math.sin(walkPhase)) * 1.6 : Math.sin(time / 500) * 0.5;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -scale : scale, scale);
  drawShadow(ctx, 0, 0, brute ? 16 : 13, 5.5);
  ctx.translate(0, -bob);

  ctx.fillStyle = shade(skin, 0.7);
  ctx.fillRect(-5, -7 + swing * 2, 4, 7 - swing * 2);
  ctx.fillRect(1, -7 - swing * 2, 4, 7 + swing * 2);
  const body = ctx.createLinearGradient(-9, -20, 9, -6);
  body.addColorStop(0, shade(skin, 1.25));
  body.addColorStop(1, shade(skin, 0.74));
  outline(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(0, -13, 9, 8.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
  });
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(-5, -8, 10, 4);
  ctx.save();
  ctx.translate(9, -14);
  ctx.rotate(0.5 + swing * 0.25);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-1.5, 0, 3, 13);
  ctx.fillStyle = '#5d3d22';
  ctx.beginPath();
  ctx.arc(0, 14, brute ? 4.5 : 3.5, 0, Math.PI * 2);
  ctx.fill();
  if (brute) {
    ctx.fillStyle = '#cfd2d6';
    ctx.fillRect(-3.5, 12, 2, 2);
    ctx.fillRect(2, 12, 2, 2);
  }
  ctx.restore();
  const headGrad = ctx.createRadialGradient(-2, -25, 2, 0, -23, 8);
  headGrad.addColorStop(0, shade(skin, 1.18));
  headGrad.addColorStop(1, shade(skin, 0.82));
  outline(ctx, () => {
    ctx.beginPath();
    ctx.arc(0, -23, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = headGrad;
    ctx.fill();
  });
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-7, -25); ctx.lineTo(-14, -28); ctx.lineTo(-7, -21);
  ctx.moveTo(7, -25); ctx.lineTo(14, -28); ctx.lineTo(7, -21);
  ctx.fill();
  ctx.fillStyle = '#e23c34';
  ctx.fillRect(-4, -24.5, 2.4, 2);
  ctx.fillRect(1.6, -24.5, 2.4, 2);
  ctx.fillStyle = '#f2efe4';
  ctx.fillRect(-3, -18.5, 1.6, 2);
  ctx.fillRect(1.4, -18.5, 1.6, 2);
  ctx.restore();
}

export function drawScorpion(ctx, x, y, opts = {}) {
  const { walkPhase = 0, moving = false, flip = false, time = 0, scale = 1 } = opts;
  const sway = moving ? Math.sin(walkPhase) * 1.5 : Math.sin(time / 400) * 0.8;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -scale : scale, scale);
  drawShadow(ctx, 0, 0, 16, 5);
  // legs
  ctx.strokeStyle = '#7a4a18';
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 4; i++) {
    const lx = -8 + i * 5;
    ctx.beginPath();
    ctx.moveTo(lx, -6);
    ctx.lineTo(lx - 4, -2 + (i % 2 ? sway : -sway));
    ctx.lineTo(lx - 5, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lx + 2, -6);
    ctx.lineTo(lx + 6, -2 + (i % 2 ? -sway : sway));
    ctx.lineTo(lx + 7, 0);
    ctx.stroke();
  }
  // segmented body
  const body = ctx.createLinearGradient(-12, -14, 10, -2);
  body.addColorStop(0, '#c98a3a');
  body.addColorStop(1, '#8a5a1c');
  outline(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(-2, -7, 12, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
  });
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  for (let i = -8; i <= 6; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, -12);
    ctx.quadraticCurveTo(i + 1, -7, i, -2);
    ctx.stroke();
  }
  // pincers
  ctx.fillStyle = '#a86a24';
  outline(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(13, -8, 4.5, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.beginPath();
  ctx.ellipse(14, -4, 3.5, 2.4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // tail curling over with stinger
  ctx.strokeStyle = '#a86a24';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-12, -8);
  ctx.quadraticCurveTo(-20, -16 + sway, -14, -24 + sway);
  ctx.stroke();
  ctx.fillStyle = '#5d3a10';
  ctx.beginPath();
  ctx.moveTo(-14, -26 + sway);
  ctx.lineTo(-10, -22 + sway);
  ctx.lineTo(-15, -21 + sway);
  ctx.closePath();
  ctx.fill();
  // eyes
  ctx.fillStyle = '#2c1a08';
  ctx.fillRect(8, -10, 2, 2);
  ctx.restore();
}

export function drawBandit(ctx, x, y, opts = {}) {
  drawHumanoid(ctx, x, y, {
    ...opts, shirt: '#8a3030', pants: '#3c3328', skin: '#caa176', hair: '#1c1c22',
    accessory: (a) => {
      // head wrap + face mask
      a.fillStyle = '#d8cdb4';
      a.beginPath();
      a.arc(0, -30, 7.2, Math.PI * 0.9, Math.PI * 2.1);
      a.fill();
      a.fillRect(-7, -27, 14, 3.6);
      // scimitar
      a.strokeStyle = '#c9ced6';
      a.lineWidth = 2.6;
      a.beginPath();
      a.moveTo(10, -8);
      a.quadraticCurveTo(17, -16, 14, -24);
      a.stroke();
      a.fillStyle = '#6b4d2e';
      a.fillRect(8.6, -9, 3, 4);
    }
  });
}

export function drawViper(ctx, x, y, opts = {}) {
  const { walkPhase = 0, moving = false, flip = false, time = 0, scale = 1 } = opts;
  const sway = Math.sin((moving ? walkPhase : time / 350)) * 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -scale : scale, scale);
  drawShadow(ctx, 0, 0, 14, 5);
  // coiled body
  const body = ctx.createLinearGradient(-12, -16, 12, 0);
  body.addColorStop(0, '#3fae5c');
  body.addColorStop(1, '#1f7038');
  ctx.fillStyle = body;
  for (const [cx, cy, r] of [[0, -4, 11], [0, -8, 8.5], [0, -11.5, 6]]) {
    outline(ctx, () => {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();
    });
  }
  // raised neck + head with hood
  ctx.strokeStyle = '#2f8a48';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(2, -12);
  ctx.quadraticCurveTo(8 + sway, -20, 5 + sway, -27);
  ctx.stroke();
  outline(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(5 + sway, -30, 6.5, 5, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#2f8a48';
    ctx.fill();
  });
  // eyes + tongue
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.arc(8 + sway, -31, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c1c22';
  ctx.beginPath();
  ctx.arc(8.3 + sway, -31, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e0445c';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(11 + sway, -29);
  ctx.lineTo(15 + sway, -28);
  ctx.moveTo(15 + sway, -28);
  ctx.lineTo(16.5 + sway, -29.5);
  ctx.moveTo(15 + sway, -28);
  ctx.lineTo(16.5 + sway, -26.8);
  ctx.stroke();
  // diamond pattern
  ctx.fillStyle = 'rgba(255,235,140,0.5)';
  for (const [px, py] of [[-5, -5], [3, -4], [-2, -9], [4, -12]]) {
    ctx.beginPath();
    ctx.moveTo(px, py - 1.6);
    ctx.lineTo(px + 1.6, py);
    ctx.lineTo(px, py + 1.6);
    ctx.lineTo(px - 1.6, py);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawPanther(ctx, x, y, opts = {}) {
  const { walkPhase = 0, moving = false, flip = false, time = 0, scale = 1 } = opts;
  const stride = moving ? Math.sin(walkPhase) * 2.5 : 0;
  const breathe = Math.sin(time / 450) * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -scale : scale, scale);
  drawShadow(ctx, 0, 0, 17, 5);
  // mist wisps
  ctx.fillStyle = 'rgba(170,190,220,0.16)';
  ctx.beginPath();
  ctx.ellipse(-4, -5, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.fillStyle = '#15131c';
  ctx.fillRect(-10, -8 + stride, 3.2, 8 - stride);
  ctx.fillRect(6, -8 - stride, 3.2, 8 + stride);
  ctx.fillRect(-4, -8 - stride * 0.6, 3.2, 8 + stride * 0.6);
  ctx.fillRect(1, -8 + stride * 0.6, 3.2, 8 - stride * 0.6);
  // sleek body
  const body = ctx.createLinearGradient(-14, -18, 10, -4);
  body.addColorStop(0, '#2c2838');
  body.addColorStop(1, '#15131c');
  outline(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(-1, -12 - breathe, 13, 6, -0.08, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
  });
  // tail
  ctx.strokeStyle = '#15131c';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-13, -13);
  ctx.quadraticCurveTo(-20, -18, -18, -24 + stride);
  ctx.stroke();
  // head + ears
  outline(ctx, () => {
    ctx.beginPath();
    ctx.arc(11, -16 - breathe, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#1d1a26';
    ctx.fill();
  });
  ctx.fillStyle = '#1d1a26';
  ctx.beginPath();
  ctx.moveTo(8, -20); ctx.lineTo(7, -25); ctx.lineTo(11, -21);
  ctx.moveTo(14, -20); ctx.lineTo(16, -24); ctx.lineTo(16, -19);
  ctx.fill();
  // glowing eyes
  ctx.fillStyle = '#8fd0ff';
  ctx.fillRect(10, -17.5, 2, 1.6);
  ctx.fillRect(13.4, -17, 2, 1.6);
  ctx.restore();
}

export function drawImp(ctx, x, y, opts = {}) {
  const { walkPhase = 0, moving = false, flip = false, time = 0, scale = 1 } = opts;
  const swing = moving ? Math.sin(walkPhase) : 0;
  const flicker = Math.sin(time / 120) * 1.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -scale : scale, scale);
  drawShadow(ctx, 0, 0, 11, 4.5);
  // flame aura
  const aura = ctx.createRadialGradient(0, -14, 2, 0, -14, 18);
  aura.addColorStop(0, 'rgba(255,140,40,0.3)');
  aura.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, -14, 18, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.fillStyle = '#8a2418';
  ctx.fillRect(-4.5, -7 + swing * 2, 3.5, 7 - swing * 2);
  ctx.fillRect(1, -7 - swing * 2, 3.5, 7 + swing * 2);
  // body
  const body = ctx.createLinearGradient(-7, -20, 7, -6);
  body.addColorStop(0, '#e0512e');
  body.addColorStop(1, '#9c2c16');
  outline(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(0, -13, 7.5, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
  });
  // head with horns + flame hair
  outline(ctx, () => {
    ctx.beginPath();
    ctx.arc(0, -23, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#d0451f';
    ctx.fill();
  });
  ctx.fillStyle = '#3c1408';
  ctx.beginPath();
  ctx.moveTo(-5, -27); ctx.lineTo(-8, -33); ctx.lineTo(-3, -28);
  ctx.moveTo(5, -27); ctx.lineTo(8, -33); ctx.lineTo(3, -28);
  ctx.fill();
  const flame = ctx.createLinearGradient(0, -36, 0, -27);
  flame.addColorStop(0, '#ffd23e');
  flame.addColorStop(1, '#ff7a2e');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-3, -28);
  ctx.quadraticCurveTo(-2 + flicker, -36, 0, -31);
  ctx.quadraticCurveTo(2 + flicker, -37, 3, -28);
  ctx.closePath();
  ctx.fill();
  // grinning eyes
  ctx.fillStyle = '#ffe28a';
  ctx.fillRect(-3.4, -24.5, 2.2, 1.8);
  ctx.fillRect(1.2, -24.5, 2.2, 1.8);
  // pitchfork
  ctx.strokeStyle = '#3c1408';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(9, -2);
  ctx.lineTo(9, -22);
  ctx.moveTo(6.5, -22);
  ctx.lineTo(11.5, -22);
  ctx.moveTo(6.5, -22); ctx.lineTo(6.5, -26);
  ctx.moveTo(9, -22); ctx.lineTo(9, -26);
  ctx.moveTo(11.5, -22); ctx.lineTo(11.5, -26);
  ctx.stroke();
  ctx.restore();
}

export function drawTyrant(ctx, x, y, opts = {}) {
  const { walkPhase = 0, moving = false, flip = false, time = 0 } = opts;
  const scale = (opts.scale || 1) * 1.6;
  const swing = moving ? Math.sin(walkPhase) : 0;
  const pulse = Math.sin(time / 300) * 0.5 + 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -scale : scale, scale);
  drawShadow(ctx, 0, 0, 16, 6);
  // molten glow underfoot
  ctx.fillStyle = `rgba(255,110,30,${0.2 + pulse * 0.15})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs (armoured)
  ctx.fillStyle = '#3a2a28';
  ctx.fillRect(-6, -10 + swing * 2, 5, 10 - swing * 2);
  ctx.fillRect(1.5, -10 - swing * 2, 5, 10 + swing * 2);
  // massive torso with cracked magma seams
  const body = ctx.createLinearGradient(-10, -28, 10, -8);
  body.addColorStop(0, '#5c3430');
  body.addColorStop(1, '#33201e');
  outline(ctx, () => {
    roundRect(ctx, -10.5, -27, 21, 18, 5);
    ctx.fillStyle = body;
    ctx.fill();
  });
  ctx.strokeStyle = `rgba(255,140,50,${0.6 + pulse * 0.4})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-6, -24);
  ctx.lineTo(-2, -18);
  ctx.lineTo(-5, -13);
  ctx.moveTo(4, -25);
  ctx.lineTo(7, -19);
  ctx.stroke();
  // pauldrons
  ctx.fillStyle = '#2a1c1a';
  ctx.beginPath();
  ctx.ellipse(-11, -25, 5, 4, 0.3, 0, Math.PI * 2);
  ctx.ellipse(11, -25, 5, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // greatsword
  ctx.save();
  ctx.translate(13, -12);
  ctx.rotate(0.35 + swing * 0.15);
  const blade = ctx.createLinearGradient(0, 0, 0, 22);
  blade.addColorStop(0, '#ffb056');
  blade.addColorStop(1, '#c9ced6');
  ctx.fillStyle = blade;
  ctx.fillRect(-1.8, -2, 3.6, 24);
  ctx.fillStyle = '#3a2a28';
  ctx.fillRect(-4, -4, 8, 3);
  ctx.restore();
  // head with flame crown
  outline(ctx, () => {
    ctx.beginPath();
    ctx.arc(0, -33, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = '#4a2c28';
    ctx.fill();
  });
  const crown = ctx.createLinearGradient(0, -46, 0, -36);
  crown.addColorStop(0, '#ffd23e');
  crown.addColorStop(1, '#ff6a1e');
  ctx.fillStyle = crown;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 3 - 1.5, -38);
    ctx.quadraticCurveTo(i * 3 + pulse, -46 - Math.abs(i), i * 3 + 1.5, -38);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#ffdf7a';
  ctx.fillRect(-3.8, -34.5, 2.6, 2);
  ctx.fillRect(1.4, -34.5, 2.6, 2);
  ctx.restore();
}

// The Rift Altar — a floating, pulsing crystal.
export function drawAltar(ctx, x, y, time, shardCount) {
  const pulse = Math.sin(time / 500) * 0.5 + 0.5;
  const lift = Math.sin(time / 800) * 3;
  ctx.save();
  ctx.translate(x, y);
  drawShadow(ctx, 0, 0, 16, 6);
  // stone base
  ctx.fillStyle = '#3c333a';
  diamondPath(ctx, 0, -2, 18, 9);
  ctx.fill();
  ctx.fillStyle = '#524751';
  diamondPath(ctx, 0, -6, 14, 7);
  ctx.fill();
  // crystal
  const glow = ctx.createRadialGradient(0, -28 - lift, 2, 0, -28 - lift, 26);
  glow.addColorStop(0, `rgba(170,130,255,${0.5 + pulse * 0.3})`);
  glow.addColorStop(1, 'rgba(170,130,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, -28 - lift, 26, 0, Math.PI * 2);
  ctx.fill();
  const crystal = ctx.createLinearGradient(-6, -40, 6, -16);
  crystal.addColorStop(0, '#cdb6ff');
  crystal.addColorStop(1, '#7a4fd0');
  ctx.fillStyle = crystal;
  ctx.beginPath();
  ctx.moveTo(0, -42 - lift);
  ctx.lineTo(7, -28 - lift);
  ctx.lineTo(0, -14 - lift);
  ctx.lineTo(-7, -28 - lift);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -42 - lift);
  ctx.lineTo(0, -14 - lift);
  ctx.stroke();
  // orbiting shard motes — one per shard collected
  for (let i = 0; i < shardCount; i++) {
    const a = time / 600 + (i / 4) * Math.PI * 2;
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 16, -28 - lift + Math.sin(a) * 7, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Outlined name label above an entity.
export function drawLabel(ctx, x, y, text, color = '#fff', size = 11) {
  ctx.font = `bold ${size}px 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(10,8,16,0.8)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export const MONSTER_PAINTERS = {
  goblin: (ctx, x, y, o) => drawGoblin(ctx, x, y, o),
  goblin_brute: (ctx, x, y, o) => drawGoblin(ctx, x, y, { ...o, brute: true }),
  scorpion: drawScorpion,
  bandit: drawBandit,
  viper: drawViper,
  panther: drawPanther,
  imp: drawImp,
  tyrant: drawTyrant
};
