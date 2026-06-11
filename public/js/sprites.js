// Procedural isometric art: tile sprites, raised blocks (trees, houses,
// rocks) and animated characters. Everything is drawn once into offscreen
// canvases at startup, except characters and water which animate per frame.

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

// Deterministic per-instance randomness so detail doesn't flicker.
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

function groundTile(base, detail) {
  return makeCanvas(ISO.W, ISO.H, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, ISO.H);
    grad.addColorStop(0, shade(base, 1.12));
    grad.addColorStop(1, shade(base, 0.88));
    diamondPath(ctx, 32, 16);
    ctx.fillStyle = grad;
    ctx.fill();
    // soft inner edge so tiles read as separate ground pieces
    diamondPath(ctx, 32, 16, 31, 15.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.stroke();
    if (detail) {
      ctx.save();
      diamondPath(ctx, 32, 16);
      ctx.clip();
      detail(ctx);
      ctx.restore();
    }
  });
}

function speckles(ctx, color, count, seed) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const px = 8 + noise(seed, i) * 48;
    const py = 6 + noise(i, seed) * 20;
    ctx.fillRect(px, py, 2, 1.5);
  }
}

function buildGrassVariants() {
  return [0, 1, 2].map((variant) =>
    groundTile(['#4f9440', '#4a8c3c', '#549a45'][variant], (ctx) => {
      speckles(ctx, 'rgba(255,255,255,0.10)', 4, variant + 1);
      speckles(ctx, 'rgba(0,60,0,0.18)', 5, variant + 7);
      // grass blades
      ctx.strokeStyle = 'rgba(20,80,20,0.5)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const bx = 12 + noise(variant, i + 20) * 40;
        const by = 10 + noise(i + 20, variant) * 14;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 1, by - 4);
        ctx.stroke();
      }
    })
  );
}

