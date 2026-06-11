import { Router } from 'express';
import { sql } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { awardXp } from '../lib/progression.js';

const router = Router();
router.use(requireAuth);

const ITEM_TYPES = ['weapon', 'armour', 'consumable', 'misc'];
const SLOTS = ['head', 'chest', 'legs', 'feet', 'mainhand', 'offhand'];

router.get('/stats', async (req, res) => {
  try {
    const [stats] = await sql`SELECT * FROM player_stats WHERE player_id = ${req.player.id}`;
    if (!stats) return res.status(404).json({ error: 'Stats not found' });
    res.json({ stats });
  } catch (err) {
    console.error('stats failed:', err);
    res.status(500).json({ error: 'Could not load stats' });
  }
});

// Award XP and resolve level-ups server-side so the client can't spoof levels.
// Threshold to next level: currentLevel * 100. Level up: +10 max HP, +2 atk, +1 def.
router.post('/xp', async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 500) {
    return res.status(400).json({ error: 'XP amount must be an integer between 1 and 500' });
  }
  try {
    const { stats, levelsGained } = await awardXp(sql, req.player.id, amount);
    res.json({ stats, levelsGained });
  } catch (err) {
    console.error('xp failed:', err);
    res.status(500).json({ error: 'Could not award XP' });
  }
});

// Sync HP after combat (clamped server-side).
router.post('/hp', async (req, res) => {
  const hp = Number(req.body?.hp);
  if (!Number.isInteger(hp)) {
    return res.status(400).json({ error: 'hp must be an integer' });
  }
  try {
    const [updated] = await sql`
      UPDATE player_stats
      SET hp = LEAST(GREATEST(${hp}, 0), max_hp)
      WHERE player_id = ${req.player.id}
      RETURNING *
    `;
    res.json({ stats: updated });
  } catch (err) {
    console.error('hp failed:', err);
    res.status(500).json({ error: 'Could not update HP' });
  }
});

// Gold from loot drops (small amounts only; purchases go through POST /inventory).
router.post('/gold', async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 200) {
    return res.status(400).json({ error: 'Gold amount must be an integer between 1 and 200' });
  }
  try {
    const [updated] = await sql`
      UPDATE player_stats SET gold = gold + ${amount}
      WHERE player_id = ${req.player.id}
      RETURNING *
    `;
    res.json({ stats: updated });
  } catch (err) {
    console.error('gold failed:', err);
    res.status(500).json({ error: 'Could not add gold' });
  }
});

router.get('/inventory', async (req, res) => {
  try {
    const items = await sql`
      SELECT id, item_name, item_type, slot, equipped, stats
      FROM inventory WHERE player_id = ${req.player.id}
      ORDER BY id
    `;
    res.json({ items });
  } catch (err) {
    console.error('inventory failed:', err);
    res.status(500).json({ error: 'Could not load inventory' });
  }
});

// Add an item — on loot (no price) or purchase (price deducted from gold).
router.post('/inventory', async (req, res) => {
  const { item_name, item_type, slot, stats, price } = req.body || {};
  if (!item_name || typeof item_name !== 'string' || item_name.length > 60) {
    return res.status(400).json({ error: 'item_name required' });
  }
  if (!ITEM_TYPES.includes(item_type)) {
    return res.status(400).json({ error: `item_type must be one of: ${ITEM_TYPES.join(', ')}` });
  }
  if (slot != null && !SLOTS.includes(slot)) {
    return res.status(400).json({ error: `slot must be one of: ${SLOTS.join(', ')}` });
  }

  try {
    if (price != null) {
      const cost = Number(price);
      if (!Number.isInteger(cost) || cost < 0 || cost > 10000) {
        return res.status(400).json({ error: 'Invalid price' });
      }
      const [paid] = await sql`
        UPDATE player_stats SET gold = gold - ${cost}
        WHERE player_id = ${req.player.id} AND gold >= ${cost}
        RETURNING gold
      `;
      if (!paid) return res.status(400).json({ error: 'Not enough gold' });
    }
    const [item] = await sql`
      INSERT INTO inventory (player_id, item_name, item_type, slot, stats)
      VALUES (${req.player.id}, ${item_name}, ${item_type}, ${slot || null},
              ${stats ? JSON.stringify(stats) : null})
      RETURNING id, item_name, item_type, slot, equipped, stats
    `;
    res.status(201).json({ item });
  } catch (err) {
    console.error('add item failed:', err);
    res.status(500).json({ error: 'Could not add item' });
  }
});

// Equip/unequip toggle. Equipping unequips whatever else is in that slot.
router.post('/equip/:itemId', async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid item id' });
  try {
    const [item] = await sql`
      SELECT * FROM inventory WHERE id = ${itemId} AND player_id = ${req.player.id}
    `;
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!item.slot) return res.status(400).json({ error: 'This item cannot be equipped' });

    if (item.equipped) {
      await sql`UPDATE inventory SET equipped = FALSE WHERE id = ${itemId}`;
    } else {
      await sql`
        UPDATE inventory SET equipped = FALSE
        WHERE player_id = ${req.player.id} AND slot = ${item.slot} AND equipped = TRUE
      `;
      await sql`UPDATE inventory SET equipped = TRUE WHERE id = ${itemId}`;
    }
    const items = await sql`
      SELECT id, item_name, item_type, slot, equipped, stats
      FROM inventory WHERE player_id = ${req.player.id}
      ORDER BY id
    `;
    res.json({ items });
  } catch (err) {
    console.error('equip failed:', err);
    res.status(500).json({ error: 'Could not equip item' });
  }
});

// Consume/discard an item (e.g. drinking a Health Potion).
router.delete('/inventory/:itemId', async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid item id' });
  try {
    const [deleted] = await sql`
      DELETE FROM inventory WHERE id = ${itemId} AND player_id = ${req.player.id}
      RETURNING id
    `;
    if (!deleted) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete item failed:', err);
    res.status(500).json({ error: 'Could not remove item' });
  }
});

export default router;
