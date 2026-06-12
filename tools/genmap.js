// Generates public/assets/maps/world.json — a 200×70 four-biome world.
// Deterministic (seeded), so re-running produces the same map.
// Usage: node tools/genmap.js
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const W = 200;
const H = 70;
const PATH_Y = [34, 35]; // the great road, west → east

// mulberry32 PRNG
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260611);

const BIOMES = [
  {
    id: 'meadow', name: 'Verdant Meadows', x1: 0, x2: 49,
    ground: 'g', border: 't', decor: [['t', 0.07], ['f', 0.035]],
    cave: { name: 'Goblin Caves', x1: 31, y1: 5, x2: 46, y2: 18 },
    gate: null
  },
  {
    id: 'desert', name: 'Sunscorch Desert', x1: 50, x2: 99,
    ground: 's', border: 'k', decor: [['x', 0.045], ['n', 0.06]],
    cave: { name: 'Scorpion Den', x1: 81, y1: 5, x2: 96, y2: 18 },
    gate: { minLevel: 3 }
  },
  {
    id: 'rainforest', name: 'Mistveil Rainforest', x1: 100, x2: 149,
    ground: 'j', border: 'J', decor: [['J', 0.13], ['v', 0.06]],
    cave: { name: 'Viper Hollow', x1: 131, y1: 5, x2: 146, y2: 18 },
    gate: { minLevel: 6 }
  },
  {
    id: 'ashlands', name: 'Ember Ashlands', x1: 150, x2: 199,
    ground: 'a', border: 'k', decor: [['l', 0.025], ['e', 0.05], ['k', 0.02]],
    cave: { name: 'Ember Depths', x1: 181, y1: 5, x2: 196, y2: 18 },
    gate: { minLevel: 10 }
  }
];

const SOLID = new Set(['t', 'w', 'h', 'd', 'k', 'x', 'J', 'l']);
const grid = Array.from({ length: H }, () => Array(W).fill('g'));

// ---------- base ground per biome ----------
for (const biome of BIOMES) {
  for (let y = 0; y < H; y++) {
    for (let x = biome.x1; x <= biome.x2; x++) grid[y][x] = biome.ground;
  }
}

// ---------- decor scatter ----------
for (const biome of BIOMES) {
  for (let y = 2; y < H - 2; y++) {
    for (let x = biome.x1 + 1; x < biome.x2; x++) {
      for (const [char, density] of biome.decor) {
        if (rand() < density) { grid[y][x] = char; break; }
      }
    }
  }
}

// lava likes to clump — grow each lava tile into a blob
for (let y = 2; y < H - 2; y++) {
  for (let x = 151; x < 199; x++) {
    if (grid[y][x] === 'l' && rand() < 0.7) {
      if (grid[y][x + 1] === 'a') grid[y][x + 1] = 'l';
      if (grid[y + 1]?.[x] === 'a') grid[y + 1][x] = 'l';
    }
  }
}

// ---------- the great road ----------
for (const y of PATH_Y) {
  for (let x = 1; x < W - 1; x++) grid[y][x] = 'p';
}
// keep the road shoulders clear of solids
for (const y of [PATH_Y[0] - 1, PATH_Y[1] + 1]) {
  for (let x = 1; x < W - 1; x++) {
    if (SOLID.has(grid[y][x])) grid[y][x] = BIOMES.find((b) => x >= b.x1 && x <= b.x2).ground;
  }
}

// ---------- caves (the only places enemies live) ----------
for (const biome of BIOMES) {
  const { x1, y1, x2, y2 } = biome.cave;
  for (let y = y1 - 1; y <= y2 + 1; y++) {
    for (let x = x1 - 1; x <= x2 + 1; x++) {
      grid[y][x] = (y < y1 || y > y2 || x < x1 || x > x2) ? 'k' : 'c';
    }
  }
  // scattered pillars inside
  for (let y = y1 + 1; y < y2; y++) {
    for (let x = x1 + 1; x < x2; x++) {
      if (rand() < 0.06) grid[y][x] = 'k';
    }
  }
  // entrance: gap in the south wall + path corridor down to the road
  const doorX = Math.floor((x1 + x2) / 2);
  grid[y2 + 1][doorX] = 'c';
  grid[y2 + 1][doorX + 1] = 'c';
  for (let y = y2 + 2; y < PATH_Y[0]; y++) {
    grid[y][doorX] = 'p';
    grid[y][doorX + 1] = 'p';
    // clear shoulders so the corridor isn't choked by trees
    if (SOLID.has(grid[y][doorX - 1])) grid[y][doorX - 1] = biome.ground;
    if (SOLID.has(grid[y][doorX + 2])) grid[y][doorX + 2] = biome.ground;
  }
}

