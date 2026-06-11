// Player movement on the tile grid, with smooth interpolation between tiles.

const MOVE_SPEED = 5.5; // tiles per second

export class Player {
  constructor(world, username) {
    this.world = world;
    this.username = username;
    this.tx = world.spawn.x;
    this.ty = world.spawn.y;
    this.px = this.tx; // interpolated position, in tile units
    this.py = this.ty;
    this.targetX = this.tx;
    this.targetY = this.ty;
    this.facing = 'down';
    this.moving = false;
  }

  teleport(tx, ty) {
    this.tx = this.targetX = tx;
    this.ty = this.targetY = ty;
    this.px = tx;
    this.py = ty;
    this.moving = false;
  }

  // The tile the player is facing (for E-to-interact).
  facingTile() {
    const deltas = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [dx, dy] = deltas[this.facing];
    return { x: this.tx + dx, y: this.ty + dy };
  }

  update(dt, input, isBlocked) {
    if (this.moving) {
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
  }

  draw(ctx) {
    const ts = this.world.tileSize;
    const x = this.px * ts;
    const y = this.py * ts;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(x + ts / 2, y + ts - 4, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = '#3d6fd0';
    ctx.fillRect(x + 9, y + 12, 14, 14);
    // head
    ctx.fillStyle = '#e8c39e';
    ctx.beginPath();
    ctx.arc(x + ts / 2, y + 9, 7, 0, Math.PI * 2);
    ctx.fill();
    // facing indicator (eyes)
    ctx.fillStyle = '#222';
    const eyeOffsets = {
      down: [[-3, 0], [3, 0]],
      up: [],
      left: [[-4, 0]],
      right: [[4, 0]]
    };
    for (const [ex, ey] of eyeOffsets[this.facing]) {
      ctx.fillRect(x + ts / 2 + ex - 1, y + 8 + ey, 2, 2);
    }
    // name label
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(this.username, x + ts / 2, y - 4);
    ctx.fillText(this.username, x + ts / 2, y - 4);
  }
}
