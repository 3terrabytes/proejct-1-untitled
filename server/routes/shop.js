// Fixed-price shop. Prices come from the server-side catalogue, so the
// client can't make up its own numbers. (Haggling with the LLM merchant
// still goes through POST /api/player/inventory with a quoted price.)
import { Router } from 'express';
import { sql } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getItem, getNpcById } from '../lib/catalog.js';

const router = Router();
router.use(requireAuth);

const SELL_RATE = 0.5; // shops buy back at half price

router.post('/buy', async (req, res) => {
  const { npcId, item: itemName } = req.body || {};
  const npc = getNpcById(npcId);
  if (!npc?.sells) return res.status(404).json({ error: 'That NPC has no shop' });

  const item = getItem(itemName);
  if (!item || !npc.sells.some((s) => s.toLowerCase() === item.name.toLowerCase())) {
    return res.status(400).json({ error: `${npc.name} does not sell that` });
  }

  try {
    const [paid] = await sql`
      UPDATE player_stats SET gold = gold - ${item.price}
      WHERE player_id = ${req.player.id} AND gold >= ${item.price}
      RETURNING gold
    `;
    if (!paid) return res.status(400).json({ error: 'Not enough gold' });

    const [bought] = await sql`
      INSERT INTO inventory (player_id, item_name, item_type, slot, stats)
      VALUES (${req.player.id}, ${item.name}, ${item.type}, ${item.slot},
              ${item.stats ? JSON.stringify(item.stats) : null})
      RETURNING id, item_name, item_type, slot, equipped, stats
    `;
    res.status(201).json({ item: bought, gold: paid.gold });
  } catch (err) {
    console.error('shop buy failed:', err);
    res.status(500).json({ error: 'Could not buy item' });
  }
});

router.post('/sell', async (req, res) => {
  const itemId = Number(req.body?.itemId);
  if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid item id' });

  try {
    const [owned] = await sql`
      SELECT * FROM inventory WHERE id = ${itemId} AND player_id = ${req.player.id}
    `;
    if (!owned) return res.status(404).json({ error: 'Item not found' });

    const catalogItem = getItem(owned.item_name);
    const value = Math.floor((catalogItem?.price ?? 0) * SELL_RATE);
    if (value <= 0) return res.status(400).json({ error: 'No one wants to buy that' });

    await sql`DELETE FROM inventory WHERE id = ${itemId}`;
    const [stats] = await sql`
      UPDATE player_stats SET gold = gold + ${value}
      WHERE player_id = ${req.player.id}
      RETURNING gold
    `;
    res.json({ sold: owned.item_name, value, gold: stats.gold });
  } catch (err) {
    console.error('shop sell failed:', err);
    res.status(500).json({ error: 'Could not sell item' });
  }
});

export default router;
