// Player movement on the tile grid, with smooth interpolation between tiles.
// Rendering moved to sprites.js; this module owns position + input.

const MOVE_SPEED = 5.5; // tiles per second

export class Player {
  constructor(world, username, playerId) {
    this.world = world;
    this.username = username;
    this.id = playerId;
    this.tx = world.spawn.x;
    this.ty = world.spawn.y;
    this.px = this.tx; // interpolated position, in tile units
    this.py = this.ty;
    this.targetX = this.tx;
    this.targetY = this.ty;
    this.facing = 'down';
    this.moving = false;
    this.walkPhase = 0;
    this.onMove = null; // (x, y, facing) => void — wired to the network
  }

  teleport(tx, ty) {
    this.tx = this.targetX = tx;
    this.ty = this.targetY = ty;
    this.px = tx;
    this.py = ty;
    this.moving = false;
    this.onMove?.(tx, ty, this.facing);
  }

  // The tile the player is facing (for E-to-interact).
  facingTile() {
    const deltas = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = deltas[this.facing];
    return { x: this.tx + dx, y: this.ty + dy };
  }

  update(dt, input, isBlocked) {
    if (this.moving) {
      this.walkPhase += dt * 11;
      const step = MOVE_SPEED * dt;
      const dx = this.targetX - this.px;
      const dy = this.targetY - this.py;
      const dist = Math.hypot(dx, dy);
      if (dist <= step) {
        this.px = this.targetX;
        this.py = this.targetY;
        this.tx = this.targetX;
        this.ty = this.targetY;
        this.moving = false;
      } else {
        this.px += (dx / dist) * step;
        this.py += (dy / dist) * step;
      }
      return;
    }

    let dx = 0;
    let dy = 0;
    if (input.up) { dy = -1; this.facing = 'up'; }
    else if (input.down) { dy = 1; this.facing = 'down'; }
    else if (input.left) { dx = -1; this.facing = 'left'; }
    else if (input.right) { dx = 1; this.facing = 'right'; }
    if (dx === 0 && dy === 0) return;

    const nx = this.tx + dx;
    const ny = this.ty + dy;
    if (this.world.isSolid(nx, ny) || isBlocked(nx, ny)) return;

    this.targetX = nx;
    this.targetY = ny;
    this.moving = true;
    this.onMove?.(nx, ny, this.facing);
  }
}