function buildFlowersTile() {
  return groundTile('#4f9440', (ctx) => {
    const colors = ['#e06a8a', '#e8d35a', '#e9ecf2', '#c77ddb'];
    for (let i = 0; i < 4; i++) {
      const fx = 12 + noise(3, i) * 40;
      const fy = 8 + noise(i, 3) * 16;
      ctx.strokeStyle = '#2c6b2c';
      ctx.beginPath();
      ctx.moveTo(fx, fy + 4);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(fx, fy, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f6e27a';
      ctx.fillRect(fx - 0.7, fy - 0.7, 1.4, 1.4);
    }
  });
}

function buildPathVariants() {
  return [0, 1].map((variant) =>
    groundTile('#c4a571', (ctx) => {
      speckles(ctx, 'rgba(255,255,255,0.18)', 3, variant + 11);
      ctx.fillStyle = 'rgba(120,90,50,0.5)';
      for (let i = 0; i < 4; i++) {
        const px = 10 + noise(variant + 30, i) * 44;
        const py = 8 + noise(i, variant + 30) * 16;
        ctx.beginPath();
        ctx.ellipse(px, py, 2.6, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    })
  );
}

function buildCaveVariants() {
  return [0, 1].map((variant) =>
    groundTile('#4c4454', (ctx) => {
      speckles(ctx, 'rgba(0,0,0,0.25)', 5, variant + 40);
      speckles(ctx, 'rgba(255,255,255,0.05)', 3, variant + 50);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const sx = 14 + noise(variant, 60) * 30;
      const sy = 8 + noise(60, variant) * 14;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 8, sy + 3);
      ctx.lineTo(sx + 12, sy + 1);
      ctx.stroke();
    })
  );
}

// ---------- raised blocks (base diamond centre at (32, height-16)) ----------

function blockFaces(ctx, cx, baseY, height, leftColor, rightColor) {
  // left face (between west and south corners)
  ctx.beginPath();
  ctx.moveTo(cx - ISO.HW, baseY - height);
  ctx.lineTo(cx, baseY - height + ISO.HH);
  ctx.lineTo(cx, baseY + ISO.HH);
  ctx.lineTo(cx - ISO.HW, baseY);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  // right face (between south and east corners)
  ctx.beginPath();
  ctx.moveTo(cx + ISO.HW, baseY - height);
  ctx.lineTo(cx, baseY - height + ISO.HH);
  ctx.lineTo(cx, baseY + ISO.HH);
  ctx.lineTo(cx + ISO.HW, baseY);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
}

function buildTreeBlock() {
  const H = 96;
  return makeCanvas(ISO.W, H, (ctx) => {
    const baseY = H - ISO.HH; // 80
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(32, baseY, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // trunk
    const trunk = ctx.createLinearGradient(28, 0, 38, 0);
    trunk.addColorStop(0, '#4a3420');
    trunk.addColorStop(1, '#6b4d2e');
    ctx.fillStyle = trunk;
    ctx.fillRect(28, baseY - 26, 8, 26);
    // canopy: layered blobs, dark to light
    const blobs = [
      [32, baseY - 48, 21, '#23501f'],
      [22, baseY - 40, 13, '#2c5f27'],
      [43, baseY - 42, 13, '#2c5f27'],
      [32, baseY - 58, 14, '#33702c'],
      [26, baseY - 52, 9, '#3d8434'],
      [38, baseY - 50, 8, '#3d8434']
    ];
    for (const [bx, by, r, color] of blobs) {
      const g = ctx.createRadialGradient(bx - r / 3, by - r / 3, r / 4, bx, by, r);
      g.addColorStop(0, shade(color, 1.25));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // top highlight
    ctx.fillStyle = 'rgba(255,255,230,0.12)';
    ctx.beginPath();
    ctx.arc(27, baseY - 60, 7, 0, Math.PI * 2);
    ctx.fill();
  });
}

function buildRockBlock(variant) {
  const WALL = 22;
  const H = ISO.H + WALL; // 54
  return makeCanvas(ISO.W, H, (ctx) => {
    const baseY = H - ISO.HH;
    blockFaces(ctx, 32, baseY, WALL, '#352e3d', '#443c4d');
    // top
    const top = ctx.createLinearGradient(0, baseY - WALL - ISO.HH, 0, baseY - WALL + ISO.HH);
    top.addColorStop(0, '#6e6580');
    top.addColorStop(1, '#574e66');
    diamondPath(ctx, 32, baseY - WALL);
    ctx.fillStyle = top;
    ctx.fill();
    // cracks on faces
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const cx1 = 8 + noise(variant, 1) * 16;
    ctx.moveTo(cx1, baseY - 10);
    ctx.lineTo(cx1 + 5, baseY - 4);
    ctx.moveTo(40 + noise(1, variant) * 14, baseY - 14);
    ctx.lineTo(44 + noise(1, variant) * 14, baseY - 6);
    ctx.stroke();
    // mossy glow speck for cave atmosphere
    if (variant === 1) {
      ctx.fillStyle = 'rgba(120,220,180,0.5)';
      ctx.beginPath();
      ctx.arc(32 + (noise(variant, 9) - 0.5) * 30, baseY - WALL, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function buildHouseBlock(withDoor) {
  const WALL = 30;
  const H = ISO.H + WALL; // 62
  return makeCanvas(ISO.W, H, (ctx) => {
    const baseY = H - ISO.HH;
    // plaster walls with timber frame
    blockFaces(ctx, 32, baseY, WALL, '#9d8a6b', '#c4ae87');
    ctx.strokeStyle = 'rgba(72,52,32,0.55)';
    ctx.lineWidth = 2;
    // timber: top beams along each face
    ctx.beginPath();
    ctx.moveTo(0, baseY - WALL + 2);
    ctx.lineTo(32, baseY - WALL + ISO.HH + 2);
    ctx.lineTo(64, baseY - WALL + 2);
    ctx.stroke();
    if (withDoor) {
      // arched door on the right face
      ctx.fillStyle = '#3c2a18';
      ctx.beginPath();
      ctx.moveTo(38, baseY - 2);
      ctx.lineTo(38, baseY - 16);
      ctx.quadraticCurveTo(45, baseY - 22, 52, baseY - 12);
      ctx.lineTo(52, baseY + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#c9a14d';
      ctx.beginPath();
      ctx.arc(49, baseY - 8, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // small window on the right face
      ctx.fillStyle = 'rgba(70,60,40,0.9)';
      ctx.fillRect(42, baseY - 20, 9, 8);
      ctx.fillStyle = 'rgba(255,225,140,0.75)';
      ctx.fillRect(43, baseY - 19, 7, 6);
      ctx.strokeStyle = 'rgba(70,60,40,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(46.5, baseY - 19);
      ctx.lineTo(46.5, baseY - 13);
      ctx.stroke();
    }
    // flat shingle roof
    const roof = ctx.createLinearGradient(0, baseY - WALL - ISO.HH, 0, baseY - WALL + ISO.HH);
    roof.addColorStop(0, '#c1603a');
    roof.addColorStop(1, '#8f3f24');
    diamondPath(ctx, 32, baseY - WALL);
    ctx.fillStyle = roof;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(32 - i * 7, baseY - WALL - ISO.HH + i * 3.5);
      ctx.lineTo(32 + i * 7, baseY - WALL - ISO.HH + i * 3.5);
      ctx.stroke();
    }
  });
}

// ---------- sprite registry ----------

export const art = {};

export function buildSprites() {
  art.grass = buildGrassVariants();
  art.flowers = buildFlowersTile();
  art.path = buildPathVariants();
  art.cave = buildCaveVariants();
  art.tree = buildTreeBlock();
  art.rock = [buildRockBlock(0), buildRockBlock(1)];
  art.house = buildHouseBlock(false);
  art.houseDoor = buildHouseBlock(true);
}

// Blit a block so its base diamond centre lands on (sx, sy).
export function drawBlock(ctx, img, sx, sy) {
  ctx.drawImage(img, sx - ISO.HW, sy + ISO.HH - img.height);
}

// Animated water, drawn per frame (only a handful of tiles).
export function drawWater(ctx, sx, sy, time, tx, ty) {
  const grad = ctx.createLinearGradient(sx, sy - ISO.HH, sx, sy + ISO.HH);
  grad.addColorStop(0, '#3a78c2');
  grad.addColorStop(1, '#245089');
  diamondPath(ctx, sx, sy);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  diamondPath(ctx, sx, sy);
  ctx.clip();
  const phase = time / 700 + tx * 1.3 + ty * 2.1;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) {
    const wy = sy - 6 + i * 9 + Math.sin(phase + i * 2) * 2;
    const wx = sx - 12 + Math.cos(phase + i) * 6;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.quadraticCurveTo(wx + 6, wy - 2, wx + 12, wy);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- characters ----------

const PLAYER_PALETTES = ['#3d6fd0', '#2fa39a', '#b14fc9', '#cf7c2f', '#5a9e3d', '#c9486b'];
const HAIR_COLORS = ['#2e2018', '#5b3a1e', '#1c1c22', '#7a5230', '#3f3f46'];

export function playerPalette(playerId) {
  return PLAYER_PALETTES[Math.abs(playerId) % PLAYER_PALETTES.length];
}

function drawShadow(ctx, x, y, w = 15, h = 6) {
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

// A small animated humanoid with feet at (x, y).
export function drawHumanoid(ctx, x, y, opts = {}) {
  const {
    shirt = '#3d6fd0', pants = '#33415c', skin = '#e8c39e',
    hair = '#2e2018', walkPhase = 0, moving = false, scale = 1, accessory = null
  } = opts;
  const swing = moving ? Math.sin(walkPhase) : 0;
  const bob = moving ? Math.abs(Math.sin(walkPhase)) * 1.6 : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawShadow(ctx, 0, 0);
  ctx.translate(0, -bob);

  // legs
  ctx.fillStyle = pants;
  ctx.fillRect(-5, -9 + swing * 2, 4, 9 - swing * 2);
  ctx.fillRect(1, -9 - swing * 2, 4, 9 + swing * 2);
  // torso
  const torso = ctx.createLinearGradient(-8, -24, 8, -8);
  torso.addColorStop(0, shade(shirt, 1.25));
  torso.addColorStop(1, shade(shirt, 0.8));
  roundRect(ctx, -8, -23, 16, 15, 4);
  ctx.fillStyle = torso;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // belt
  ctx.fillStyle = 'rgba(40,28,16,0.85)';
  ctx.fillRect(-8, -11, 16, 2.5);
  // arms
  ctx.fillStyle = shade(shirt, 0.7);
  ctx.fillRect(-10.5, -22 + swing * 2.5, 3.5, 11);
  ctx.fillRect(7, -22 - swing * 2.5, 3.5, 11);
  // head
  const headGrad = ctx.createRadialGradient(-2, -31, 2, 0, -29, 8);
  headGrad.addColorStop(0, shade(skin, 1.12));
  headGrad.addColorStop(1, shade(skin, 0.88));
  ctx.beginPath();
  ctx.arc(0, -29, 7, 0, Math.PI * 2);
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.stroke();
  // hair cap
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(0, -30.5, 7, Math.PI * 1.05, Math.PI * 1.95);
  ctx.quadraticCurveTo(0, -34, 6.7, -32);
  ctx.fill();
  // eyes
  ctx.fillStyle = '#26222b';
  ctx.fillRect(-3.5, -29.5, 1.8, 2);
  ctx.fillRect(1.7, -29.5, 1.8, 2);

  if (accessory) accessory(ctx);
  ctx.restore();
}

export function drawGoblin(ctx, x, y, opts = {}) {
  const { walkPhase = 0, moving = false, brute = false } = opts;
  const scale = brute ? 1.35 : 1;
  const skin = brute ? '#5b8d33' : '#6da33f';
  const swing = moving ? Math.sin(walkPhase) : 0;
  const bob = moving ? Math.abs(Math.sin(walkPhase)) * 1.6 : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawShadow(ctx, 0, 0, brute ? 16 : 13, 5.5);
  ctx.translate(0, -bob);

  // legs
  ctx.fillStyle = shade(skin, 0.7);
  ctx.fillRect(-5, -7 + swing * 2, 4, 7 - swing * 2);
  ctx.fillRect(1, -7 - swing * 2, 4, 7 + swing * 2);
  // hunched body
  const body = ctx.createLinearGradient(-9, -20, 9, -6);
  body.addColorStop(0, shade(skin, 1.2));
  body.addColorStop(1, shade(skin, 0.78));
  ctx.beginPath();
  ctx.ellipse(0, -13, 9, 8.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // loincloth
  ctx.fillStyle = '#6b4a2a';
  ctx.fillRect(-5, -8, 10, 4);
  // club arm
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
  // head — big, with pointy ears
  const headGrad = ctx.createRadialGradient(-2, -25, 2, 0, -23, 8);
  headGrad.addColorStop(0, shade(skin, 1.15));
  headGrad.addColorStop(1, shade(skin, 0.85));
  ctx.beginPath();
  ctx.arc(0, -23, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.stroke();
  // ears
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(-7, -25); ctx.lineTo(-14, -28); ctx.lineTo(-7, -21);
  ctx.moveTo(7, -25); ctx.lineTo(14, -28); ctx.lineTo(7, -21);
  ctx.fill();
  // angry red eyes + teeth
  ctx.fillStyle = '#d8322c';
  ctx.fillRect(-4, -24.5, 2.4, 2);
  ctx.fillRect(1.6, -24.5, 2.4, 2);
  ctx.fillStyle = '#f2efe4';
  ctx.fillRect(-3, -18.5, 1.6, 2);
  ctx.fillRect(1.4, -18.5, 1.6, 2);
  ctx.restore();
}

export function drawBlacksmith(ctx, x, y, opts = {}) {
  drawHumanoid(ctx, x, y, {
    ...opts,
    shirt: '#7a4a2b',
    pants: '#3b3b42',
    skin: '#d9a06b',
    hair: '#3f3f46',
    accessory: (a) => {
      // beard
      a.fillStyle = '#4c4c54';
      a.beginPath();
      a.arc(0, -25.5, 4.6, 0.15 * Math.PI, 0.85 * Math.PI);
      a.fill();
      // leather apron
      a.fillStyle = '#4a3526';
      a.fillRect(-5.5, -20, 11, 11);
      a.strokeStyle = 'rgba(0,0,0,0.3)';
      a.strokeRect(-5.5, -20, 11, 11);
      // hammer at side
      a.fillStyle = '#8a6a40';
      a.fillRect(11, -16, 2.4, 10);
      a.fillStyle = '#9aa0a8';
      a.fillRect(8.6, -18.5, 7.2, 4);
    }
  });
}

export function drawElder(ctx, x, y, opts = {}) {
  drawHumanoid(ctx, x, y, {
    ...opts,
    shirt: '#5d3a8c',
    pants: '#46306b',
    skin: '#e8c39e',
    hair: '#cfcfd6',
    accessory: (a) => {
      // long robe over legs
      a.fillStyle = '#4d2f78';
      a.beginPath();
      a.moveTo(-8, -10);
      a.lineTo(8, -10);
      a.lineTo(10, 0);
      a.lineTo(-10, 0);
      a.closePath();
      a.fill();
      // hood
      a.fillStyle = '#5d3a8c';
      a.beginPath();
      a.arc(0, -30, 7.8, Math.PI * 0.95, Math.PI * 2.05);
      a.fill();
      // staff with glowing tip
      a.strokeStyle = '#6b4d2e';
      a.lineWidth = 2.4;
      a.beginPath();
      a.moveTo(-12, 0);
      a.lineTo(-12, -34);
      a.stroke();
      const glow = a.createRadialGradient(-12, -36, 0.5, -12, -36, 5);
      glow.addColorStop(0, 'rgba(160,220,255,0.95)');
      glow.addColorStop(1, 'rgba(160,220,255,0)');
      a.fillStyle = glow;
      a.beginPath();
      a.arc(-12, -36, 5, 0, Math.PI * 2);
      a.fill();
    }
  });
}

export function drawAdventurer(ctx, x, y, playerId, opts = {}) {
  drawHumanoid(ctx, x, y, {
    ...opts,
    shirt: playerPalette(playerId),
    hair: HAIR_COLORS[Math.abs(playerId * 7 + 3) % HAIR_COLORS.length],
    accessory: (a) => {
      // sword on the hip
      a.fillStyle = '#9aa0a8';
      a.save();
      a.translate(10, -10);
      a.rotate(0.6);
      a.fillRect(-1, 0, 2, 9);
      a.fillStyle = '#6b4d2e';
      a.fillRect(-2.5, -2, 5, 2.4);
      a.restore();
    }
  });
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

// Small floating HP bar (for engaged/hurt enemies).
export function drawMiniHpBar(ctx, x, y, ratio) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 14, y, 28, 4);
  ctx.fillStyle = ratio > 0.4 ? '#5fb86a' : '#d04545';
  ctx.fillRect(x - 13, y + 1, 26 * Math.max(0, ratio), 2);
}
