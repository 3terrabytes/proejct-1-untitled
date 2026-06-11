// Catalogue of known items: type, equip slot and stat bonuses.
// Merchants quote prices via Groq; the mechanical item data lives here.

export const ITEM_CATALOG = {
  'Rusty Sword': { item_type: 'weapon', slot: 'mainhand', stats: { attack: 2 } },
  'Iron Sword': { item_type: 'weapon', slot: 'mainhand', stats: { attack: 5 } },
  'Rusty Dagger': { item_type: 'weapon', slot: 'mainhand', stats: { attack: 3 } },
  'Cloth Tunic': { item_type: 'armour', slot: 'chest', stats: { defence: 1 } },
  'Leather Armour': { item_type: 'armour', slot: 'chest', stats: { defence: 3 } },
  'Iron Shield': { item_type: 'armour', slot: 'offhand', stats: { defence: 4 } },
  'Health Potion': { item_type: 'consumable', slot: null, stats: { heal: 30 } },
  'Goblin Ear': { item_type: 'misc', slot: null, stats: null }
};

export function catalogEntry(name) {
  // Case-insensitive lookup so LLM-quoted names like "iron shield" still match.
  const key = Object.keys(ITEM_CATALOG).find(
    (k) => k.toLowerCase() === String(name).toLowerCase()
  );
  return key ? { item_name: key, ...ITEM_CATALOG[key] } : null;
}

// Sum of stat bonuses from equipped items.
export function equipmentBonuses(items) {
  const bonus = { attack: 0, defence: 0 };
  for (const item of items) {
    if (!item.equipped || !item.stats) continue;
    bonus.attack += item.stats.attack || 0;
    bonus.defence += item.stats.defence || 0;
  }
  return bonus;
}
