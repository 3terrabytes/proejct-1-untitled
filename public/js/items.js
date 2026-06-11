// Item catalogue — loaded from /js/items.json, the same file the server
// reads, so names, stats and prices always agree.

export let ITEMS = {};

export async function loadItems() {
  const res = await fetch('/js/items.json');
  if (!res.ok) throw new Error('Could not load item catalogue');
  ITEMS = await res.json();
}

// Case-insensitive lookup so LLM-quoted names like "iron shield" still match.
export function catalogEntry(name) {
  const key = Object.keys(ITEMS).find(
    (k) => k.toLowerCase() === String(name).toLowerCase()
  );
  if (!key) return null;
  const item = ITEMS[key];
  return {
    item_name: key,
    item_type: item.type,
    slot: item.slot,
    stats: item.stats,
    price: item.price
  };
}

export function sellValue(name) {
  const entry = catalogEntry(name);
  return entry ? Math.floor(entry.price * 0.5) : 0;
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
