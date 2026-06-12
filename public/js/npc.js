// NPC definitions + interaction lookups. Static NPCs (Edric, Mara) stand in
// the village; wandering merchants move server-side and are mirrored in
// game.merchants; enemies live in game.enemies.

export async function loadNpcs() {
  const res = await fetch('/js/npcs.json');
  if (!res.ok) throw new Error('Could not load NPCs');
  const defs = await res.json();
  return {
    friendly: defs.filter((d) => d.x !== undefined),          // fixed positions
    merchants: defs.filter((d) => d.role === 'merchant'),     // wander via server
    byId: Object.fromEntries(defs.map((d) => [d.id, d]))
  };
}

// Is a tile blocked by an NPC, merchant or enemy?
export function entityBlocked(game, tx, ty) {
  if (game.friendlyNpcs.some((npc) => npc.x === tx && npc.y === ty)) return true;
  for (const merchant of game.merchants.values()) {
    if (merchant.x === tx && merchant.y === ty) return true;
  }
  for (const enemy of game.enemies.values()) {
    if (enemy.x === tx && enemy.y === ty) return true;
  }
  if (game.world.altar.x === tx && game.world.altar.y === ty) return true;
  return false;
}

// What is the player facing? {kind: 'npc'|'merchant'|'enemy'|'altar', target} or null.
export function findInteractable(game) {
  const { x, y } = game.player.facingTile();

  const npc = game.friendlyNpcs.find((n) => n.x === x && n.y === y);
  if (npc) return { kind: 'npc', target: npc };

  for (const merchant of game.merchants.values()) {
    if (merchant.x === x && merchant.y === y) {
      return { kind: 'merchant', target: game.npcDefs.byId[merchant.id] || merchant };
    }
  }
  for (const enemy of game.enemies.values()) {
    if (enemy.x === x && enemy.y === y) return { kind: 'enemy', target: enemy };
  }
  if (game.world.altar.x === x && game.world.altar.y === y) {
    return { kind: 'altar', target: game.world.altar };
  }
  return null;
}
