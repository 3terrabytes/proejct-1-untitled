// Friendly NPC definitions (merchants, quest-givers) — static on the map.
// Enemies are server-owned and live in game.enemies (see net.js).

export async function loadNpcs() {
  const res = await fetch('/js/npcs.json');
  if (!res.ok) throw new Error('Could not load NPCs');
  const defs = await res.json();
  return {
    friendly: defs.filter((d) => d.role !== 'enemy'),
    enemyDefs: defs.filter((d) => d.role === 'enemy')
  };
}

// Is a tile blocked by a friendly NPC or a living enemy?
export function entityBlocked(game, tx, ty) {
  if (game.friendlyNpcs.some((npc) => npc.x === tx && npc.y === ty)) return true;
  for (const enemy of game.enemies.values()) {
    if (enemy.x === tx && enemy.y === ty) return true;
  }
  return false;
}

// What is the player facing? Returns {kind: 'npc'|'enemy', target} or null.
export function findInteractable(game) {
  const { x, y } = game.player.facingTile();
  const npc = game.friendlyNpcs.find((n) => n.x === x && n.y === y);
  if (npc) return { kind: 'npc', target: npc };
  for (const enemy of game.enemies.values()) {
    if (enemy.x === x && enemy.y === y) return { kind: 'enemy', target: enemy };
  }
  return null;
}

// Nearest enemy within Chebyshev distance 1 of the player (for auto-engage
// when a goblin catches you).
export function adjacentEnemy(game) {
  const { tx, ty } = game.player;
  for (const enemy of game.enemies.values()) {
    if (Math.max(Math.abs(enemy.x - tx), Math.abs(enemy.y - ty)) <= 1) return enemy;
  }
  return null;
}