// ---------- Ashveil Village (meadow) ----------
function placeHouse(hx, hy, doorOffset) {
  for (let y = hy; y < hy + 3; y++) {
    for (let x = hx; x < hx + 4; x++) grid[y][x] = 'h';
  }
  grid[hy + 2][hx + doorOffset] = 'd';
}
// clear the village green
for (let y = 24; y <= 33; y++) {
  for (let x = 4; x <= 28; x++) grid[y][x] = 'g';
}
placeHouse(6, 25, 1);   // Edric's forge — door at (7,27)
placeHouse(14, 25, 1);  // Mara's home — door at (15,27)
// pond + flowers
for (let y = 30; y <= 32; y++) for (let x = 22; x <= 25; x++) grid[y][x] = 'w';
for (const [fx, fy] of [[11, 29], [12, 31], [19, 26], [20, 30], [5, 31]]) grid[fy][fx] = 'f';
// lane from the houses down to the road
for (let y = 28; y < PATH_Y[0]; y++) { grid[y][10] = 'p'; grid[y][11] = 'p'; }

// ---------- desert oasis ----------
for (let y = 44; y <= 46; y++) for (let x = 64; x <= 67; x++) grid[y][x] = 'w';
for (const [fx, fy] of [[63, 44], [68, 45], [65, 47], [66, 43]]) grid[fy][fx] = 'v';

// ---------- the Rift Altar (ashlands, end of the road) ----------
const ALTAR = { x: 188, y: 40 };
for (let y = ALTAR.y - 2; y <= ALTAR.y + 2; y++) {
  for (let x = ALTAR.x - 2; x <= ALTAR.x + 2; x++) grid[y][x] = 'a';
}
for (let y = PATH_Y[1] + 1; y <= ALTAR.y; y++) { grid[y][ALTAR.x] = 'p'; }

// ---------- biome gates ----------
for (const biome of BIOMES) {
  if (!biome.gate) continue;
  const gx = biome.x1 - 1;
  for (let y = 1; y < H - 1; y++) {
    grid[y][gx] = (y >= 33 && y <= 36) ? 'G' : 'k';
  }
  biome.gate.x = gx;
}

// ---------- hard border ----------
for (let x = 0; x < W; x++) {
  const biome = BIOMES.find((b) => x >= b.x1 && x <= b.x2);
  grid[0][x] = biome.border;
  grid[H - 1][x] = biome.border;
}
for (let y = 0; y < H; y++) {
  grid[y][0] = 't';
  grid[y][W - 1] = 'k';
}

// ---------- fixed points must be clear ----------
const CLEAR = [[11, 37], [7, 28], [15, 28], [24, 37], [70, 37], [120, 37], [170, 37]];
for (const [x, y] of CLEAR) {
  if (SOLID.has(grid[y][x])) grid[y][x] = BIOMES.find((b) => x >= b.x1 && x <= b.x2).ground;
}

const world = {
  tileSize: 32,
  width: W,
  height: H,
  spawn: { x: 11, y: 37 },
  altar: ALTAR,
  legend: {
    g: { name: 'grass', solid: false },
    f: { name: 'flowers', solid: false },
    p: { name: 'path', solid: false },
    t: { name: 'tree', solid: true },
    w: { name: 'water', solid: true },
    h: { name: 'house', solid: true },
    d: { name: 'door', solid: true },
    c: { name: 'cave floor', solid: false },
    k: { name: 'rock wall', solid: true },
    G: { name: 'gate', solid: false },
    s: { name: 'sand', solid: false },
    n: { name: 'dune', solid: false },
    x: { name: 'cactus', solid: true },
    j: { name: 'jungle floor', solid: false },
    J: { name: 'jungle tree', solid: true },
    v: { name: 'fern', solid: false },
    a: { name: 'ash', solid: false },
    l: { name: 'lava', solid: true },
    e: { name: 'ember vent', solid: false }
  },
  biomes: BIOMES.map((b) => ({
    id: b.id, name: b.name, x1: b.x1, x2: b.x2,
    cave: b.cave,
    gate: b.gate ? { x: b.gate.x, minLevel: b.gate.minLevel } : null
  })),
  rows: grid.map((row) => row.join(''))
};

// sanity checks
const walkable = (x, y) => !SOLID.has(grid[y]?.[x]);
for (const [x, y] of [[world.spawn.x, world.spawn.y], [ALTAR.x, ALTAR.y], ...CLEAR]) {
  if (!walkable(x, y)) throw new Error(`blocked key tile ${x},${y}: ${grid[y][x]}`);
}
for (const row of world.rows) if (row.length !== W) throw new Error('bad row length');
// the road must be passable through every gate
for (const biome of BIOMES) {
  if (biome.gate && grid[34][biome.gate.x] !== 'G') throw new Error(`gate broken at ${biome.id}`);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '../public/assets/maps/world.json');
writeFileSync(out, JSON.stringify(world));
console.log(`✅ world.json written: ${W}×${H} (${W * H} tiles), 4 biomes, 4 caves, 3 gates`);
