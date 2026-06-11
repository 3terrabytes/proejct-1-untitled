// Shared progression logic — used by the REST /xp route and the WebSocket
// game server when an enemy dies. Threshold to next level: level * 100.
// Level up: +10 max HP, +2 attack, +1 defence, full heal.

export function applyLevelUps(stats) {
  let levelsGained = 0;
  while (stats.xp >= stats.level * 100) {
    stats.xp -= stats.level * 100;
    stats.level += 1;
    levelsGained += 1;
    stats.max_hp += 10;
    stats.attack += 2;
    stats.defence += 1;
  }
  if (levelsGained > 0) stats.hp = stats.max_hp;
  return levelsGained;
}

export async function awardXp(sql, playerId, amount) {
  const [stats] = await sql`SELECT * FROM player_stats WHERE player_id = ${playerId}`;
  if (!stats) throw new Error('Stats not found');
  stats.xp += amount;
  const levelsGained = applyLevelUps(stats);
  const [updated] = await sql`
    UPDATE player_stats
    SET xp = ${stats.xp}, level = ${stats.level}, max_hp = ${stats.max_hp},
        attack = ${stats.attack}, defence = ${stats.defence}, hp = ${stats.hp}
    WHERE player_id = ${playerId}
    RETURNING *
  `;
  return { stats: updated, levelsGained };
}

export async function addGold(sql, playerId, amount) {
  const [updated] = await sql`
    UPDATE player_stats SET gold = gold + ${amount}
    WHERE player_id = ${playerId}
    RETURNING *
  `;
  return updated;
}
